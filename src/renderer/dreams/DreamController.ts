import type { LibraryText } from "../../shared/library/LibraryTypes.js";
import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { Dream, DreamSignal, SourceSelection } from "../../shared/dreams/DreamTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { CompareSelections, IsSelectionWithin, MergeSelections } from "../../shared/library/SelectionService.js";
import { CreateDreamSourceSelection } from "./SourceSelection.js";
import { DreamMarkdownExport } from "../../shared/dreams/DreamMarkdownExport.js";
import { DreamGateway } from "./DreamGateway.js";
import { DreamStore, type DreamChange, type DreamSaveState, type DreamTab } from "./DreamStore.js";

// Fields of a SourceSelection derived from a document span, independent of the reader's raw selection.
type DerivedSourceFields = Pick<SourceSelection, "sourceRefs" | "startSourceRef" | "endSourceRef" | "division">;

// A division of a document (e.g. "Book 4"), used to place a Dream in the catalogue.
type DreamDivision = { kind: string; value: string };

// A group of catalogue Dreams presented under one division heading, or one ungrouped list when no division data exists.
export interface DreamCatalogueGroup
{
	// Display heading for the group, or empty when Dreams are not grouped by division.
	readonly label: string;
	// Identifier of the book division this group belongs to, or null when this is not a book-level group.
	readonly book: string | null;
	// Dreams belonging to this group, already ordered by source position.
	readonly dreams: readonly Dream[];
}

// Coordinates Dream workflows between the reader's catalogue, the active editing session, and the main process.
export class DreamController
{
	// Delay before an idle mutation triggers an automatic save.
	private static readonly AutosaveDelayMilliseconds = 750;
	// Pending autosave timer, or null when nothing is scheduled.
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	// The save currently writing to disk, or null when no save is in flight.
	private activeSave: Promise<void> | null = null;
	// Set while a delete is in progress so a concurrent save cannot resurrect the Dream.
	private isDeleting = false;

	// Creates the controller and subscribes to the application events it coordinates.
	public constructor(
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly errors: ErrorManager,
		private readonly library: LibraryStore,
		private readonly store: DreamStore,
		private readonly gateway: DreamGateway)
	{
		this.events.Subscribe("dream.create-requested", this.HandleCreateRequested.bind(this));
		this.events.Subscribe("dream.signal-add-requested", this.HandleSignalAddRequested.bind(this));
		this.events.Subscribe("dream.source-extend-requested", this.HandleSourceExtendRequested.bind(this));
		this.events.Subscribe("dream.passage-filter-requested", this.HandlePassageFilterRequestedAsync.bind(this));
		this.events.Subscribe("library.text-opened", this.HandleFilterTextOpenedAsync.bind(this));
	}

	// Resolves a clicked passage against the current work before applying its source filter.
	private async HandlePassageFilterRequestedAsync(event: ChoraEvents["dream.passage-filter-requested"]): Promise<void>
	{
		const document = this.library.GetText();
		if (document !== null && document.id === event.workId)
		{
			for (const segment of document.segments)
			{
				if (segment.key === event.segmentKey && segment.locator !== null)
				{
					const label = `${document.title} · ${segment.locator.value}`;
					this.store.SetPassageFilter({ workId: document.id, segmentKey: segment.key, label });
					this.store.SetSearchText("");
					await this.events.PublishAsync("dream.passage-filter-changed", {});
					break;
				}
			}
		}
	}

	// Refreshes the catalogue and removes stale filters when a text opens.
	private async HandleFilterTextOpenedAsync(): Promise<void>
	{
		this.store.SetSearchText("");
		const filter = this.store.GetPassageFilter();
		const text = this.library.GetText();
		if (filter !== null && filter.workId !== text?.id)
		{
			await this.ClearPassageFilterAsync();
		}
		await this.RefreshAsync();
	}

	// Clears source filtering while retaining any keyword query entered within it.
	public async ClearPassageFilterAsync(): Promise<void>
	{
		this.store.SetPassageFilter(null);
		await this.events.PublishAsync("dream.passage-filter-changed", {});
	}

