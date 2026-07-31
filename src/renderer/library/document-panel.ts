import type { LibraryText, SourceNotice } from "../../shared/library/library-types.js";
import type { TextSelection } from "../../shared/library/selection-types.js";
import type { ChoraEvents } from "../core/events/chora-events.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/chora-event-bus.js";
import { LibraryController } from "../library/library-controller.js";
import { LibraryStore } from "../library/library-store.js";
import { CaptureSelection, ClearBrowserSelection } from "./selection.js";
import { EscapeHtml } from "../ui/html.js";

export class DocumentPanel
{
	private readonly subscriptions: Unsubscribe[] = [];
	private fontSize = 18;
	private backgroundColor = "#fbfaf7";
	private foregroundColor = "#30343b";
	private focusTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly root: HTMLElement, private readonly events: ChoraEventBus<ChoraEvents>, private readonly library: LibraryStore, private readonly controller: LibraryController)
	{
		this.root.addEventListener("click", (event) => this.HandleClick(event));
		this.root.addEventListener("change", (event) => this.HandleChange(event));
		this.root.addEventListener("mouseup", () => this.CaptureCurrentSelection());
		this.root.addEventListener("keyup", () => this.CaptureCurrentSelection());
		this.root.addEventListener("scroll", () => this.ScheduleReadingFocus());
		this.root.addEventListener("contextmenu", (event) => void this.HandleContextMenuAsync(event));
		this.subscriptions.push(this.events.Subscribe("library.text-opened", (event) => this.Update(event.text, event.sourceNotice)));
		this.subscriptions.push(this.events.Subscribe("library.jump-requested", (event) => this.JumpToSelection(event.selection)));
	}

	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
		if (this.focusTimer !== null) clearTimeout(this.focusTimer);
	}

	private Update(document: LibraryText, sourceNotice: SourceNotice | null): void
	{
		let previousDivision = "";
		const segments = document.segments.map((segment) =>
		{
			const divisionValue = segment.division?.kind === "book" ? segment.division.value : "";
			const startsDivision = divisionValue.length > 0 && divisionValue !== previousDivision;
			const heading = startsDivision ? `<h2 class="book-heading" data-book-heading="${EscapeHtml(divisionValue)}">Book ${EscapeHtml(this.FormatBookNumber(divisionValue))}</h2>` : "";
			previousDivision = divisionValue;
			const bookTarget = startsDivision ? ` data-book-start="${EscapeHtml(divisionValue)}"` : "";
			const segmentMarkup = `<p class="text-segment ${segment.locator === null ? "" : "has-locator"}" data-segment-key="${EscapeHtml(segment.key)}"${bookTarget}>${segment.locator === null ? "" : `<span class="source-locator">${EscapeHtml(segment.locator.value)}</span>`}${segment.speaker === null ? "" : `<span class="speaker-label">${EscapeHtml(segment.speaker)}</span>`}<span class="segment-text">${EscapeHtml(segment.text)}</span></p>`;
			return `${heading}${segmentMarkup}`;
		}).join("");
		const books = document.segments.map((segment) => segment.division).filter((division, index, divisions) => division?.kind === "book" && divisions.findIndex((candidate) => candidate?.kind === "book" && candidate.value === division.value) === index);
		const bookNavigation = books.length === 0 ? "" : `<label class="reader-control reader-book-control"><span>Go to</span><select data-book-navigation aria-label="Go to book">${books.map((book) => `<option value="${EscapeHtml(book?.value ?? "")}">Book ${EscapeHtml(this.FormatBookNumber(book?.value ?? ""))}</option>`).join("")}</select></label>`;
		const notice = sourceNotice === null ? "" : `<details class="source-notice"><summary>Source information</summary><div class="source-details">${EscapeHtml(sourceNotice.source)} · ${EscapeHtml(sourceNotice.license)}</div></details>`;

		this.root.innerHTML = `<section id="readingPane" style="--reader-font-size:${this.fontSize}px;--reader-background:${this.backgroundColor};--reader-foreground:${this.foregroundColor}"><div class="reader-toolbar">${bookNavigation}<button class="reader-button" data-font-change="-1">A-</button><span class="reader-font-size">${this.fontSize}</span><button class="reader-button" data-font-change="1">A+</button><label class="reader-control">Page <input data-background type="color" value="${this.backgroundColor}"></label><label class="reader-control">Text <input data-foreground type="color" value="${this.foregroundColor}"></label></div><header class="work-header"><h1>${EscapeHtml(document.title)}</h1>${document.titleGreek === null ? "" : `<p class="work-header-greek">${EscapeHtml(document.titleGreek)}</p>`}</header>${notice}<div class="text-body">${segments}</div></section>`;
		this.ScheduleReadingFocus();
	}

	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const button = target?.closest<HTMLElement>("[data-font-change]");

		if (button !== null && button !== undefined)
		{
			const change = Number.parseInt(button.dataset.fontChange ?? "0", 10);
			this.fontSize = Math.max(14, Math.min(30, this.fontSize + change));
			const document = this.library.GetText();
			if (document !== null) this.Update(document, this.library.GetSourceNotice());
		}
	}

	private HandleChange(event: Event): void
	{
		const target = event.target;
		const input = target instanceof HTMLInputElement ? target : null;
		const bookNavigation = target instanceof HTMLSelectElement && target.matches("[data-book-navigation]") ? target : null;
		if (bookNavigation !== null) this.JumpToBook(bookNavigation.value);
		if (input?.matches("[data-background]") === true) this.backgroundColor = input.value;
		if (input?.matches("[data-foreground]") === true) this.foregroundColor = input.value;
		const readingPane = this.root.querySelector<HTMLElement>("#readingPane");
		if (readingPane !== null) readingPane.setAttribute("style", `--reader-font-size:${this.fontSize}px;--reader-background:${this.backgroundColor};--reader-foreground:${this.foregroundColor}`);
	}

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

	private FormatBookNumber(value: string): string
	{
		const romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
		const index = Number.parseInt(value, 10) - 1;
		const formatted = romanNumbers[index] ?? value;
		return formatted;
	}

	private CaptureCurrentSelection(): void
	{
		const document = this.library.GetText();
		if (document !== null) this.controller.SetSelection(CaptureSelection(document));
	}

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

	private JumpToSelection(selection: TextSelection): void
	{
		const segmentKey = selection.start.segmentKey;
		const segment = this.root.querySelector<HTMLElement>(`[data-segment-key="${CSS.escape(segmentKey)}"]`);
		segment?.scrollIntoView({ behavior: "smooth", block: "center" });
		ClearBrowserSelection();
	}

	private ScheduleReadingFocus(): void
	{
		if (this.focusTimer !== null) clearTimeout(this.focusTimer);
		this.focusTimer = setTimeout(() =>
		{
			this.focusTimer = null;
			this.CaptureReadingFocus();
		}, 100);
	}

	private CaptureReadingFocus(): void
	{
		const viewport = this.root.getBoundingClientRect();
		const center = viewport.top + viewport.height / 2;
		let closest: HTMLElement | null = null;
		let distance = Number.POSITIVE_INFINITY;

		this.root.querySelectorAll<HTMLElement>("[data-segment-key]").forEach((segment) =>
		{
			const bounds = segment.getBoundingClientRect();
			const segmentDistance = Math.abs(bounds.top + bounds.height / 2 - center);
			if (bounds.bottom >= viewport.top && bounds.top <= viewport.bottom && segmentDistance < distance)
			{
				closest = segment;
				distance = segmentDistance;
			}
		});

		const segmentKey = closest === null ? undefined : (closest as HTMLElement).dataset.segmentKey;
		if (segmentKey !== undefined) this.controller.SetFocusSegment(segmentKey);
	}
}
