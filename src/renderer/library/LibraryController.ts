import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";
import { ReconstructSelection } from "../../shared/library/SelectionService.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { LibraryGateway } from "./LibraryGateway.js";
import { LibraryStore } from "./LibraryStore.js";

export class LibraryController
{
	public constructor(private readonly events: ChoraEventBus<ChoraEvents>, private readonly errors: ErrorManager, private readonly store: LibraryStore, private readonly gateway: LibraryGateway)
	{
		this.events.Subscribe("library.text-open-requested", (event) => this.OpenAsync(event.textId));
	}

	public async StartAsync(): Promise<void>
	{
		try
		{
			const texts = await this.gateway.ListAsync();
			this.store.SetLibrary(texts);
			const first = texts[0];
			if (first !== undefined) await this.OpenAsync(first.id);
		}
		catch (error)
		{
			this.errors.Report("LibraryController", error, "Unable to load the Library.");
		}
	}

	public async OpenAsync(textId: string): Promise<void>
	{
		try
		{
			const text = await this.gateway.LoadAsync(textId);
			const notice = await this.gateway.GetSourceNoticeAsync(textId);
			this.store.Open(text, notice);
			this.SetFocusSegment(text.segments[0]?.key ?? "");
			await this.events.PublishAsync("library.text-opened", { text, sourceNotice: notice });
		}
		catch (error)
		{
			this.errors.Report("LibraryController", error, "Unable to open the text.");
		}
	}

	public OpenExternal(text: LibraryText): void
	{
		this.store.Open(text, null);
		this.SetFocusSegment(text.segments[0]?.key ?? "");
		void this.events.PublishAsync("library.text-opened", { text, sourceNotice: null });
	}

	public SetSelection(selection: TextSelection | null): void
	{
		const snapshot = this.store.GetSnapshot();
		const previous = snapshot.selection;
		let canonical: TextSelection | null = null;
		if (snapshot.text !== null && selection !== null)
		{
			try
			{
				canonical = ReconstructSelection(snapshot.text, selection);
			}
			catch (error)
			{
				this.errors.Debug("LibraryController", "Ignored an invalid browser selection.", error);
			}
		}
		if (!this.AreSelectionsEqual(previous, canonical))
		{
			this.store.SetSelection(canonical);
			void this.events.PublishAsync("library.selection-changed", { textId: snapshot.text?.id ?? "", hasSelection: canonical !== null });
		}
	}

	public SetFocusSegment(segmentKey: string): void
	{
		const text = this.store.GetSnapshot().text;
		const segment = text?.segments.find((item) => item.key === segmentKey);
		if (text !== null && text !== undefined && segment !== undefined)
		{
			const focus: TextSelection = { documentId: text.id, start: { segmentKey, offset: 0 }, end: { segmentKey, offset: segment.text.length }, selectedText: segment.text, locatorStart: segment.locator, locatorEnd: segment.locator };
			this.store.SetFocus(focus);
			void this.events.PublishAsync("library.focus-changed", { textId: text.id, segmentKey });
		}
	}

	public async HandleSelectionActionAsync(selection: TextSelection): Promise<void>
	{
		const action = await this.gateway.ShowSelectionContextMenuAsync();
		if (action === "create-dream") await this.events.PublishAsync("dream.create-requested", { selection });
		if (action === "add-to-dream") await this.events.PublishAsync("dream.source-extend-requested", { selection });
		if (action === "add-dream-signal") await this.events.PublishAsync("dream.signal-add-requested", { selection });
		if (action === "copy") await this.gateway.CopyAsync(selection.selectedText);
		if (action === "lookup") await this.gateway.LookUpAsync(selection.selectedText);
	}

	private AreSelectionsEqual(first: TextSelection | null, second: TextSelection | null): boolean
	{
		let isEqual = first === null && second === null;
		if (first !== null && second !== null)
		{
			isEqual = first.documentId === second.documentId
				&& first.start.segmentKey === second.start.segmentKey
				&& first.start.offset === second.start.offset
				&& first.end.segmentKey === second.end.segmentKey
				&& first.end.offset === second.end.offset;
		}
		return isEqual;
	}
}