	// Supplies per-passage counts for the reading pane without exposing catalogue ownership.
	public GetPassageCounts(): ReadonlyMap<string, number>
	{
		const document = this.library.GetText();
		let counts: ReadonlyMap<string, number> = new Map<string, number>();
		if (document !== null)
		{
			counts = this.store.GetPassageCounts(document);
		}
		return counts;
	}

	// Loads the catalogue and reopens any Dream restored from a prior session.
	public async StartAsync(): Promise<void>
	{
		try
		{
			await this.RefreshAsync();
			const activeDream = this.store.GetActiveDream();

			if (activeDream !== null)
			{
				await this.events.PublishAsync("dream.opened", {});
				if (this.store.GetIsDirty()) this.ScheduleAutosave();
			}
		}
		catch (error)
		{
			this.errors.Report("DreamController", error, "Unable to load Dreams.");
		}
	}

	// Reloads the Dream catalogue from the main process and publishes a change notice when it differs.
	public async RefreshAsync(): Promise<void>
	{
		try
		{
			const catalogue = await this.gateway.ListAsync();
			const hasChanged = JSON.stringify(this.store.GetCatalogue()) !== JSON.stringify(catalogue);

			if (hasChanged)
			{
				this.store.SetCatalogue(catalogue);
				await this.events.PublishAsync("dream.catalogue-changed", { count: catalogue.length });
			}
		}
		catch (error)
		{
			this.errors.Report("DreamController", error, "Unable to refresh Dreams.");
		}
	}

	// Creates a new Dream from the reader's current passage selection, or reports why none is available.
	public async CreateFromCurrentSelection(): Promise<void>
	{
		const selection = this.library.GetContextSelection();

		if (selection !== null) await this.Create(selection);
		else this.errors.Report("DreamController", new Error("No passage available."), "Open a text to begin a Dream.");
	}

	// Opens a new, unsaved Dream anchored to the given passage selection.
	public async Create(selection: TextSelection): Promise<void>
	{
		const document = this.library.GetText();

		if (document !== null)
		{
			const timestamp = new Date().toISOString();
			const derivedFields = this.DeriveSourceFields(document, selection.start, selection.end, null);
			const source: SourceSelection = { ...selection, ...derivedFields };
			const id = await this.gateway.AllocateIdAsync();
			const dream: Dream = {
				id,
				workId: document.id,
				dialogue: document.title,
				title: "",
				source,
				signals: [],
				reflection: "",
				linkedDreamIds: [],
				createdAt: timestamp,
				updatedAt: timestamp
			};

			this.store.Open(dream, true);
			void this.events.PublishAsync("dream.opened", {});
		}
	}

	// Opens an existing Dream from the catalogue for editing.
	public Open(dreamId: string): void
	{
		const dream = this.OpenDream(dreamId);

		if (dream !== null) void this.events.PublishAsync("dream.opened", {});
	}

	// Opens a Dream, then reveals one specific signal.
	public async OpenSignalAsync(dreamId: string, signalId: string): Promise<void>
	{
		const dream = this.OpenDream(dreamId);

		if (dream !== null)
		{
			await this.events.PublishAsync("dream.opened", {});
			await this.events.PublishAsync("dream.signal-focus-requested", { dreamId, signalId });
		}
	}

	// Returns an immutable snapshot of the active Dream, or null when none is open.
	public GetActiveDream(): Dream | null
	{
		const dream = this.store.GetActiveDream();

		return dream;
	}

	// Returns ordered descriptors for the open Dream editor tabs.
	public GetOpenTabs(): readonly DreamTab[]
	{
		const tabs = this.store.GetOpenTabs();

		return tabs;
	}

	// Remembers the selected Signal within one Dream tab.
	public RememberSelectedSignal(dreamId: string, signalId: string | null): void
	{
		this.store.SetSelectedSignal(dreamId, signalId);
	}

