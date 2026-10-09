import { createElement, Sparkles } from "lucide";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { DreamController } from "./DreamController.js";

// Owns Dream discovery buttons beside existing reading-pane passage labels.
export class DreamPassagePanel
{
	// Application subscriptions released with this panel.
	private readonly subscriptions: Unsubscribe[] = [];
	// Retained delegated click listener for deterministic cleanup.
	private readonly clickHandler = this.HandleClick.bind(this);
	// Decorates existing labels without replacing source text or moving reading focus.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly library: LibraryStore,
		private readonly controller: DreamController)
	{
		this.root.addEventListener("click", this.clickHandler);
		const update = this.Update.bind(this);
		this.subscriptions.push(this.events.Subscribe("library.text-opened", update));
		this.subscriptions.push(this.events.Subscribe("dream.catalogue-changed", update));
		this.subscriptions.push(this.events.Subscribe("dream.saved", update));
		this.Update();
	}

	// Removes listeners and owned buttons without touching the document content.
	public Dispose(): void
	{
		this.root.removeEventListener("click", this.clickHandler);
		for (const unsubscribe of this.subscriptions)
		{
			unsubscribe();
		}
		this.subscriptions.length = 0;
		const nodes = this.root.querySelectorAll("[data-passage-dreams]");
		const buttons = Array.from(nodes);
		for (const button of buttons)
		{
			button.remove();
		}
	}

	// Refreshes only passage buttons after catalogue changes, preserving selection and scrolling.
	private Update(): void
	{
		const counts = this.controller.GetPassageCounts();
		const nodes = this.root.querySelectorAll<HTMLElement>(".source-locator");
		const locators = Array.from(nodes);
		for (const locator of locators)
		{
			const segment = locator.closest<HTMLElement>("[data-segment-key]");
			const key = segment?.dataset.segmentKey ?? "";
			const count = counts.get(key) ?? 0;
			let button = locator.querySelector<HTMLButtonElement>("[data-passage-dreams]");
			if (count > 0)
			{
				if (button === null)
				{
					button = document.createElement("button");
					button.type = "button";
					button.className = "passage-dream-button button-control";
					button.dataset.passageDreams = key;
					const icon = createElement(Sparkles);
					icon.setAttribute("aria-hidden", "true");
					button.append(icon);
					locator.append(button);
				}
				const label = `${count} ${count === 1 ? "Dream" : "Dreams"} for ${segment?.dataset.locator ?? "this passage"}`;
				button.title = label;
				button.setAttribute("aria-label", label);
			}
			else
			{
				button?.remove();
			}
		}
	}

	// Requests the catalogue restriction through the typed event bus.
	private HandleClick(event: MouseEvent): void
	{
		const target = event.target;
		if (target instanceof Element)
		{
			const button = target.closest<HTMLElement>("[data-passage-dreams]");
			const segmentKey = button?.dataset.passageDreams;
			const document = this.library.GetText();
			if (segmentKey !== undefined && document !== null)
			{
				event.preventDefault();
				void this.events.PublishAsync("dream.passage-filter-requested", { workId: document.id, segmentKey });
			}

		}
	}
}