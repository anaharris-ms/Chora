import type { Dream } from "../../shared/dreams/DreamTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { DreamController, type DreamCatalogueGroup } from "./DreamController.js";
import { DreamStore, type DreamSaveState } from "./DreamStore.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { EscapeHtml } from "../ui/Html.js";
import { PopupPanel } from "../ui/PopupPanel.js";
import { CloseIcon, SaveIcon, TrashIcon, MoreIcon, EditIcon, AddIcon, SearchIcon, OpenIcon } from "../ui/Icons.js";
import { TabControl } from "../ui/TabControl.js";
import { DreamSignalsPanel } from "./DreamSignalsPanel.js";
import { DreamExegesisPanel } from "./DreamExegesisPanel.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { createElement, MessageCircle } from "lucide";

// Which view of the Dream feature this panel instance renders.
type DreamPanelMode = "catalogue" | "editor";

// Renders the Dream catalogue and editor views and translates browser events into controller calls.
export class DreamPanel
{
	// Event-bus subscriptions released when the panel is disposed.
	private readonly subscriptions: Unsubscribe[] = [];
	// Routes editor initialization and cleanup failures through application diagnostics.
	private readonly errors: ErrorManager;
	// Book identifiers currently expanded in the catalogue.
	private readonly expandedBooks = new Set<string>();
	// Persistent tab control for the open Dream.
	private tabs: TabControl | null = null;
	// Signals content owned by the tab control.
	private signalsPanel: DreamSignalsPanel | null = null;
	// Identity of the Dream currently mounted in the editor.
	private mountedDreamId: string | null = null;
	// Popup containing Dream naming and destructive actions.
	private readonly manageSignalsPopup: PopupPanel | null;
	// Popup reviewing every resonance captured on the active Dream.
	private readonly resonancesPopup: PopupPanel | null;