	// Returns the Signal selection remembered within one Dream tab.
	public GetSelectedSignal(dreamId: string): string | null
	{
		const signalId = this.store.GetSelectedSignal(dreamId);

		return signalId;
	}

	// Remembers the selected inner editor tab for one Dream.
	public RememberEditorTab(dreamId: string, tabId: string): void
	{
		this.store.SetEditorTab(dreamId, tabId);
	}

	// Returns the selected inner editor tab remembered for one Dream.
	public GetEditorTab(dreamId: string): string
	{
		const tabId = this.store.GetEditorTab(dreamId);

		return tabId;
	}

	// Opens a Dream from the catalogue into the active editing session, without publishing that it opened.
	private OpenDream(dreamId: string): Dream | null
	{
		const dream = this.FindCatalogueDream(dreamId);
		let opened: Dream | null = null;

		if (dream !== null)
		{
			opened = structuredClone(dream);
			this.store.Open(opened, false);
			const navigation = this.NavigateToDreamSourceAsync(opened);
			void navigation;
		}

		return opened;
	}

	// Saves unsaved changes, then closes the active Dream editing session.
	public async CloseAsync(): Promise<void>
	{
		this.CancelAutosave();
		if (this.store.GetIsDirty()) await this.SaveAsync();

		if (!this.store.GetIsDirty())
		{
			this.store.Close();
			const next = this.store.GetActiveDream();
			if (next === null) await this.events.PublishAsync("dream.closed", {});
			else
			{
				await this.NavigateToDreamSourceAsync(next);
				await this.events.PublishAsync("dream.opened", {});
			}
			await this.RefreshAsync();
		}
	}

	// Activates one open Dream tab through the normal open workflow.
	public ActivateTab(dreamId: string): void
	{
		const dream = this.store.ActivateTab(dreamId);
		if (dream !== null)
		{
			const navigation = this.NavigateToDreamSourceAsync(dream);
			void navigation;
			void this.events.PublishAsync("dream.opened", {});
		}
	}

	// Activates and closes one Dream tab, saving it first when necessary.
	public async CloseTabAsync(dreamId: string): Promise<void>
	{
		const activeId = this.store.GetActiveDream()?.id;
		let canClose = activeId === dreamId;
		if (!canClose)
		{
			const dream = this.store.ActivateTab(dreamId);
			canClose = dream !== null;
			if (dream !== null) await this.NavigateToDreamSourceAsync(dream);
		}
		if (canClose) await this.CloseAsync();
	}

	// Opens the owning text and moves the reader to the Dream's source passage.
	private async NavigateToDreamSourceAsync(dream: Dream): Promise<void>
	{
		if (this.library.GetText()?.id !== dream.workId)
		{
			await this.events.PublishAsync("library.text-open-requested", { textId: dream.workId });
		}
		await this.events.PublishAsync("library.jump-requested", { selection: dream.source });
	}

	// Deletes the active Dream after any in-flight save completes.
	public async DeleteAsync(): Promise<void>
	{
		const dream = this.store.GetActiveDream();

		if (dream !== null)
		{
			const dreamId = dream.id;
			this.isDeleting = true;
			this.CancelAutosave();
			this.store.Close();

			try
			{
				await this.WaitForActiveSaveAsync();
				await this.gateway.DeleteAsync(dreamId);
				await this.events.PublishAsync("dream.closed", {});
				await this.RefreshAsync();
			}
			catch (error)
			{
				this.errors.Report("DreamController", error, "Unable to delete the Dream.");
			}
			finally
			{
				this.isDeleting = false;
			}
		}
	}

	// Waits for a save that is already writing to disk so a delete cannot race its write.
	private async WaitForActiveSaveAsync(): Promise<void>
	{
		const pendingSave = this.activeSave;

		if (pendingSave !== null)
		{
			await pendingSave;
			if (this.activeSave === pendingSave) this.activeSave = null;
		}
	}

