import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { EscapeHtml } from "../ui/Html.js";
import { PatternController } from "./PatternController.js";
import { PatternStore } from "./PatternStore.js";

// Renders Hermeneia patterns and reader navigation in Chora's left panel.
export class PatternPanel
{
	// Retained event subscriptions released on disposal.
	private readonly subscriptions: Unsubscribe[] = [];

	// Registers delegated interactions and re-renders on pattern state changes.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly store: PatternStore,
		private readonly controller: PatternController
	)
	{
		this.root.addEventListener("click", this.HandleClick.bind(this));
		this.subscriptions.push(this.events.Subscribe("patterns.changed", this.Update.bind(this)));
		this.Update();
	}

	// Releases retained subscriptions.
	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
	}

	// Renders the current pattern scope with its read-only records.
	private Update(): void
	{
		const selectedId = this.store.GetSelectedPattern()?.id;
		const focusedLocator = this.store.GetFocusedLocator();
		const showAllPatterns = this.store.GetShowAllPatterns();
		const patternItems = this.store.GetPatterns().map((pattern) => {
			const selected = pattern.id === selectedId ? " selected" : "";
			const forms = pattern.forms.map((form) => `<span class="pattern-form">${EscapeHtml(form)}</span>`).join("");

			return `<button class="pattern-item button-control${selected}" data-pattern-id="${EscapeHtml(pattern.id)}" type="button"><strong>${EscapeHtml(pattern.title)}</strong><span class="pattern-locator">${EscapeHtml(pattern.locator)}</span><span class="pattern-forms">${forms}</span><span class="pattern-observation">${EscapeHtml(pattern.observation)}</span></button>`;
		}).join("");
		const scopeLabel = showAllPatterns ? "All patterns in section" : `Patterns near ${focusedLocator ?? "the current passage"}`;
		const filterLabel = showAllPatterns ? "Follow reading" : "Show section";
		const empty = patternItems.length === 0 ? `<p class="pattern-empty">No patterns at ${EscapeHtml(focusedLocator ?? "this location")}.</p>` : "";
		this.root.innerHTML = `<section class="pattern-panel left-tab-panel"><header class="pattern-header"><h2>Patterns</h2><span>Hermeneia</span></header><section class="pattern-context"><strong>Textual patterns</strong><span>${EscapeHtml(scopeLabel)}</span><button class="pattern-filter button-control" data-pattern-filter type="button">${EscapeHtml(filterLabel)}</button></section><div class="pattern-list">${patternItems}${empty}</div></section>`;
	}

	// Handles selection of one pattern record.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const id = target?.closest<HTMLElement>("[data-pattern-id]")?.dataset.patternId;
		const filter = target?.closest("[data-pattern-filter]") !== null;

		if (id !== undefined)
		{
			void this.controller.SelectPatternAsync(id);
		}
		if (filter)
		{
			const showAllPatterns = this.store.GetShowAllPatterns();
			this.controller.SetShowAllPatterns(!showAllPatterns);
		}
	}
}