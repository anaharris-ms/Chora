import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { PatternGateway } from "./PatternGateway.js";
import { PatternStore } from "./PatternStore.js";

// Coordinates Hermeneia patterns and requests reader movement for a selected locator.
export class PatternController
{
	// Creates the controller with its local state, read-only source, and shared event bus.
	public constructor(
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly store: PatternStore,
		private readonly gateway: PatternGateway,
		private readonly library: LibraryStore
	)
	{
	}

	// Loads the patterns that belong to the requested reader text.
	public async LoadAsync(documentId: string): Promise<void>
	{
		const patterns = await this.gateway.ListAsync(documentId);
		this.store.SetPatterns(patterns);
		await this.events.PublishAsync("patterns.changed", {});
	}

	// Updates the default pattern scope to follow the reader's focused source location.
	public SetFocusedLocator(locator: string | null): void
	{
		this.store.SetFocusedLocator(locator);
		void this.events.PublishAsync("patterns.changed", {});
	}

	// Updates the pattern scope to the text currently open in the reader.
	public SetDocumentId(documentId: string | null): void
	{
		this.store.SetDocumentId(documentId);
		void this.events.PublishAsync("patterns.changed", {});
	}

	// Selects whether the panel should follow the reader or show the whole mock section.
	public SetShowAllPatterns(showAllPatterns: boolean): void
	{
		this.store.SetShowAllPatterns(showAllPatterns);
		void this.events.PublishAsync("patterns.changed", {});
	}

	// Selects a pattern and asks the reader to reveal its source passage.
	public async SelectPatternAsync(id: string): Promise<void>
	{
		this.store.SelectPattern(id);
		await this.events.PublishAsync("patterns.changed", {});
		const document = this.library.GetText();
		const pattern = this.store.GetSelectedPattern();
		const patternLocator = pattern?.documentId === document?.id ? pattern?.locator ?? null : null;
		const segment = patternLocator === null ? undefined : document?.segments.find((candidate) => candidate.locator?.value === patternLocator);

		if (document !== null && pattern !== null && segment !== undefined)
		{
			const selection: TextSelection = {
				documentId: document.id,
				start: { segmentKey: segment.key, offset: 0 },
				end: { segmentKey: segment.key, offset: segment.text.length },
				selectedText: segment.text,
				locatorStart: segment.locator,
				locatorEnd: segment.locator
			};
			await this.events.PublishAsync("library.jump-requested", { selection });
		}
	}
}