	// Requests a conversation for an existing signal without sending a message.
	public ChatWithSignal(signalId: string): void
	{
		const dream = this.store.GetActiveDream();
		if (dream !== null)
		{
			for (const signal of dream.signals)
			{
				if (signal.id === signalId)
				{
					void this.events.PublishAsync("chat.signal-requested", { dreamId: dream.id, signalId });
					break;
				}
			}
		}
	}

	// Saves current Dream edits before opening the unified Add to Idea workflow.
	public async AddSignalToIdeaAsync(signalId: string): Promise<void>
	{
		const dream = this.store.GetActiveDream();
		const ownsSignal = dream !== null && this.HasSignal(dream, signalId);

		if (dream !== null && ownsSignal)
		{
			await this.SaveAsync();
			const saveSucceeded = this.store.GetSaveState() !== "error";

			if (saveSucceeded)
			{
				const event = { dreamId: dream.id, signalId };
				await this.events.PublishAsync("idea.add-signal-requested", event);
			}
		}
	}

	// Determines whether one Dream owns the submitted Signal identity.
	private HasSignal(dream: Dream, signalId: string): boolean
	{
		let ownsSignal = false;

		for (const signal of dream.signals)
		{
			if (signal.id === signalId)
			{
				ownsSignal = true;
			}
		}

		return ownsSignal;
	}

	// Updates the active Dream title and schedules an autosave.
	public UpdateTitle(value: string): void
	{
		const change = this.store.UpdateTitle(value);
		this.HandleDreamChange(change);
	}

	// Updates the active Dream exegesis and schedules an autosave.
	public UpdateExegesis(value: string): void
	{
		const change = this.store.UpdateReflection(value);
		this.HandleDreamChange(change);
	}

	// Removes one signal from the active Dream and schedules an autosave.
	public RemoveSignal(signalId: string): void
	{
		const dream = this.store.GetActiveDream();
		const signals = this.FilterOutSignal(dream, signalId);
		const change = dream === null ? null : this.store.ReplaceSignals(signals);

		this.HandleDreamChange(change);
		if (change !== null) void this.events.PublishAsync("dream.structure-changed", { dreamId: change.dream.id });
	}

	// Updates one signal's description and schedules an autosave.
	public UpdateSignal(signalId: string, value: string): void
	{
		const change = this.store.UpdateSignalDescription(signalId, value);
		this.HandleDreamChange(change);
	}

	// Adds a signal for the given passage selection when it lies within the Dream's source and is not a duplicate.
	public async AddSignal(selection: TextSelection): Promise<void>
	{
		const dream = this.store.GetActiveDream();
		const document = this.library.GetText();

		if (dream === null)
		{
			this.errors.Report("DreamController", new Error("No active Dream."), "Open a Dream before adding a signal.");
		}
		else if (document === null || document.id !== dream.workId || !IsSelectionWithin(document, selection, dream.source))
		{
			this.errors.Report("DreamController", new Error("Selection outside the Dream's source passage."), "Select text within the Dream's passage to add a signal.");
		}
		else if (!this.HasDuplicateSignal(dream.signals, selection))
		{
			const id = await this.gateway.AllocateIdAsync();
			const signal: DreamSignal = {
				id,
				sourceRef: selection.locatorStart?.value ?? selection.start.segmentKey,
				selection,
				text: selection.selectedText,
				description: ""
			};
			const signals = [...dream.signals, signal];

			signals.sort(this.CompareSignalsBySelection.bind(this, document));
			const change = this.store.ReplaceSignals(signals);
			this.HandleDreamChange(change);

			if (change !== null)
			{
				const event = {
					dreamId: change.dream.id,
					signalId: signal.id
				};
				await this.events.PublishAsync("dream.signal-added", event);
			}
		}
	}

