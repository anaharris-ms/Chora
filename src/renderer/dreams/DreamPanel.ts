import type { Dream } from "../../shared/dreams/DreamTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { CreateDreamSourceSelection } from "./SourceSelection.js";
import { DreamController } from "./DreamController.js";
import { DreamStore, type DreamSaveState } from "./DreamStore.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { EscapeHtml } from "../ui/Html.js";

type DreamPanelMode = "catalogue" | "editor";

export class DreamPanel
{
	private readonly subscriptions: Unsubscribe[] = [];
	private readonly expandedBooks = new Set<string>();
	private readonly expandedSignals = new Set<string>();
	private searchText = "";

	public constructor(private readonly root: HTMLElement, private readonly events: ChoraEventBus<ChoraEvents>, private readonly store: DreamStore, private readonly controller: DreamController, private readonly library: LibraryStore, private readonly mode: DreamPanelMode)
	{
		this.root.addEventListener("click", (event) => this.HandleClick(event));
		this.root.addEventListener("input", (event) => this.HandleInput(event));
		this.root.addEventListener("keydown", (event) => this.HandleKeyDown(event));
		this.root.addEventListener("contextmenu", (event) => void this.HandleContextMenuAsync(event));
		this.subscriptions.push(this.events.Subscribe("dream.opened", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.catalogue-changed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.closed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.saved", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("dream.structure-changed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.signal-added", (event) => this.UpdateAndScrollToSignal(event.signalId)));
		this.subscriptions.push(this.events.Subscribe("dream.changed", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("dream.save-state-changed", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("library.text-opened", () => this.Update()));
		this.Update();
	}

	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
	}

	private Update(): void
	{
		const dream = this.store.GetActiveDream();
		this.root.innerHTML = this.mode === "catalogue" ? this.RenderCatalogue() : dream === null ? "" : this.RenderEditor(dream);
		this.UpdateStatus();
	}

	private RenderCatalogue(): string
	{
		const dreams = [...this.store.GetCatalogue()].filter((dream) => this.MatchesSearch(dream)).sort((first, second) => this.CompareBySource(first, second));
		const content = this.RenderCatalogueContent(dreams);
		return `<section class="dream-catalogue left-tab-panel"><header class="catalogue-header"><h3>Dreams</h3><div class="catalogue-header-actions"><button class="catalogue-header-button button-control" data-new-dream type="button" title="New Dream" aria-label="New Dream">+</button><button class="catalogue-header-button button-control" data-refresh-dreams type="button" title="Refresh Dreams" aria-label="Refresh Dreams">&#10227;</button></div></header><label class="dream-search"><span class="dream-search-icon" aria-hidden="true"></span><input data-dream-search type="search" placeholder="Search Dreams" value="${EscapeHtml(this.searchText)}"></label><div class="dream-catalogue-list">${content}</div></section>`;
	}

	private RenderCatalogueContent(dreams: Dream[]): string
	{
		let content = `<p class="dream-empty">No Dreams yet.</p>`;

		if (dreams.length > 0)
		{
			const divisions = dreams.map((dream) => this.FindDivision(dream));
			const hasDivisions = divisions.some((division) => division !== null);

			if (hasDivisions)
			{
				const groups = new Map<string, { label: string; book: string | null; dreams: Dream[] }>();

				for (let index = 0; index < dreams.length; index += 1)
				{
					const dream = dreams[index];
					const division = divisions[index] ?? null;
					if (dream !== undefined)
					{
						const key = division === null ? `${dream.workId}:unplaced` : `${dream.workId}:${division.kind}:${division.value}`;
						const label = division === null ? "Unplaced" : this.FormatDivisionLabel(division.kind, division.value);
						const book = division?.kind === "book" ? division.value : null;
						const group = groups.get(key) ?? { label, book, dreams: [] };
						group.dreams.push(dream);
						groups.set(key, group);
					}
				}

				content = [...groups.values()].map((group) => this.RenderCatalogueGroup(group.label, group.book, group.dreams)).join("");
			}
			else content = dreams.map((dream) => this.RenderCatalogueItem(dream)).join("");
		}

		return content;
	}

	private RenderCatalogueGroup(label: string, book: string | null, dreams: Dream[]): string
	{
		const isExpanded = book === null || this.expandedBooks.has(book);
		const header = book === null ? `<h4>${EscapeHtml(label)}</h4>` : `<button class="catalogue-group-toggle button-control" data-book-toggle="${EscapeHtml(book)}" type="button" aria-expanded="${isExpanded}"><span class="catalogue-group-disclosure" aria-hidden="true"></span><span>${EscapeHtml(label)}</span></button>`;
		const content = dreams.map((dream) => this.RenderCatalogueItem(dream)).join("");
		const group = `<section class="catalogue-group">${header}<div class="catalogue-group-content"${isExpanded ? "" : " hidden"}>${content}</div></section>`;
		return group;
	}

	private RenderCatalogueItem(dream: Dream): string
	{
		const isActive = dream.id === this.store.GetActiveDream()?.id;
		const item = `<button class="catalogue-item button-control${isActive ? " selected" : ""}" type="button" data-dream-id="${EscapeHtml(dream.id)}" aria-current="${isActive ? "true" : "false"}"><span class="catalogue-item-marker" aria-hidden="true"></span><span class="catalogue-item-copy"><strong>${EscapeHtml(dream.title || "Untitled")}</strong><span class="catalogue-location">${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(dream.source.locatorStart?.value ?? "source")}</span></span></button>`;
		return item;
	}

	private MatchesSearch(dream: Dream): boolean
	{
		const query = this.searchText.trim().toLocaleLowerCase();
		const searchable = `${dream.title} ${dream.dialogue ?? ""} ${dream.source.selectedText}`.toLocaleLowerCase();
		const matches = query.length === 0 || searchable.includes(query);
		return matches;
	}

	private FindDivision(dream: Dream): { kind: string; value: string } | null
	{
		let division = dream.source.division ?? null;
		const document = this.library.GetText();

		if (division === null && document?.id === dream.workId)
		{
			const sourceSegment = document.segments.find((segment) => segment.key === dream.source.start.segmentKey)
				?? document.segments.find((segment) => segment.locator?.value === dream.source.locatorStart?.value);
			division = sourceSegment?.division ?? null;
		}

		return division;
	}

	private FormatDivisionLabel(kind: string, value: string): string
	{
		const kindLabel = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
		const romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
		const numericIndex = Number.parseInt(value, 10) - 1;
		const valueLabel = kind.toLowerCase() === "book" ? romanNumbers[numericIndex] ?? value : value;
		const label = `${kindLabel} ${valueLabel}`;
		return label;
	}

	private CompareBySource(first: Dream, second: Dream): number
	{
		let comparison = first.workId.localeCompare(second.workId);
		if (comparison === 0) comparison = this.CompareLocators(first.source.locatorStart?.value ?? "", second.source.locatorStart?.value ?? "");
		if (comparison === 0) comparison = first.source.start.segmentKey.localeCompare(second.source.start.segmentKey);
		if (comparison === 0) comparison = first.source.start.offset - second.source.start.offset;
		if (comparison === 0) comparison = first.title.localeCompare(second.title);
		return comparison;
	}

	private CompareLocators(first: string, second: string): number
	{
		const firstMatch = /^(\d+)([a-e])$/iu.exec(first);
		const secondMatch = /^(\d+)([a-e])$/iu.exec(second);
		let comparison = 0;

		if (firstMatch !== null && secondMatch !== null)
		{
			comparison = Number.parseInt(firstMatch[1] ?? "0", 10) - Number.parseInt(secondMatch[1] ?? "0", 10);
			if (comparison === 0) comparison = (firstMatch[2] ?? "").localeCompare(secondMatch[2] ?? "");
		}
		else
		{
			comparison = first.localeCompare(second, undefined, { numeric: true });
		}

		return comparison;
	}

	private RenderEditor(dream: Dream): string
	{
		const signals = dream.signals.map((signal) => this.RenderSignal(signal.id, signal.text, signal.description)).join("");
		const saveIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"></path><path d="M8 4v6h8V4M8 20v-6h8v6"></path></svg>`;
		const closeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;
		const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;

		return `<section class="dream-panel"><header class="dream-header"><span class="dream-toolbar-status" data-dream-status></span><div class="dream-toolbar"><button class="dream-icon-button button-control" data-save-dream type="button" title="Save Dream" aria-label="Save Dream">${saveIcon}</button><button class="dream-icon-button button-control" data-delete-dream type="button" title="Delete Dream" aria-label="Delete Dream">${deleteIcon}</button><button class="dream-icon-button button-control" data-close-dream type="button" title="Close Dream" aria-label="Close Dream">${closeIcon}</button></div></header><label class="dream-title-field"><span>Title</span><input data-dream-title value="${EscapeHtml(dream.title)}" placeholder="Untitled Dream"></label><section class="dream-section dream-source-section"><div class="dream-section-heading"><h3>Source Passage</h3><div class="dream-source-meta">${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(dream.source.locatorStart?.value ?? "source")}</div></div><pre class="dream-source" data-dream-source>${EscapeHtml(dream.source.selectedText)}</pre><button class="dream-action-link button-control" data-jump-source type="button">Jump to Source</button></section><section class="dream-section"><h3>Signals</h3><div class="signal-list">${signals || `<p class="dream-empty">No signals.</p>`}</div></section><label class="dream-field dream-exegesis"><span>Exegesis</span><textarea data-auto-expand data-dream-exegesis>${EscapeHtml(dream.reflection)}</textarea></label><footer class="dream-save"><button class="dream-action-link button-control" data-save-dream type="button">Save</button><button class="dream-action-link button-control" data-close-dream type="button">Close</button><button class="dream-action-link dream-delete-link button-control" data-delete-dream type="button">Delete</button></footer></section>`;
	}

	private RenderSignal(id: string, text: string, description: string): string
	{
		const isExpanded = this.expandedSignals.has(id);
		const content = isExpanded ? `<textarea class="signal-description" data-signal-description="${EscapeHtml(id)}" placeholder="Description (optional)">${EscapeHtml(description)}</textarea>` : "";
		const signal = `<section class="signal-item" data-signal-id="${EscapeHtml(id)}"><button class="signal-row button-control" data-signal-toggle="${EscapeHtml(id)}" type="button" aria-expanded="${isExpanded}"><strong class="signal-heading">${EscapeHtml(text)}</strong><span class="signal-disclosure" aria-hidden="true">&#8250;</span></button>${content}<button class="signal-remove button-control" data-remove-signal="${EscapeHtml(id)}" type="button" title="Remove signal" aria-label="Remove signal">Remove</button></section>`;
		return signal;
	}

	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const dreamId = target?.closest<HTMLElement>("[data-dream-id]")?.dataset.dreamId;
		const signalId = target?.closest<HTMLElement>("[data-remove-signal]")?.dataset.removeSignal;
		const signalToggleId = target?.closest<HTMLElement>("[data-signal-toggle]")?.dataset.signalToggle;
		const book = target?.closest<HTMLElement>("[data-book-toggle]")?.dataset.bookToggle;

		if (dreamId !== undefined) this.controller.Open(dreamId);
		if (signalToggleId !== undefined)
		{
			if (this.expandedSignals.has(signalToggleId)) this.expandedSignals.delete(signalToggleId);
			else this.expandedSignals.add(signalToggleId);
			this.Update();
		}
		if (book !== undefined)
		{
			if (this.expandedBooks.has(book)) this.expandedBooks.delete(book);
			else this.expandedBooks.add(book);
			this.Update();
		}
		if (signalId !== undefined) this.controller.RemoveSignal(signalId);
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

	private ConfirmDelete(): void
	{
		const dream = this.store.GetActiveDream();
		const name = dream?.title.trim() || "this Dream";
		const confirmed = dream !== null && window.confirm(`Delete ${name}? This cannot be undone.`);
		if (confirmed) void this.controller.DeleteAsync();
	}

	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;

		if (target?.matches("[data-dream-title]") === true) this.controller.UpdateTitle(target.value);
		if (target?.matches("[data-dream-exegesis]") === true) this.controller.UpdateExegesis(target.value);
		if (target?.matches("[data-signal-description]") === true) this.controller.UpdateSignal(target.dataset.signalDescription ?? "", target.value);
		if (target?.matches("[data-dream-search]") === true)
		{
			this.searchText = target.value;
			this.RefreshCatalogueList();
		}
	}

	private RefreshCatalogueList(): void
	{
		const list = this.root.querySelector<HTMLElement>(".dream-catalogue-list");

		if (list !== null)
		{
			const dreams = [...this.store.GetCatalogue()].filter((dream) => this.MatchesSearch(dream)).sort((first, second) => this.CompareBySource(first, second));
			list.innerHTML = this.RenderCatalogueContent(dreams);
		}
	}

	private CreateDreamFromSelection(): void
	{
		this.controller.CreateFromCurrentSelection();
	}

	private HandleKeyDown(event: KeyboardEvent): void
	{
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
		{
			event.preventDefault();
			event.stopPropagation();
			void this.controller.SaveAsync();
		}
	}

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
				const selection = CreateDreamSourceSelection(document, dream.source, startOffset, endOffset);
				if (selection !== null)
				{
					await this.controller.HandleSourceSelectionAsync(selection);
				}
			}
		}
	}

	private UpdateStatus(): void
	{
		const status = this.root.querySelector<HTMLElement>("[data-dream-status]");
		const saveButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-save-dream]");
		const saveState = this.store.GetSaveState();
		if (status !== null) status.textContent = this.GetStatusText(saveState);
		saveButtons.forEach((button) =>
		{
			button.disabled = saveState === "saving";
		});
	}

	private UpdateAndScrollToSignal(signalId: string): void
	{
		this.Update();
		const panel = this.root.querySelector<HTMLElement>(".dream-panel");
		const signal = this.root.querySelector<HTMLElement>(`[data-signal-id="${CSS.escape(signalId)}"]`);

		if (panel !== null && signal !== null)
		{
			const panelBounds = panel.getBoundingClientRect();
			const signalBounds = signal.getBoundingClientRect();
			const targetPosition = panel.scrollTop + signalBounds.top - panelBounds.top - 24;
			panel.scrollTop = Math.max(0, targetPosition);
		}
	}

	private GetStatusText(saveState: DreamSaveState): string
	{
		let text = this.store.GetIsDirty() ? "Unsaved" : "Saved";
		if (saveState === "saving") text = "Saving…";
		if (saveState === "error") text = "Save failed";
		return text;
	}
}
