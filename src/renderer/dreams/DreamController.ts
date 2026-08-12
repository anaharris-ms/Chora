import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { Dream, DreamSignal, SourceSelection } from "../../shared/dreams/DreamTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { CompareSelections, IsSelectionWithin, MergeSelections } from "../../shared/library/SelectionService.js";
import { DreamGateway } from "./DreamGateway.js";
import { DreamStore, type DreamChange, type DreamSaveState } from "./DreamStore.js";

export class DreamController
{
	private static readonly AutosaveDelayMilliseconds = 750;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	private activeSave: Promise<void> | null = null;

	public constructor(private readonly events: ChoraEventBus<ChoraEvents>, private readonly errors: ErrorManager, private readonly library: LibraryStore, private readonly store: DreamStore, private readonly gateway: DreamGateway)
	{
		this.events.Subscribe("dream.create-requested", (event) => this.Create(event.selection));
		this.events.Subscribe("dream.signal-add-requested", (event) => this.AddSignal(event.selection));
		this.events.Subscribe("dream.source-extend-requested", (event) => this.ExtendSource(event.selection));
	}

	public async StartAsync(): Promise<void>
	{
		try
		{
			await this.RefreshAsync();
			const activeDream = this.store.GetActiveDream();
			if (activeDream !== null)
			{
				await this.events.PublishAsync("dream.opened", { dream: activeDream });
				if (this.store.GetIsDirty()) this.ScheduleAutosave();
			}
		}
		catch (error)
		{
			this.errors.Report("DreamController", error, "Unable to load Dreams.");
		}
	}

	public async RefreshAsync(): Promise<void>
	{
		try
		{
			const catalogue = await this.gateway.ListAsync();
			this.store.SetCatalogue(catalogue);
			await this.events.PublishAsync("dream.catalogue-changed", { count: catalogue.length });
		}
		catch (error)
		{
			this.errors.Report("DreamController", error, "Unable to refresh Dreams.");
		}
	}

	public CreateFromCurrentSelection(): void
	{
		const selection = this.library.GetContextSelection();

		if (selection !== null) this.Create(selection);
		else this.errors.Report("DreamController", new Error("No passage available."), "Open a text to begin a Dream.");
	}

	public Create(selection: TextSelection): void
	{
		const document = this.library.GetText();

		if (document !== null)
		{
			const timestamp = new Date().toISOString();
			const startIndex = document.segments.findIndex((segment) => segment.key === selection.start.segmentKey);
			const endIndex = document.segments.findIndex((segment) => segment.key === selection.end.segmentKey);
			const dream: Dream = {
				id: crypto.randomUUID(), workId: document.id, dialogue: document.title, title: "",
				source: { ...selection, sourceRefs: document.segments.slice(startIndex, endIndex + 1).map((segment) => segment.key), startSourceRef: selection.start.segmentKey, endSourceRef: selection.end.segmentKey, division: document.segments[startIndex]?.division ?? null },
				signals: [], reflection: "", linkedDreamIds: [], createdAt: timestamp, updatedAt: timestamp
			};
			this.store.Open(dream, true);
			void this.events.PublishAsync("dream.opened", { dream });
		}
	}

	public Open(dreamId: string): void
	{
		const dream = this.store.GetCatalogue().find((item) => item.id === dreamId) ?? null;

		if (dream !== null)
		{
			if (this.library.GetText()?.id !== dream.workId) void this.events.PublishAsync("library.text-open-requested", { textId: dream.workId });
			const openedDream = structuredClone(dream);
			this.store.Open(openedDream, false);
			void this.events.PublishAsync("dream.opened", { dream: openedDream });
		}
	}

	public async CloseAsync(): Promise<void>
	{
		this.CancelAutosave();
		if (this.store.GetIsDirty()) await this.SaveAsync();

		if (!this.store.GetIsDirty())
		{
			this.store.Close();
			await this.events.PublishAsync("dream.closed", {});
			await this.RefreshAsync();
		}
	}

	public async DeleteAsync(): Promise<void>
	{
		const dream = this.store.GetActiveDream();
		this.CancelAutosave();

		if (dream !== null)
		{
			try
			{
				const pendingSave = this.activeSave;
				if (pendingSave !== null)
				{
					await pendingSave;
					if (this.activeSave === pendingSave) this.activeSave = null;
				}
				await this.gateway.DeleteAsync(dream.id);
				this.store.Close();
				await this.events.PublishAsync("dream.closed", {});
				await this.RefreshAsync();
			}
			catch (error)
			{
				this.errors.Report("DreamController", error, "Unable to delete the Dream.");
			}
		}
	}

	public UpdateTitle(value: string): void
	{
		const change = this.store.UpdateTitle(value);
		this.HandleDreamChange(change);
	}

	public UpdateExegesis(value: string): void
	{
		const change = this.store.UpdateReflection(value);
		this.HandleDreamChange(change);
	}

	public RemoveSignal(signalId: string): void
	{
		const dream = this.store.GetActiveDream();
		const signals = dream?.signals.filter((signal) => signal.id !== signalId) ?? [];
		const change = dream === null ? null : this.store.ReplaceSignals(signals);

		this.HandleDreamChange(change);
		if (change !== null) void this.events.PublishAsync("dream.structure-changed", { dreamId: change.dream.id });
	}