	// Extends the active Dream's source passage to include the given selection.
	public ExtendSource(selection: TextSelection): void
	{
		const dream = this.store.GetActiveDream();
		const document = this.library.GetText();

		if (dream === null)
		{
			this.errors.Report("DreamController", new Error("No active Dream."), "Open a Dream before extending its source passage.");
		}
		else if (document === null || selection.documentId !== dream.workId || document.id !== dream.workId)
		{
			this.errors.Report("DreamController", new Error("Selection outside the Dream's text."), "Select text in the Dream's own text to extend its passage.");
		}
		else
		{
			const merged = MergeSelections(document, dream.source, selection);
			const derivedFields = this.DeriveSourceFields(document, merged.start, merged.end, dream.source.division ?? null);
			const source: SourceSelection = { ...dream.source, ...merged, ...derivedFields };
			const change = this.store.ReplaceSource(source);

			this.HandleDreamChange(change);
			if (change !== null) void this.events.PublishAsync("dream.structure-changed", { dreamId: change.dream.id });
		}
	}

	// Saves the active Dream, then saves once more if a concurrent edit left it dirty, then reschedules autosave.
	public async SaveAsync(): Promise<void>
	{
		this.CancelAutosave();
		await this.RunPendingSaveAsync();
		await this.RunCatchUpSaveIfDirtyAsync();

		if (this.store.GetIsDirty() && this.store.GetSaveState() !== "error") this.ScheduleAutosave();
	}

	public async CopyDreamAsMarkdownAsync(): Promise<void>
	{
		const dream = this.store.GetActiveDream();

		if (dream === null)
		{
			throw new Error("The active Dream is no longer available.");
		}
		else
		{
			const markdown = DreamMarkdownExport.Serialize(dream);
			await this.gateway.CopyAsync(markdown);
		}
	}

	// Returns the reader's visible Dream catalogue, grouped by division when division data is available.
	public GetCatalogueGroups(searchText: string): DreamCatalogueGroup[]
	{
		const document = this.library.GetText();
		const dreams = this.store.GetVisibleCatalogue(searchText, document);
		const divisions = this.FindDivisions(dreams);
		const hasDivisions = this.HasAnyDivision(divisions);
		let groups: DreamCatalogueGroup[] = [];

		if (dreams.length > 0) groups = hasDivisions ? this.GroupByDivision(dreams, divisions) : [{ label: "", book: null, dreams }];

		return groups;
	}

	// Shows the source-passage context menu and performs the reader's chosen action.
	public async HandleSourceSelectionAsync(selection: TextSelection): Promise<void>
	{
		const action = await this.gateway.ShowSourceContextMenuAsync();
		if (action === "add-dream-source-signal") await this.events.PublishAsync("dream.signal-add-requested", { selection });
		if (action === "copy-dream-source") await this.gateway.CopyAsync(selection.selectedText);
		if (action === "lookup") await this.gateway.LookUpAsync(selection.selectedText);
	}

	// Builds a document selection from a source-passage offset range, reporting rather than throwing when it is invalid.
	public CreateSourceSelection(document: LibraryText, source: SourceSelection, startOffset: number, endOffset: number): TextSelection | null
	{
		let selection: TextSelection | null = null;

		try
		{
			selection = CreateDreamSourceSelection(document, source, startOffset, endOffset);
		}
		catch (error)
		{
			this.errors.Report("DreamController", error, "Unable to read the selected text.");
		}

		return selection;
	}

	// Coordinates events and autosave after a store-owned Dream mutation.
	private HandleDreamChange(change: DreamChange | null): void
	{
		if (change !== null)
		{
			if (change.becameDirty)
			{
				void this.events.PublishAsync("dream.changed", {});
			}
			this.ScheduleAutosave();
		}
	}