	// Wires up DOM and application-event listeners, then renders the initial view.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly store: DreamStore,
		private readonly controller: DreamController,
		private readonly library: LibraryStore,
		private readonly mode: DreamPanelMode)
	{
		this.errors = new ErrorManager(events);
		this.root.addEventListener("click", this.HandleClick.bind(this));
		this.root.addEventListener("input", this.HandleInput.bind(this));
		this.root.addEventListener("keydown", this.HandleKeyDown.bind(this));
		this.root.addEventListener("contextmenu", this.HandleContextMenuAsync.bind(this));
		this.manageSignalsPopup = mode === "editor" ? new PopupPanel("Rename Dream") : null;
		this.manageSignalsPopup?.OnBodyInput(this.HandleSettingsInput.bind(this));
		this.resonancesPopup = mode === "editor" ? new PopupPanel("Resonances") : null;
		this.resonancesPopup?.OnBodyClick(this.HandleResonancesPopupClick.bind(this));
		this.subscriptions.push(this.events.Subscribe("dream.signal-focus-requested", this.HandleSignalFocusRequested.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.opened", this.HandleDreamOpened.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.catalogue-changed", this.HandleCatalogueChanged.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.passage-filter-changed", this.HandleCatalogueChanged.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.closed", this.HandleDreamClosed.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.saved", this.HandleDreamSaved.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.structure-changed", this.HandleStructureChanged.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.signal-added", this.HandleSignalAdded.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.changed", this.HandleDreamStatusChanged.bind(this)));
		this.subscriptions.push(this.events.Subscribe("dream.save-state-changed", this.HandleDreamStatusChanged.bind(this)));
		this.subscriptions.push(this.events.Subscribe("library.text-opened", this.HandleTextOpened.bind(this)));
		this.Update();
	}

	// Releases every event-bus subscription owned by this panel.
	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
		this.manageSignalsPopup?.Dispose();
		this.resonancesPopup?.Dispose();
		this.tabs?.Dispose();
	}

	// Re-renders the active view (catalogue or editor) and its status line.
	private Update(): void
	{
		const dream = this.store.GetActiveDream();
		if (this.mode === "catalogue") this.root.innerHTML = this.RenderCatalogue();
		else if (dream === null)
		{
			this.tabs?.Dispose();
			this.tabs = null;
			this.signalsPanel = null;
			this.mountedDreamId = null;
			this.root.replaceChildren();
		}
		else
		{
			if (this.mountedDreamId !== dream.id)
			{
				this.tabs?.Dispose();
				this.root.innerHTML = this.RenderEditor(dream);
				const chatButton = this.root.querySelector("[data-dream-chat]");
				const chatIcon = createElement(MessageCircle);
				chatIcon.setAttribute("aria-hidden", "true");
				chatButton?.append(chatIcon);
				this.signalsPanel = new DreamSignalsPanel(this.controller, this.errors);
				const exegesis = new DreamExegesisPanel(this.controller, dream.reflection, this.errors);
				this.tabs = new TabControl([this.signalsPanel, exegesis], "Dream content");
				const host = this.root.querySelector("[data-dream-tabs]");
				host?.append(this.tabs.Root);
				this.mountedDreamId = dream.id;
			}
			this.signalsPanel?.Update(dream);
			const source = this.root.querySelector<HTMLElement>("[data-dream-source]");
			if (source !== null && source.textContent !== dream.source.selectedText) source.textContent = dream.source.selectedText;
			const meta = this.root.querySelector<HTMLElement>("[data-dream-source-meta]");
			if (meta !== null) meta.textContent = `${dream.dialogue ?? dream.workId} · ${this.FormatSourceRange(dream)}`;
		}
		this.UpdateStatus();
		this.RefreshManageSignalsPopup();
		this.RefreshResonancesPopup();
	}

	// Renders the catalogue header, search field, and grouped Dream list.
	private RenderCatalogue(): string
	{
		const groups = this.controller.GetCatalogueGroups(this.store.GetSearchText());
		const content = this.RenderCatalogueContent(groups);
		const filter = this.RenderPassageFilter();
		const catalogue = `<section class="dream-catalogue left-tab-panel"><div class="dream-catalogue-controls"><label class="dream-search">${SearchIcon}<input data-dream-search type="search" aria-label="Search Dreams" placeholder="Search dreams..." value="${EscapeHtml(this.store.GetSearchText())}"></label><button class="catalogue-header-button button-control" data-new-dream type="button" title="New Dream" aria-label="New Dream">${AddIcon}</button></div>${filter}<div class="dream-catalogue-list">${content}</div></section>`;

		return catalogue;
	}

	// Renders the active source restriction and its explicit clear action.
	private RenderPassageFilter(): string
	{
		const filter = this.store.GetPassageFilter();
		let markup = "";
		if (filter !== null)
		{
			const label = EscapeHtml(filter.label);
			markup = `<div class="dream-passage-filter"><span>${label}</span><button class="dream-icon-button button-control" data-clear-passage-filter type="button" title="Clear passage filter" aria-label="Clear passage filter">${CloseIcon}</button></div>`;
		}
		return markup;
	}

	// Renders the catalogue body: an empty notice, a flat list, or division-grouped lists.
	private RenderCatalogueContent(groups: readonly DreamCatalogueGroup[]): string
	{
		let content = `<p class="dream-empty">No Dreams yet.</p>`;
		const hasFilter = this.store.GetPassageFilter() !== null;
		const hasSearch = this.store.GetSearchText().trim().length > 0;
		if (hasFilter || hasSearch)
		{
			content = `<p class="dream-empty">No matching Dreams.</p>`;
		}

		if (groups.length > 0)
		{
			const firstGroup = groups[0];
			const isFlat = groups.length === 1 && firstGroup?.book === null && firstGroup.label === "";
			content = isFlat ? this.RenderCatalogueItems(firstGroup.dreams) : this.RenderCatalogueGroups(groups);
		}

		return content;
	}

	// Renders each division group in order.
	private RenderCatalogueGroups(groups: readonly DreamCatalogueGroup[]): string
	{
		let content = "";

		for (const group of groups) content += this.RenderCatalogueGroup(group.label, group.book, group.dreams);

		return content;
	}

	// Renders a flat, ungrouped list of catalogue items.
	private RenderCatalogueItems(dreams: readonly Dream[]): string
	{
		let content = "";

		for (const dream of dreams) content += this.RenderCatalogueItem(dream);

		return content;
	}

	// Renders one division group, collapsed unless it is a book the reader has expanded or a search is active.
	private RenderCatalogueGroup(label: string, book: string | null, dreams: readonly Dream[]): string
	{
		const isSearching = this.store.GetSearchText().trim().length > 0;
		const hasPassageFilter = this.store.GetPassageFilter() !== null;
		const isExpanded = book === null || isSearching || hasPassageFilter || this.expandedBooks.has(book);
		const header = book === null ? `<h4>${EscapeHtml(label)}</h4>` : `<button class="catalogue-group-toggle button-control" data-book-toggle="${EscapeHtml(book)}" type="button" aria-expanded="${isExpanded}"><span class="catalogue-group-disclosure" aria-hidden="true"></span><span>${EscapeHtml(label)}</span></button>`;
		const content = this.RenderCatalogueItems(dreams);
		const group = `<section class="catalogue-group">${header}<div class="catalogue-group-content"${isExpanded ? "" : " hidden"}>${content}</div></section>`;

		return group;
	}

	// Renders one catalogue row for a single Dream.
	private RenderCatalogueItem(dream: Dream): string
	{
		const isActive = dream.id === this.store.GetActiveDream()?.id;
		const range = this.FormatSourceRange(dream);
		const item = `<button class="catalogue-item button-control${isActive ? " selected" : ""}" type="button" data-dream-id="${EscapeHtml(dream.id)}" aria-current="${isActive ? "true" : "false"}"><span class="catalogue-item-copy"><strong>${EscapeHtml(dream.title || "Untitled")}</strong><span class="catalogue-location">${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(range)}</span></span></button>`;

		return item;
	}

	// Creates the persistent editor shell for a newly opened Dream.
	private RenderEditor(dream: Dream): string
	{
		const header = this.RenderDreamHeader(dream);
		const source = this.RenderDreamSource(dream);
		const editor = `<section class="dream-panel dream-editor">${header}${source}<div class="dream-tabs-host" data-dream-tabs></div></section>`;

		return editor;
	}

	// Renders a noneditable title directly adjacent to Settings, with save and close controls.
	private RenderDreamHeader(dream: Dream): string
	{
		const title = EscapeHtml(dream.title || "Untitled Dream");
		const buttons = `<button data-dream-chat type="button">Discuss Dream</button><button data-save-dream type="button">${SaveIcon}Save Dream</button><button data-close-dream type="button">${CloseIcon}Close Dream</button>`;
		const header = `<header class="dream-header dream-editor-header"><div class="dream-title-line"><h2 data-dream-heading title="${title}">${title}</h2><button class="dream-icon-button button-control" data-manage-signals type="button" title="Rename Dream" aria-label="Rename Dream">${EditIcon}</button></div><div class="dream-toolbar"><span class="dream-toolbar-status" data-dream-status></span><details class="action-menu"><summary title="Dream actions" aria-label="Dream actions">${MoreIcon}</summary><div class="action-menu-items">${buttons}<button data-refresh-dreams type="button">Refresh Dreams</button><button data-delete-dream type="button">${TrashIcon}Delete Dream</button></div></details></div></header>`;

		return header;
	}

	// Renders the Dream's source-passage section.
	private RenderDreamSource(dream: Dream): string
	{
		const range = this.FormatSourceRange(dream);
		const meta = `${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(range)}`;
		const source = `<details class="dream-section dream-source-section" open><summary>Source Passage <span class="dream-source-meta" data-dream-source-meta>${meta}</span></summary><blockquote class="dream-source" data-dream-source>${EscapeHtml(dream.source.selectedText)}</blockquote><button class="dream-action-link button-control" data-jump-source type="button">Jump to source ${OpenIcon}</button></details>`;

		return source;
	}

	// Displays distinct source endpoints without repeating a single passage label.
	private FormatSourceRange(dream: Dream): string
	{
		const start = dream.source.locatorStart?.value;
		const end = dream.source.locatorEnd?.value;
		let range = start ?? end ?? "source";

		if (start !== undefined && end !== undefined && start !== end)
		{
			range = `${start}–${end}`;
		}

		return range;
	}

	// Opens the rename popup for the active Dream.
	private OpenManageSignalsPopup(): void
	{
		const dream = this.store.GetActiveDream();

		if (this.manageSignalsPopup !== null && dream !== null)
		{
			const title = EscapeHtml(dream.title);
			const body = `<label class="dream-field dream-settings-title"><span>Dream Name</span><input data-dream-title value="${title}" placeholder="Untitled Dream"></label>`;
			this.manageSignalsPopup.SetBodyHtml(body);
			this.manageSignalsPopup.Open();
		}
	}

	// Closes the rename popup when its Dream is no longer open.
	private RefreshManageSignalsPopup(): void
	{
		const dream = this.store.GetActiveDream();
		if (this.manageSignalsPopup !== null && this.manageSignalsPopup.IsOpen)
		{
			if (dream === null) this.manageSignalsPopup.Close();
		}
	}

	// Renders every resonance on the active Dream, grouped by originating signal, with a Reveal action per entry.
	private RenderResonancesList(dream: Dream): string
	{
		let rows = "";

		for (const signal of dream.signals)
		{
			for (const resonance of signal.resonances)
			{
				const note = EscapeHtml(resonance.note);
				const signalText = EscapeHtml(signal.text);
				const targetCount = resonance.targets.length;
				const targetLabel = targetCount > 0 ? `<span class="resonance-review-targets">${targetCount} attached passage${targetCount === 1 ? "" : "s"}</span>` : "";
				rows += `<div class="resonance-review-item"><div class="resonance-review-copy"><span class="resonance-review-signal">${signalText}</span><span class="resonance-review-note">${note}</span>${targetLabel}</div><button class="dream-action-link button-control" data-reveal-resonance-signal="${EscapeHtml(signal.id)}" type="button">Reveal</button></div>`;
			}
		}

		const body = rows.length > 0 ? rows : `<p class="dream-empty">No resonances yet.</p>`;
		return body;
	}

	// Opens the Resonances popup for the active Dream.
	private OpenResonancesPopup(): void
	{
		const dream = this.store.GetActiveDream();

		if (this.resonancesPopup !== null && dream !== null)
		{
			this.resonancesPopup.SetBodyHtml(this.RenderResonancesList(dream));
			this.resonancesPopup.Open();
		}
	}

	// Keeps the Resonances popup in sync with the active Dream while it is open.
	private RefreshResonancesPopup(): void
	{
		const dream = this.store.GetActiveDream();
		if (this.resonancesPopup !== null && this.resonancesPopup.IsOpen)
		{
			if (dream === null) this.resonancesPopup.Close();
			else this.resonancesPopup.SetBodyHtml(this.RenderResonancesList(dream));
		}
	}

	// Routes a click inside the Resonances popup to revealing the originating signal.
	private HandleResonancesPopupClick(event: MouseEvent): void
	{
		const target = event.target as HTMLElement | null;
		const signalId = target?.closest<HTMLElement>("[data-reveal-resonance-signal]")?.dataset.revealResonanceSignal;

		if (signalId !== undefined)
		{
			this.resonancesPopup?.Close();
			this.UpdateAndScrollToSignal(signalId);
		}
	}

	// Renames through the existing dirty-state and autosave workflow.
	private HandleSettingsInput(event: Event): void
	{
		const target = event.target;
		if (target instanceof HTMLInputElement && target.matches("[data-dream-title]")) this.controller.UpdateTitle(target.value);
		this.UpdateStatus();
	}

	// Routes a click anywhere in the panel to the action implied by the element the reader clicked.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const dreamId = target?.closest<HTMLElement>("[data-dream-id]")?.dataset.dreamId;
		const actionMenu = target?.closest<HTMLDetailsElement>(".action-menu");
		if (actionMenu !== null && actionMenu !== undefined && target?.closest("button") !== null) actionMenu.open = false;
		const signalId = target?.closest<HTMLElement>("[data-remove-signal]")?.dataset.removeSignal;
		const book = target?.closest<HTMLElement>("[data-book-toggle]")?.dataset.bookToggle;
		const clearFilter = target?.closest("[data-clear-passage-filter]");
		if (clearFilter !== null && clearFilter !== undefined)
		{
			void this.controller.ClearPassageFilterAsync();
		}

		if (dreamId !== undefined) this.controller.Open(dreamId);
		if (target?.closest("[data-manage-signals]") !== null) this.OpenManageSignalsPopup();
		if (target?.closest("[data-open-resonances]") !== null) this.OpenResonancesPopup();
		if (book !== undefined)
		{
			if (this.expandedBooks.has(book)) this.expandedBooks.delete(book);
			else this.expandedBooks.add(book);
			this.Update();
		}
		if (signalId !== undefined) this.controller.RemoveSignal(signalId);
		if (target?.closest("[data-dream-chat]") !== null) this.controller.ChatWithDream();
		if (target?.closest("[data-save-dream]") !== null) void this.controller.SaveAsync();
		if (target?.closest("[data-close-dream]") !== null) void this.controller.CloseAsync();
		if (target?.closest("[data-delete-dream]") !== null) this.ConfirmDelete();
		if (target?.closest("[data-refresh-dreams]") !== null) void this.controller.RefreshAsync();
		if (target?.closest("[data-new-dream]") !== null) this.CreateDreamFromSelection();
		if (target?.closest("[data-jump-source]") !== null)
		{
			const selection = this.store.GetActiveDream()?.source;
			if (selection !== undefined) void this.events.PublishAsync("library.jump-requested", { selection });
		}
	}

	// Confirms with the reader, then deletes the active Dream.
	private ConfirmDelete(): void
	{
		const dream = this.store.GetActiveDream();
		const name = dream?.title.trim() || "this Dream";
		const confirmed = dream !== null && window.confirm(`Delete ${name}? This cannot be undone.`);

		if (confirmed) void this.controller.DeleteAsync();
	}

	// Routes an input event on a tracked field to the matching controller or store call.
	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;

		if (target?.matches("[data-dream-search]") === true)
		{
			this.store.SetSearchText(target.value);
			this.RefreshCatalogueList();
		}
	}

	// Re-renders only the catalogue list, in place, after the search query changes.
	private RefreshCatalogueList(): void
	{
		const list = this.root.querySelector<HTMLElement>(".dream-catalogue-list");

		if (list !== null)
		{
			const groups = this.controller.GetCatalogueGroups(this.store.GetSearchText());
			list.innerHTML = this.RenderCatalogueContent(groups);
		}
	}

	// Starts a new Dream from the reader's current passage selection.
	private CreateDreamFromSelection(): void
	{
		void this.controller.CreateFromCurrentSelection();
	}

	// Saves the active Dream on Ctrl/Cmd+Enter.
	private HandleKeyDown(event: KeyboardEvent): void
	{
		if (event.key === "Escape")
		{
			const menu = (event.target as HTMLElement | null)?.closest<HTMLDetailsElement>(".action-menu");
			if (menu !== null && menu !== undefined)
			{
				menu.open = false;
				menu.querySelector<HTMLElement>("summary")?.focus();
			}
		}
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
		{
			event.preventDefault();
			event.stopPropagation();
			void this.controller.SaveAsync();
		}
	}

	// Shows the source-passage context menu when the reader right-clicks a selection within it.
	private async HandleContextMenuAsync(event: Event): Promise<void>
	{
		const source = this.root.querySelector<HTMLElement>("[data-dream-source]");
		const browserSelection = window.getSelection();
		const range = browserSelection !== null && browserSelection.rangeCount > 0 ? browserSelection.getRangeAt(0) : null;
		const isInsideSource = source !== null && range !== null && !range.collapsed && source.contains(range.commonAncestorContainer);

		if (source !== null && range !== null && isInsideSource)
		{
			event.preventDefault();
			const prefix = range.cloneRange();
			prefix.selectNodeContents(source);
			prefix.setEnd(range.startContainer, range.startOffset);
			const startOffset = prefix.toString().length;
			const endOffset = startOffset + range.toString().length;
			const dream = this.store.GetActiveDream();
			const document = this.library.GetText();

			if (dream !== null && document !== null)
			{
				const selection = this.controller.CreateSourceSelection(document, dream.source, startOffset, endOffset);
				if (selection !== null) await this.controller.HandleSourceSelectionAsync(selection);
			}
		}
	}

	// Refreshes the status line and disables the save buttons while a save is in flight.
	private UpdateStatus(): void
	{
		const heading = this.root.querySelector<HTMLElement>("[data-dream-heading]");
		const dream = this.store.GetActiveDream();
		if (heading !== null && dream !== null)
		{
			heading.textContent = dream.title || "Untitled Dream";
			heading.title = heading.textContent;
		}
		const status = this.root.querySelector<HTMLElement>("[data-dream-status]");
		const saveButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-save-dream]");
		const saveState = this.store.GetSaveState();

		if (status !== null) status.textContent = this.GetStatusText(saveState);

		for (let index = 0; index < saveButtons.length; index += 1)
		{
			const button = saveButtons[index];
			if (button !== undefined) button.disabled = saveState === "saving";
		}
	}

	// Re-renders the editor, then scrolls the newly added signal into view.
	private UpdateAndScrollToSignal(signalId: string): void
	{
		this.Update();
		this.tabs?.Select("signals");
		void this.signalsPanel?.ShowSignalAsync(signalId);
	}

	// Returns the reader-facing status line for the current dirty/save state.
	private GetStatusText(saveState: DreamSaveState): string
	{
		let text = this.store.GetIsDirty() ? "Unsaved" : "Saved";

		if (saveState === "saving") text = "Saving…";
		if (saveState === "error") text = "Save failed";

		return text;
	}

	// Re-renders the view when a Dream is opened.
	private HandleDreamOpened(): void
	{
		this.manageSignalsPopup?.Close();
		this.Update();
	}

	// Re-renders the view when the catalogue changes.
	private HandleCatalogueChanged(): void
	{
		this.Update();
	}

	// Re-renders the view when the active Dream is closed.
	private HandleDreamClosed(): void
	{
		this.manageSignalsPopup?.Close();
		this.Update();
	}

	// Refreshes the status line after a Dream is saved.
	private HandleDreamSaved(): void
	{
		if (this.mode === "catalogue")
		{
			this.Update();
		}
		else
		{
			this.UpdateStatus();
		}
	}

	// Re-renders the view when the active Dream's structure changes.
	private HandleStructureChanged(): void
	{
		this.Update();
	}

	// Re-renders and scrolls to a newly added signal.
	private HandleSignalAdded(event: ChoraEvents["dream.signal-added"]): void
	{
		this.UpdateAndScrollToSignal(event.signalId);
	}

	// Reveals a specific signal within the active Dream, when the request targets it.
	private HandleSignalFocusRequested(event: ChoraEvents["dream.signal-focus-requested"]): void
	{
		if (this.store.GetActiveDream()?.id === event.dreamId) this.UpdateAndScrollToSignal(event.signalId);
	}

	// Refreshes the status line after the active Dream's dirty or save state changes.
	private HandleDreamStatusChanged(): void
	{
		this.UpdateStatus();
	}

	// Re-renders the view when the open library text changes.
	private HandleTextOpened(): void
	{
		this.Update();
	}
}