	public UpdateSignal(signalId: string, value: string): void
	{
		const change = this.store.UpdateSignalDescription(signalId, value);
		this.HandleDreamChange(change);
	}

	public AddSignal(selection: TextSelection): void
	{
		const dream = this.store.GetActiveDream();
		const document = this.library.GetText();

		if (dream !== null && document !== null && document.id === dream.workId && IsSelectionWithin(document, selection, dream.source))
		{
			const isDuplicate = dream.signals.some((signal) => signal.selection.start.segmentKey === selection.start.segmentKey && signal.selection.start.offset === selection.start.offset && signal.selection.end.segmentKey === selection.end.segmentKey && signal.selection.end.offset === selection.end.offset);

			if (!isDuplicate)
			{
				const signal: DreamSignal = {
					id: crypto.randomUUID(),
					sourceRef: selection.locatorStart?.value ?? selection.start.segmentKey,
					selection,
					text: selection.selectedText,
					description: ""
				};
				const signals = [...dream.signals, signal];
				signals.sort((first, second) => CompareSelections(document, first.selection, second.selection));
				const change = this.store.ReplaceSignals(signals);
				this.HandleDreamChange(change);
				if (change !== null) void this.events.PublishAsync("dream.signal-added", { dreamId: change.dream.id, signalId: signal.id });
			}
		}
	}

	public ExtendSource(selection: TextSelection): void
	{
		const dream = this.store.GetActiveDream();
		const document = this.library.GetText();

		if (dream !== null && document !== null && selection.documentId === dream.workId && document.id === dream.workId)
		{
			const merged = MergeSelections(document, dream.source, selection);
			const startIndex = document.segments.findIndex((segment) => segment.key === merged.start.segmentKey);
			const endIndex = document.segments.findIndex((segment) => segment.key === merged.end.segmentKey);
			const source: SourceSelection = {
				...dream.source,
				...merged,
				sourceRefs: document.segments.slice(startIndex, endIndex + 1).map((segment) => segment.key),
				startSourceRef: merged.start.segmentKey,
				endSourceRef: merged.end.segmentKey,
				division: document.segments[startIndex]?.division ?? dream.source.division ?? null
			};
			const change = this.store.ReplaceSource(source);
			this.HandleDreamChange(change);
			if (change !== null) void this.events.PublishAsync("dream.structure-changed", { dreamId: change.dream.id });
		}
	}

	public async SaveAsync(): Promise<void>
	{
		this.CancelAutosave();

		if (this.activeSave === null)
		{
			this.activeSave = this.PerformSaveAsync();
			await this.activeSave;
			this.activeSave = null;
		}
		else await this.activeSave;

		if (this.store.GetIsDirty() && this.store.GetSaveState() !== "error" && this.activeSave === null)
		{
			this.activeSave = this.PerformSaveAsync();
			await this.activeSave;
			this.activeSave = null;
		}

		if (this.store.GetIsDirty() && this.store.GetSaveState() !== "error") this.ScheduleAutosave();
	}

	public async HandleSourceSelectionAsync(selection: TextSelection): Promise<void>
	{
		const action = await this.gateway.ShowSourceContextMenuAsync();
		if (action === "add-dream-source-signal") await this.events.PublishAsync("dream.signal-add-requested", { selection });
		if (action === "copy-dream-source") await this.gateway.CopyAsync(selection.selectedText);
	}

	// Coordinates events and autosave after a store-owned Dream mutation.
	private HandleDreamChange(change: DreamChange | null): void
	{
		if (change !== null)
		{
			if (change.becameDirty)
			{
				void this.events.PublishAsync("dream.changed", { dreamId: change.dream.id, isDirty: true });
			}
			this.ScheduleAutosave();
		}
	}

	private async PerformSaveAsync(): Promise<void>
	{
		const activeDream = this.store.GetActiveDream();

		if (activeDream !== null)
		{
			const revision = this.store.GetRevision();
			const dream = structuredClone(activeDream);
			dream.updatedAt = new Date().toISOString();
			this.SetSaveState("saving");

			try
			{
				const savedDream = await this.gateway.SaveAsync(dream);
				const catalogue = await this.gateway.ListAsync();
				this.store.SetCatalogue(catalogue);
				this.store.MarkSaved(savedDream, revision);
				await this.events.PublishAsync("dream.saved", { dream: savedDream });
			}
			catch (error)
			{
				this.SetSaveState("error");
				this.errors.Report("DreamController", error, "Unable to save the Dream.");
			}
		}
	}

	private ScheduleAutosave(): void
	{
		this.CancelAutosave();
		this.autosaveTimer = setTimeout(() =>
		{
			this.autosaveTimer = null;
			void this.SaveAsync();
		}, DreamController.AutosaveDelayMilliseconds);
	}

	private CancelAutosave(): void
	{
		if (this.autosaveTimer !== null)
		{
			clearTimeout(this.autosaveTimer);
			this.autosaveTimer = null;
		}
	}

	private SetSaveState(state: DreamSaveState): void
	{
		this.store.SetSaveState(state);
		void this.events.PublishAsync("dream.save-state-changed", { state });
	}
}