	private async PerformSaveAsync(): Promise<void>
	{
		const activeDream = this.store.GetActiveDream();

		if (activeDream !== null && !this.isDeleting)
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
				await this.events.PublishAsync("dream.saved", {});
			}
			catch (error)
			{
				this.SetSaveState("error");
				const message = error instanceof Error ? error.message : String(error);
				this.errors.Error("DreamController", message, error);
			}
		}
	}

	// Starts an immediate save when none is already in flight, otherwise waits for the one already running.
	private async RunPendingSaveAsync(): Promise<void>
	{
		if (this.activeSave === null)
		{
			this.activeSave = this.PerformSaveAsync();
			await this.activeSave;
			this.activeSave = null;
		}
		else
		{
			await this.activeSave;
		}
	}

	// Saves once more when a concurrent edit left the Dream dirty after the pending save completed.
	private async RunCatchUpSaveIfDirtyAsync(): Promise<void>
	{
		if (this.store.GetIsDirty() && this.store.GetSaveState() !== "error" && this.activeSave === null)
		{
			this.activeSave = this.PerformSaveAsync();
			await this.activeSave;
			this.activeSave = null;
		}
	}

	private ScheduleAutosave(): void
	{
		this.CancelAutosave();
		this.autosaveTimer = setTimeout(this.HandleAutosaveTimer.bind(this), DreamController.AutosaveDelayMilliseconds);
	}

	// Clears the pending autosave timer and starts the deferred save.
	private HandleAutosaveTimer(): void
	{
		this.autosaveTimer = null;
		void this.SaveAsync();
	}

	// Cancels a pending autosave timer, if one is scheduled.
	private CancelAutosave(): void
	{
		if (this.autosaveTimer !== null)
		{
			clearTimeout(this.autosaveTimer);
			this.autosaveTimer = null;
		}
	}

	// Records and publishes a change to the active Dream's save-state lifecycle.
	private SetSaveState(state: DreamSaveState): void
	{
		this.store.SetSaveState(state);
		void this.events.PublishAsync("dream.save-state-changed", {});
	}

	// Routes a create-requested application event to the Dream creation workflow.
	private async HandleCreateRequested(event: ChoraEvents["dream.create-requested"]): Promise<void>
	{
		await this.Create(event.selection);
	}

	// Routes a signal-add-requested application event to the signal workflow.
	private async HandleSignalAddRequested(event: ChoraEvents["dream.signal-add-requested"]): Promise<void>
	{
		await this.AddSignal(event.selection);
	}

	// Routes a source-extend-requested application event to the source-extension workflow.
	private HandleSourceExtendRequested(event: ChoraEvents["dream.source-extend-requested"]): void
	{
		this.ExtendSource(event.selection);
	}

	// Finds a Dream in the catalogue by identity, or null when it is not present.
	private FindCatalogueDream(dreamId: string): Dream | null
	{
		let found: Dream | null = null;

		for (const dream of this.store.GetCatalogue())
		{
			if (dream.id === dreamId)
			{
				found = dream;
				break;
			}
		}

		return found;
	}

	// Finds the division of each Dream, in the same order, using its recorded division or a document lookup.
	private FindDivisions(dreams: readonly Dream[]): (DreamDivision | null)[]
	{
		const divisions: (DreamDivision | null)[] = [];

		for (const dream of dreams) divisions.push(this.FindDivision(dream));

		return divisions;
	}

	// Returns whether any division in the given list is present.
	private HasAnyDivision(divisions: readonly (DreamDivision | null)[]): boolean
	{
		let hasDivision = false;

		for (const division of divisions)
		{
			if (division !== null)
			{
				hasDivision = true;
				break;
			}
		}

		return hasDivision;
	}

	// Returns a Dream's recorded division, falling back to a lookup in its currently open source document.
	private FindDivision(dream: Dream): DreamDivision | null
	{
		let division = dream.source.division ?? null;
		const document = this.library.GetText();

		if (division === null && document?.id === dream.workId) division = this.FindSegmentDivision(document, dream);

		return division;
	}

	// Finds the division of the source segment matching a Dream's start segment key, falling back to its locator.
	private FindSegmentDivision(document: LibraryText, dream: Dream): DreamDivision | null
	{
		let division: DreamDivision | null = null;
		let matched = false;

		for (const segment of document.segments)
		{
			if (segment.key === dream.source.start.segmentKey)
			{
				division = segment.division ?? null;
				matched = true;
				break;
			}
		}

		if (!matched)
		{
			for (const segment of document.segments)
			{
				if (segment.locator?.value === dream.source.locatorStart?.value)
				{
					division = segment.division ?? null;
					break;
				}
			}
		}

		return division;
	}

	// Groups Dreams by owning work and division, preserving each group's first-seen order.
	private GroupByDivision(dreams: readonly Dream[], divisions: readonly (DreamDivision | null)[]): DreamCatalogueGroup[]
	{
		const groups = new Map<string, { label: string; book: string | null; dreams: Dream[] }>();

		for (let index = 0; index < dreams.length; index += 1)
		{
			const dream = dreams[index];
			const division = divisions[index] ?? null;

			if (dream !== undefined)
			{
				const key = division === null ? `${dream.workId}:unplaced` : `${dream.workId}:${division.kind}:${division.value}`;
				let group = groups.get(key);

				if (group === undefined)
				{
					const label = division === null ? "Unplaced" : this.FormatDivisionLabel(division.kind, division.value);
					const book = division?.kind === "book" ? division.value : null;
					group = { label, book, dreams: [] };
					groups.set(key, group);
				}

				group.dreams.push(dream);
			}
		}

		const result: DreamCatalogueGroup[] = [];

		for (const group of groups.values()) result.push(group);

		return result;
	}

	// Formats a division as a reader-facing heading (e.g. "Book 4").
	private FormatDivisionLabel(kind: string, value: string): string
	{
		const kindLabel = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
		const label = `${kindLabel} ${value}`;

		return label;
	}

	// Returns the given Dream's signals with the identified signal removed.
	private FilterOutSignal(dream: Dream | null, signalId: string): DreamSignal[]
	{
		const signals: DreamSignal[] = [];

		for (const signal of dream?.signals ?? [])
		{
			if (signal.id !== signalId) signals.push(signal);
		}

		return signals;
	}

	// Returns whether a signal already exists for the same start and end selection points.
	private HasDuplicateSignal(signals: readonly DreamSignal[], selection: TextSelection): boolean
	{
		let isDuplicate = false;

		for (const signal of signals)
		{
			const matchesStart = signal.selection.start.segmentKey === selection.start.segmentKey && signal.selection.start.offset === selection.start.offset;
			const matchesEnd = signal.selection.end.segmentKey === selection.end.segmentKey && signal.selection.end.offset === selection.end.offset;

			if (matchesStart && matchesEnd)
			{
				isDuplicate = true;
				break;
			}
		}

		return isDuplicate;
	}

	// Orders two signals by their position within the source document.
	private CompareSignalsBySelection(document: LibraryText, first: DreamSignal, second: DreamSignal): number
	{
		const comparison = CompareSelections(document, first.selection, second.selection);

		return comparison;
	}

	// Finds the index of the segment with the given key, or -1 when it is not present.
	private FindSegmentIndex(document: LibraryText, segmentKey: string): number
	{
		let foundIndex = -1;

		for (let index = 0; index < document.segments.length; index += 1)
		{
			if (document.segments[index]?.key === segmentKey)
			{
				foundIndex = index;
				break;
			}
		}

		return foundIndex;
	}

	// Computes the sourceRefs, startSourceRef, endSourceRef, and division for a span within a document.
	private DeriveSourceFields(document: LibraryText, start: TextSelection["start"], end: TextSelection["end"], fallbackDivision: SourceSelection["division"]): DerivedSourceFields
	{
		const startIndex = this.FindSegmentIndex(document, start.segmentKey);
		const endIndex = this.FindSegmentIndex(document, end.segmentKey);
		const sourceRefs: string[] = [];

		for (let index = startIndex; index <= endIndex; index += 1)
		{
			const segment = document.segments[index];
			if (segment !== undefined) sourceRefs.push(segment.key);
		}

		const derivedFields: DerivedSourceFields = {
			sourceRefs,
			startSourceRef: start.segmentKey,
			endSourceRef: end.segmentKey,
			division: document.segments[startIndex]?.division ?? fallbackDivision ?? null
		};

		return derivedFields;
	}
}
