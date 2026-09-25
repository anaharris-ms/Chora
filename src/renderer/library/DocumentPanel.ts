import type { LibraryText, SourceNotice } from "../../shared/library/LibraryTypes.js";
import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { LibraryController } from "../library/LibraryController.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { CaptureSelection, ClearBrowserSelection } from "./Selection.js";
import { EscapeHtml } from "../ui/Html.js";
import { PreviousIcon, NextIcon, SearchIcon } from "../ui/Icons.js";
import { ReadingSettingsStore } from "../core/settings/ReadingSettingsStore.js";

// Renders the active text and its reading toolbar, and translates browser events into controller calls.
export class DocumentPanel
{
	// Event-bus subscriptions released when the panel is disposed.
	private readonly subscriptions: Unsubscribe[] = [];
	// Pending reading-focus capture timer, or null when nothing is scheduled.
	private focusTimer: ReturnType<typeof setTimeout> | null = null;
	// Highlighted find matches and the currently focused match index.
	private findHits: HTMLElement[] = [];
	private findIndex = 0;
	// Lowercased query currently highlighted, used to detect repeat searches.
	private activeFindQuery = "";

	// Wires up DOM and application-event listeners.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly library: LibraryStore,
		private readonly controller: LibraryController,
		private readonly settings: ReadingSettingsStore = new ReadingSettingsStore())
	{
		this.root.addEventListener("change", this.HandleChange.bind(this));
		this.root.addEventListener("input", this.HandleInput.bind(this));
		this.root.addEventListener("keydown", this.HandleKeyDown.bind(this));
		this.root.addEventListener("click", this.HandleClick.bind(this));
		this.root.addEventListener("mouseup", this.CaptureCurrentSelection.bind(this));
		this.root.addEventListener("keyup", this.CaptureCurrentSelection.bind(this));
		this.root.addEventListener("scroll", this.ScheduleReadingFocus.bind(this));
		this.root.addEventListener("contextmenu", this.HandleContextMenuAsync.bind(this));
		this.subscriptions.push(this.events.Subscribe("library.text-opened", this.HandleTextOpened.bind(this)));
		this.subscriptions.push(this.events.Subscribe("library.jump-requested", this.HandleJumpRequested.bind(this)));
		this.subscriptions.push(this.events.Subscribe("library.find-requested", this.HandleFindRequested.bind(this)));
		this.subscriptions.push(this.events.Subscribe("library.focus-changed", this.HandleFocusChanged.bind(this)));
	}

	// Releases event-bus subscriptions and any pending reading-focus timer.
	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
		if (this.focusTimer !== null) clearTimeout(this.focusTimer);
	}

	// Routes a text-opened application event to a fresh render.
	private HandleTextOpened(event: ChoraEvents["library.text-opened"]): void
	{
		this.Update(event.text, event.sourceNotice);
	}

	// Routes a jump-requested application event to the scroll workflow.
	private HandleJumpRequested(event: ChoraEvents["library.jump-requested"]): void
	{
		this.JumpToSelection(event.selection);
	}

	private HandleFindRequested(event: ChoraEvents["library.find-requested"]): void
	{
		this.RunFind(event.query, event.forward);
	}

	// Renders the full reading pane for a newly opened text.
	private Update(document: LibraryText, sourceNotice: SourceNotice | null): void
	{
		this.findHits = [];
		this.findIndex = 0;
		this.activeFindQuery = "";
		const toolbar = this.RenderReaderToolbar(document, sourceNotice);
		const segments = this.RenderSegments(document);
		this.root.innerHTML = `<section id="readingPane">${toolbar}<div class="text-body">${segments}</div></section>`;
		this.UpdateFindCount();
		this.ScheduleReadingFocus();
	}

	// Renders every document segment, inserting book headings and Stephanus locators where they begin.
	private RenderSegments(document: LibraryText): string
	{
		let previousDivision = "";
		let previousLocator = "";
		const segments = document.segments.map((segment) =>
		{
			const divisionValue = segment.division?.kind === "book" ? segment.division.value : "";
			const startsDivision = divisionValue.length > 0 && divisionValue !== previousDivision;
			const heading = startsDivision ? `<h2 class="book-heading" data-book-heading="${EscapeHtml(divisionValue)}">Book ${EscapeHtml(this.FormatBookNumber(divisionValue))}</h2>` : "";
			previousDivision = divisionValue;
			const bookTarget = startsDivision ? ` data-book-start="${EscapeHtml(divisionValue)}"` : "";
			const locatorValue = segment.locator?.value ?? "";
			const startsLocator = locatorValue.length > 0 && locatorValue !== previousLocator;
			const locatorMarkup = startsLocator ? `<span class="source-locator">${EscapeHtml(locatorValue)}</span>` : "";
			const locatorClass = startsLocator ? "has-locator" : "";
			const locatorTarget = startsLocator ? ` data-locator="${EscapeHtml(locatorValue)}"` : "";
			previousLocator = locatorValue;
			const segmentMarkup = `<p class="text-segment ${locatorClass}" data-segment-key="${EscapeHtml(segment.key)}"${bookTarget}${locatorTarget}>${locatorMarkup}${segment.speaker === null ? "" : `<span class="speaker-label">${EscapeHtml(segment.speaker)}</span>`}<span class="segment-text">${EscapeHtml(segment.text)}</span></p>`;
			return `${heading}${segmentMarkup}`;
		}).join("");
		return segments;
	}

	// Renders the book, Stephanus-locator, and find controls above the reading pane.
	private RenderReaderToolbar(document: LibraryText, sourceNotice: SourceNotice | null): string
	{
		const works = this.library.GetSnapshot().texts;
		const workOptions = works.map(function RenderWorkOption(work): string
		{
			const selected = work.id === document.id;
			const workTitle = work.titleGreek || work.title;
			const option = `<option value="${EscapeHtml(work.id)}"${selected ? " selected" : ""}>${EscapeHtml(workTitle)}</option>`;
			return option;
		}).join("");
		const hasCurrentWork = works.some(function IsCurrentWork(work): boolean { return work.id === document.id; });
		const currentTitle = document.titleGreek || document.title;
		const externalOption = hasCurrentWork ? "" : `<option value="${EscapeHtml(document.id)}" selected>${EscapeHtml(currentTitle)}</option>`;
		const title = `<h1><select class="reader-work-select" data-reader-work aria-label="Choose text" title="Choose text">${externalOption}${workOptions}</select></h1>`;
		const books = document.segments.map((segment) => segment.division).filter((division, index, divisions) => division?.kind === "book" && divisions.findIndex((candidate) => candidate?.kind === "book" && candidate.value === division.value) === index);
		const bookControl = books.length === 0 ? "" : `<label class="reader-control reader-book-control"><select data-book-navigation aria-label="Go to book">${books.map((book) => `<option value="${EscapeHtml(book?.value ?? "")}">Book ${EscapeHtml(this.FormatBookNumber(book?.value ?? ""))}</option>`).join("")}</select></label>`;
		const locators = this.CollectLocators(document);
		const locatorOptions = locators.map((locator) => `<option value="${EscapeHtml(locator)}">${EscapeHtml(locator)}</option>`).join("");
		const firstLocator = locators[0] ?? "";
		const locatorControl = locators.length === 0 ? "" : `<div class="reader-control reader-locator-control"><button class="reader-find-nav button-control" data-passage-step="-1" type="button" title="Previous passage" aria-label="Previous passage">${PreviousIcon}</button><input data-locator-jump type="text" value="${EscapeHtml(firstLocator)}" aria-label="Go to Stephanus locator"><button class="reader-find-nav button-control" data-passage-step="1" type="button" title="Next passage" aria-label="Next passage">${NextIcon}</button></div><label class="reader-control reader-locator-select"><select data-locator-navigation aria-label="Choose Stephanus passage">${locatorOptions}</select></label>`;
		const source = sourceNotice?.source ?? document.provenance.repository;
		const license = sourceNotice?.license ?? document.provenance.license;
		const attribution = [source, license].filter(Boolean).join(" · ");
		const font = this.settings.GetFont();
		const isLight = this.settings.GetAppearance() === "light";
		const appearanceLabel = isLight ? "Use dark appearance" : "Use light appearance";
		const controls = `<div class="reader-tools app-settings"><div class="application-find">${SearchIcon}<input data-find-input type="search" placeholder="Find in text..." aria-label="Find in text"><span data-find-count aria-live="polite"></span><div class="application-find-actions"><button data-find-prev type="button" title="Previous match" aria-label="Previous match">${PreviousIcon}</button><button data-find-next type="button" title="Next match" aria-label="Next match">${NextIcon}</button></div></div><div class="app-setting-stepper"><button class="app-setting-button button-control" data-font-size="-1" type="button" title="Decrease text size" aria-label="Decrease text size">A&minus;</button><button class="app-setting-button button-control" data-font-size="1" type="button" title="Increase text size" aria-label="Increase text size">A+</button></div><select data-reading-font aria-label="Reading font"><option value="serif"${font === "serif" ? " selected" : ""}>Serif</option><option value="sans"${font === "sans" ? " selected" : ""}>Sans</option></select><button class="app-setting-button button-control" data-toggle-appearance type="button" title="${appearanceLabel}" aria-label="${appearanceLabel}">${isLight ? "&#9790;" : "&#9788;"}</button></div>`;
		const toolbar = `<header class="reader-toolbar"><div class="reader-toolbar-line"><div class="reader-passage-navigation">${title}${bookControl}${locatorControl}</div>${controls}</div><div class="reader-source-line"><p class="reader-source-attribution">${EscapeHtml(attribution)}</p></div></header>`;
		return toolbar;
	}

	// Returns each distinct Stephanus locator value in document order.
	private CollectLocators(document: LibraryText): string[]
	{
		const locators: string[] = [];
		const seen = new Set<string>();

		for (const segment of document.segments)
		{
			const value = segment.locator?.value ?? "";
			if (value.length > 0 && !seen.has(value))
			{
				seen.add(value);
				locators.push(value);
			}
		}

		return locators;
	}

	// Jumps to the book selected from the book-navigation control.
	private HandleChange(event: Event): void
	{
		const target = event.target;
		if (target instanceof HTMLSelectElement && target.matches("[data-reader-work]"))
		{
			const workId = target.value;
			const currentId = this.library.GetText()?.id ?? "";
			target.value = currentId;
			if (workId !== currentId) void this.controller.OpenAsync(workId);
		}
		const bookNavigation = target instanceof HTMLSelectElement && target.matches("[data-book-navigation]") ? target : null;
		if (bookNavigation !== null) this.JumpToBook(bookNavigation.value);
		if (target instanceof HTMLSelectElement && target.matches("[data-locator-navigation]") && target.value.length > 0)
		{
			this.JumpToLocator(target.value);
		}
	}

	// Keeps passage controls aligned with the reader's current focus without interrupting locator entry.
	private HandleFocusChanged(event: ChoraEvents["library.focus-changed"]): void
	{
		const text = this.library.GetText();
		if (text !== null && text.id === event.textId)
		{
			const segment = text.segments.find(function MatchesSegment(candidate): boolean { return candidate.key === event.segmentKey; });
			const locator = segment?.locator?.value ?? "";
			const input = this.root.querySelector<HTMLInputElement>("[data-locator-jump]");
			const chooser = this.root.querySelector<HTMLSelectElement>("[data-locator-navigation]");
			const book = this.root.querySelector<HTMLSelectElement>("[data-book-navigation]");
			if (input !== null && input !== document.activeElement) input.value = locator;
			if (chooser !== null) chooser.value = locator;
			if (book !== null && segment?.division?.kind === "book") book.value = segment.division.value;
		}
	}

	// Navigates to a Stephanus locator as soon as an exact value is selected or typed.
	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const isLocator = target?.matches("[data-locator-jump]") === true;
		if (isLocator) this.JumpToLocator((target as HTMLInputElement).value);
		if (target instanceof HTMLInputElement && target.matches("[data-find-input]") && target.value.length === 0)
		{
			this.RunFind("", true);
		}
	}

	// Jumps to a locator or runs a find on Enter from their respective inputs.
	private HandleKeyDown(event: KeyboardEvent): void
	{
		const target = event.target as HTMLElement | null;
		const isLocator = target?.matches("[data-locator-jump]") === true;
		const isFind = target?.matches("[data-find-input]") === true;

		if (event.key === "Enter" && isLocator)
		{
			event.preventDefault();
			this.JumpToLocator((target as HTMLInputElement).value);
		}
		if (event.key === "Enter" && isFind)
		{
			event.preventDefault();
			const forward = !event.shiftKey;
			this.RunFind((target as HTMLInputElement).value, forward);
		}
	}

	// Moves to the next or previous find match from the find-navigation buttons.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const isNext = target?.closest("[data-find-next]") != null;
		const isPrev = target?.closest("[data-find-prev]") != null;

		if (isNext || isPrev)
		{
			const query = this.root.querySelector<HTMLInputElement>("[data-find-input]")?.value ?? "";
			this.RunFind(query, isNext);
		}
		const step = target?.closest<HTMLElement>("[data-passage-step]")?.dataset.passageStep;
		const document = this.library.GetText();
		if (step !== undefined && document !== null)
		{
			const locators = this.CollectLocators(document);
			const input = this.root.querySelector<HTMLInputElement>("[data-locator-jump]");
			const currentIndex = locators.indexOf(input?.value ?? "");
			const nextIndex = Math.max(0, Math.min(locators.length - 1, currentIndex + Number(step)));
			const locator = locators[nextIndex];
			if (locator !== undefined) this.JumpToLocator(locator);
		}
	}

	// Scrolls to the segment whose Stephanus locator matches the given value.
	private JumpToLocator(value: string): void
	{
		const normalized = value.trim().toLocaleLowerCase();

		if (normalized.length > 0)
		{
			const segments = Array.from(this.root.querySelectorAll<HTMLElement>("[data-locator]"));
			let match: HTMLElement | null = null;

			for (const segment of segments)
			{
				const locator = (segment.dataset.locator ?? "").toLocaleLowerCase();
				if (locator === normalized)
				{
					match = segment;
					break;
				}
			}

			if (match !== null) this.ScrollToSegment(match);
			const input = this.root.querySelector<HTMLInputElement>("[data-locator-jump]");
			if (match !== null && input !== null) input.value = match.dataset.locator ?? value;
		}
	}

	// Scrolls a segment into view below the toolbar and records it as the reading focus.
	private ScrollToSegment(segment: HTMLElement): void
	{
		const toolbar = this.root.querySelector<HTMLElement>(".reader-toolbar");
		const rootBounds = this.root.getBoundingClientRect();
		const segmentBounds = segment.getBoundingClientRect();
		const toolbarHeight = toolbar?.getBoundingClientRect().height ?? 0;
		const targetPosition = this.root.scrollTop + segmentBounds.top - rootBounds.top - toolbarHeight - 16;
		this.root.scrollTop = Math.max(0, targetPosition);

		const segmentKey = segment.dataset.segmentKey;
		if (segmentKey !== undefined) this.controller.SetFocusSegment(segmentKey);
	}

	// Highlights every occurrence of the query and focuses the first or next match.
	private RunFind(query: string, forward: boolean): void
	{
		const trimmed = query.trim();
		const isRepeat = this.findHits.length > 0 && trimmed.toLocaleLowerCase() === this.activeFindQuery;

		if (isRepeat)
		{
			this.MoveFind(forward ? 1 : -1);
		}
		else
		{
			this.ClearFindHighlights();
			if (trimmed.length > 0)
			{
				this.HighlightMatches(trimmed);
				this.activeFindQuery = trimmed.toLocaleLowerCase();
				this.findIndex = 0;
				this.FocusFindHit();
			}
			this.UpdateFindCount();
		}
	}

	// Wraps every occurrence of the query in each segment with a highlight mark.
	private HighlightMatches(query: string): void
	{
		const lowerQuery = query.toLocaleLowerCase();
		const segments = this.root.querySelectorAll<HTMLElement>(".segment-text");

		segments.forEach((element) =>
		{
			const text = element.textContent ?? "";
			const lowerText = text.toLocaleLowerCase();
			if (lowerText.includes(lowerQuery)) element.innerHTML = this.BuildHighlightedHtml(text, lowerText, lowerQuery);
		});

		this.findHits = Array.from(this.root.querySelectorAll<HTMLElement>("mark.find-hit"));
	}

	// Builds segment markup with every query occurrence wrapped in a highlight mark.
	private BuildHighlightedHtml(text: string, lowerText: string, lowerQuery: string): string
	{
		let html = "";
		let cursor = 0;
		let index = lowerText.indexOf(lowerQuery, cursor);

		while (index !== -1)
		{
			const prefix = text.slice(cursor, index);
			const matchText = text.slice(index, index + lowerQuery.length);
			html += `${EscapeHtml(prefix)}<mark class="find-hit">${EscapeHtml(matchText)}</mark>`;
			cursor = index + lowerQuery.length;
			index = lowerText.indexOf(lowerQuery, cursor);
		}

		html += EscapeHtml(text.slice(cursor));
		return html;
	}

	// Removes find highlights and resets find-navigation state.
	private ClearFindHighlights(): void
	{
		const parents = new Set<HTMLElement>();
		this.root.querySelectorAll<HTMLElement>("mark.find-hit").forEach((mark) =>
		{
			const parent = mark.parentElement;
			if (parent !== null) parents.add(parent);
		});
		parents.forEach((element) =>
		{
			const text = element.textContent ?? "";
			element.textContent = text;
		});
		this.findHits = [];
		this.findIndex = 0;
		this.activeFindQuery = "";
	}

	// Moves the focused find match forward or backward, wrapping at either end.
	private MoveFind(delta: number): void
	{
		if (this.findHits.length > 0)
		{
			this.findIndex = (this.findIndex + delta + this.findHits.length) % this.findHits.length;
			this.FocusFindHit();
			this.UpdateFindCount();
		}
	}

	// Marks the current find match active and scrolls it into view.
	private FocusFindHit(): void
	{
		this.findHits.forEach((hit) => hit.classList.remove("active"));
		const hit = this.findHits[this.findIndex];

		if (hit !== undefined)
		{
			hit.classList.add("active");
			hit.scrollIntoView({ behavior: "smooth", block: "center" });
			const segmentKey = hit.closest<HTMLElement>("[data-segment-key]")?.dataset.segmentKey;
			if (segmentKey !== undefined) this.controller.SetFocusSegment(segmentKey);
		}
	}

	// Updates the find-match position indicator.
	private UpdateFindCount(): void
	{
		const count = this.root.querySelector<HTMLElement>("[data-find-count]");
		if (count !== null) count.textContent = this.findHits.length === 0 ? "" : `${this.findIndex + 1}/${this.findHits.length}`;
		const total = this.findHits.length;
		const current = total === 0 ? 0 : this.findIndex + 1;
		void this.events.PublishAsync("library.find-results-changed", { current, total });
	}

	// Scrolls to the selected book heading below the toolbar.
	private JumpToBook(book: string): void
	{
		const bookHeading = this.root.querySelector<HTMLElement>(`[data-book-heading="${CSS.escape(book)}"]`);
		const firstSegment = this.root.querySelector<HTMLElement>(`[data-book-start="${CSS.escape(book)}"]`);
		const toolbar = this.root.querySelector<HTMLElement>(".reader-toolbar");

		if (bookHeading !== null && firstSegment !== null)
		{
			const rootBounds = this.root.getBoundingClientRect();
			const headingBounds = bookHeading.getBoundingClientRect();
			const toolbarHeight = toolbar?.getBoundingClientRect().height ?? 0;
			const targetPosition = this.root.scrollTop + headingBounds.top - rootBounds.top - toolbarHeight - 16;
			this.root.scrollTop = Math.max(0, targetPosition);

			const segmentKey = firstSegment.dataset.segmentKey;
			if (segmentKey !== undefined) this.controller.SetFocusSegment(segmentKey);
		}
	}

	// Formats a book division value as a Roman numeral, falling back to the raw value.
	private FormatBookNumber(value: string): string
	{
		const romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
		const index = Number.parseInt(value, 10) - 1;
		const formatted = romanNumbers[index] ?? value;

		return formatted;
	}

	// Captures the reader's raw browser selection and reports it to the controller.
	private CaptureCurrentSelection(): void
	{
		const document = this.library.GetText();
		if (document !== null) this.controller.SetSelection(CaptureSelection(document));
	}

	// Captures the selection under the pointer and shows the selection context menu.
	private async HandleContextMenuAsync(event: Event): Promise<void>
	{
		const document = this.library.GetText();
		const browserSelection = document === null ? null : CaptureSelection(document);
		this.controller.SetSelection(browserSelection);
		const selection = this.library.GetSelection();

		if (selection !== null)
		{
			event.preventDefault();
			await this.controller.HandleSelectionActionAsync(selection);
		}
	}

	// Scrolls a requested selection into view and clears the browser's native selection.
	private JumpToSelection(selection: TextSelection): void
	{
		const segmentKey = selection.start.segmentKey;
		const segment = this.root.querySelector<HTMLElement>(`[data-segment-key="${CSS.escape(segmentKey)}"]`);
		segment?.scrollIntoView({ behavior: "smooth", block: "center" });
		if (segment !== null) this.controller.SetFocusSegment(segmentKey);
		ClearBrowserSelection();
	}

	// Schedules a debounced capture of the segment at the top reading edge.
	private ScheduleReadingFocus(): void
	{
		if (this.focusTimer !== null) clearTimeout(this.focusTimer);
		this.focusTimer = setTimeout(this.HandleFocusTimer.bind(this), 100);
	}

	// Captures the reading focus once a pending debounce timer elapses.
	private HandleFocusTimer(): void
	{
		this.focusTimer = null;
		this.CaptureReadingFocus();
	}

	// Records the first segment visible below the toolbar as the reading focus.
	private CaptureReadingFocus(): void
	{
		const viewport = this.root.getBoundingClientRect();
		const toolbar = this.root.querySelector<HTMLElement>(".reader-toolbar");
		const toolbarBottom = toolbar?.getBoundingClientRect().bottom ?? viewport.top;
		const readingTop = Math.max(viewport.top, toolbarBottom) + 16;
		let closest: HTMLElement | null = null;
		let distance = Number.POSITIVE_INFINITY;
		const segmentNodes = this.root.querySelectorAll<HTMLElement>("[data-segment-key]");
		const segments = Array.from(segmentNodes);

		for (const segment of segments)
		{
			const bounds = segment.getBoundingClientRect();
			const segmentDistance = Math.max(0, bounds.top - readingTop);
			if (bounds.bottom > readingTop && bounds.top < viewport.bottom && segmentDistance < distance)
			{
				closest = segment;
				distance = segmentDistance;
			}
		}

		const segmentKey = closest?.dataset.segmentKey;
		if (segmentKey !== undefined) this.controller.SetFocusSegment(segmentKey);
	}
}
