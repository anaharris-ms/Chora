import { createElement, Link2, Sparkles } from "lucide";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { DreamController } from "./DreamController.js";
import { PopupPanel } from "../ui/PopupPanel.js";
import { EscapeHtml } from "../ui/Html.js";
import type { ResonanceHit } from "./DreamStore.js";

// Owns Dream discovery buttons beside existing reading-pane passage labels.
export class DreamPassagePanel
{
	// Application subscriptions released with this panel.
	private readonly subscriptions: Unsubscribe[] = [];
	// Retained delegated click listener for deterministic cleanup.
	private readonly clickHandler = this.HandleClick.bind(this);
	// Popup disambiguating multiple resonances anchored to the same passage.
	private readonly resonancesPopup = new PopupPanel("Resonances at this passage");

	// Decorates existing labels without replacing source text or moving reading focus.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly library: LibraryStore,
		private readonly controller: DreamController)
	{
		this.root.addEventListener("click", this.clickHandler);
		this.resonancesPopup.OnBodyClick(this.HandleResonancesPopupClick.bind(this));
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
		this.resonancesPopup.Dispose();
		const nodes = this.root.querySelectorAll("[data-passage-dreams]");
		const buttons = Array.from(nodes);
		for (const button of buttons)
		{
			button.remove();
		}
		const resonanceNodes = this.root.querySelectorAll("[data-passage-resonances]");
		const resonanceButtons = Array.from(resonanceNodes);
		for (const button of resonanceButtons)
		{
			button.remove();
		}
	}

	// Refreshes only passage buttons after catalogue changes, preserving selection and scrolling.
	private Update(): void
	{
		const counts = this.controller.GetPassageCounts();
		const resonanceCounts = this.controller.GetResonancePassageCounts();
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

			const resonanceCount = resonanceCounts.get(key) ?? 0;
			let resonanceButton = locator.querySelector<HTMLButtonElement>("[data-passage-resonances]");
			if (resonanceCount > 0)
			{
				if (resonanceButton === null)
				{
					resonanceButton = document.createElement("button");
					resonanceButton.type = "button";
					resonanceButton.className = "passage-dream-button passage-resonance-button button-control";
					resonanceButton.dataset.passageResonances = key;
					const icon = createElement(Link2);
					icon.setAttribute("aria-hidden", "true");
					resonanceButton.append(icon);
					locator.append(resonanceButton);
				}
				const label = `${resonanceCount} resonance${resonanceCount === 1 ? "" : "s"} for ${segment?.dataset.locator ?? "this passage"}`;
				resonanceButton.title = label;
				resonanceButton.setAttribute("aria-label", label);
			}
			else
			{
				resonanceButton?.remove();
			}
		}
	}

	// Renders the disambiguation list for multiple resonances anchored to one passage.
	private RenderResonanceHits(hits: readonly ResonanceHit[]): string
	{
		let rows = "";

		for (const hit of hits) rows += `<div class="resonance-review-item"><div class="resonance-review-copy"><span class="resonance-review-signal">${EscapeHtml(hit.dreamTitle)} &middot; ${EscapeHtml(hit.signalText)}</span><span class="resonance-review-note">${EscapeHtml(hit.note)}</span></div><button class="dream-action-link button-control" data-open-resonance-hit="${EscapeHtml(hit.dreamId)}:${EscapeHtml(hit.signalId)}" type="button">Reveal</button></div>`;

		return rows;
	}

	// Routes a click on the resonance disambiguation popup to opening the chosen Dream and signal.
	private HandleResonancesPopupClick(event: MouseEvent): void
	{
		const target = event.target as HTMLElement | null;
		const key = target?.closest<HTMLElement>("[data-open-resonance-hit]")?.dataset.openResonanceHit;

		if (key !== undefined)
		{
			const [dreamId, signalId] = key.split(":");
			if (dreamId !== undefined && signalId !== undefined)
			{
				this.resonancesPopup.Close();
				void this.controller.OpenSignalAsync(dreamId, signalId);
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

			const resonanceButton = target.closest<HTMLElement>("[data-passage-resonances]");
			const resonanceSegmentKey = resonanceButton?.dataset.passageResonances;
			if (resonanceSegmentKey !== undefined)
			{
				event.preventDefault();
				const hits = this.controller.GetResonanceHitsAt(resonanceSegmentKey);
				if (hits.length === 1 && hits[0] !== undefined)
				{
					void this.controller.OpenSignalAsync(hits[0].dreamId, hits[0].signalId);
				}
				else if (hits.length > 1)
				{
					this.resonancesPopup.SetBodyHtml(this.RenderResonanceHits(hits));
					this.resonancesPopup.Open();
				}
			}
		}
	}
}