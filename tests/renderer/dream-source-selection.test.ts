import { describe, expect, it } from "vitest";
import { CreateDreamSourceSelection } from "../../src/renderer/dreams/source-selection.js";
import type { LibraryText } from "../../src/shared/library/library-types.js";
import type { SourceSelection } from "../../src/shared/dreams/dream-types.js";

const work = {
	id: "republic",
	segments: [
		{ key: "s1", locator: { scheme: "Stephanus", value: "327a" }, text: "abcdef" },
		{ key: "s2", locator: { scheme: "Stephanus", value: "327b" }, text: "ghijkl" }
	]
} as LibraryText;

const source: SourceSelection = {
	documentId: "republic",
	start: { segmentKey: "s1", offset: 2 },
	end: { segmentKey: "s2", offset: 3 },
	selectedText: "cdef\nghi",
	locatorStart: work.segments[0]?.locator ?? null,
	locatorEnd: work.segments[1]?.locator ?? null,
	sourceRefs: ["s1", "s2"],
	startSourceRef: "s1",
	endSourceRef: "s2"
};

describe("Dream source selection", function DreamSourceSelectionTests()
{
	it("maps a copied-source selection back to exact canonical coordinates", function MapsCopiedSourceSelection()
	{
		const selection = CreateDreamSourceSelection(work, source, 1, 7);

		expect(selection?.start).toEqual({ segmentKey: "s1", offset: 3 });
		expect(selection?.end).toEqual({ segmentKey: "s2", offset: 2 });
		expect(selection?.selectedText).toBe("def\ngh");
		expect(selection?.locatorStart?.value).toBe("327a");
		expect(selection?.locatorEnd?.value).toBe("327b");
	});

	it("rejects an empty selection", function RejectsEmptySelection()
	{
		expect(CreateDreamSourceSelection(work, source, 2, 2)).toBeNull();
	});
});
