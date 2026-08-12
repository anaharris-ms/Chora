import { describe, expect, it } from "vitest";
import { ReadingContextBuilder } from "../../src/renderer/core/context/ReadingContextBuilder.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import type { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import type { LibraryText } from "../../src/shared/library/LibraryTypes.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";
import type { TextSelection } from "../../src/shared/library/SelectionTypes.js";

describe("ReadingContextBuilder", function ReadingContextBuilderTests()
{
	it("packages the complete active Dream and its exact source", function PackagesDreamContext()
	{
		const dream = {
			id: "dream-1",
			workId: "republic",
			title: "Descent",
			reflection: "A voluntary movement downward.",
			source: {
				documentId: "republic",
				selectedText: "κατέβην",
				contextBefore: "Before the passage.",
				contextAfter: "After the passage.",
				locatorStart: { scheme: "Stephanus", value: "327a" },
				start: { segmentKey: "s1", offset: 0 },
				end: { segmentKey: "s1", offset: 7 }
			},
			signals: [
				{ text: "κατέβην", description: "The chosen descent." },
				{ text: "χθές", description: "The narrated time." }
			]
		} as Dream;
		const library = new LibraryStore();
		const dreams = { GetActiveDream: () => dream } as unknown as DreamStore;
		const manager = new ReadingContextBuilder(library, dreams);

		const context = manager.GetContext();

		expect(context.mode).toBe("DREAM");
		if (context.mode === "DREAM")
		{
			expect(context.sourcePassage).toBe("κατέβην");
			expect(context.contextBefore).toBe("Before the passage.");
			expect(context.contextAfter).toBe("After the passage.");
			expect(context.dream).toEqual({
				id: "dream-1",
				title: "Descent",
				exegesis: "A voluntary movement downward.",
				signals: [
					{ text: "κατέβην", description: "The chosen descent." },
					{ text: "χθές", description: "The narrated time." }
				]
			});
		}
	});

	it("infers text and free modes from the available reading state", function InfersModes()
	{
		let selection: TextSelection | null = {
			documentId: "republic",
			selectedText: "κατέβην",
			locatorStart: { scheme: "Stephanus", value: "327a" },
			start: { segmentKey: "s1", offset: 0 },
			end: { segmentKey: "s1", offset: 7 }
		};
		let document = { id: "republic" } as LibraryText | null;
		const library = new LibraryStore();
		if (document !== null) library.Open(document, null);
		library.SetSelection(selection);
		const dreams = { GetActiveDream: () => null } as unknown as DreamStore;
		const manager = new ReadingContextBuilder(library, dreams);

		expect(manager.GetContext().mode).toBe("TEXT");
		selection = null;
		document = null;
		library.Open({ id: "empty", segments: [] } as LibraryText, null);
		library.SetSelection(null);
		expect(manager.GetContext()).toEqual({ mode: "FREE" });
	});
});
