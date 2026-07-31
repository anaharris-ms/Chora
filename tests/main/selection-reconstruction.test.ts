import { describe, expect, it } from "vitest";
import type { LibraryText } from "../../src/shared/library/library-types.js";
import { ReconstructSelection, ValidateSelectionText } from "../../src/main/library/selection-service.js";

const work: LibraryText = {
	id: "republic",
	urn: null,
	title: "Republic",
	titleGreek: "Πολιτεία",
	author: "Plato",
	language: "grc",
	edition: {
		editor: "John Burnet",
		title: null,
		volume: null,
		publisher: null,
		publicationPlace: null,
		publicationDate: null
	},
	provenance: {
		repository: "PerseusDL/canonical-greekLit",
		commit: "sample-local-starter-corpus",
		sourceFile: "sample.xml",
		license: "CC-BY-SA-4.0"
	},
	segments: [
		{
			key: "s1",
			locator: {
				scheme: "stephanus",
				value: "327a"
			},
			speaker: "ΣΩ.",
			text: "Κατέβην χθὲς",
			blockKind: "speech"
		},
		{
			key: "s2",
			locator: {
				scheme: "stephanus",
				value: "327b"
			},
			speaker: null,
			text: " εἰς Πειραιᾶ",
			blockKind: "narration"
		}
	]
};

describe("selection reconstruction", () => {
	it("reconstructs a cross-segment selection canonically", () => {
		const selection = ReconstructSelection(work, {
			documentId: "republic",
			start: {
				segmentKey: "s1",
				offset: 0
			},
			end: {
				segmentKey: "s2",
				offset: 12
			},
			selectedText: "Κατέβην χθὲς\n εἰς Πειραιᾶ",
			locatorStart: null,
			locatorEnd: null
		});
		expect(selection.selectedText).toBe("Κατέβην χθὲς\n εἰς Πειραιᾶ");
		expect(selection.locatorStart?.value).toBe("327a");
		expect(selection.locatorEnd?.value).toBe("327b");
	});

	it("validates the reconstructed selection text", () => {
		expect(() =>
			ValidateSelectionText(work, {
				documentId: "republic",
				start: {
					segmentKey: "s1",
					offset: 0
				},
				end: {
					segmentKey: "s2",
					offset: 12
				},
				selectedText: "Κατέβην χθὲς\n εἰς Πειραιᾶ",
				locatorStart: null,
				locatorEnd: null
			})
		).not.toThrow();
	});

	it("rejects offsets outside the canonical segment", () => {
		expect(() => ReconstructSelection(work, {
			documentId: "republic",
			start: { segmentKey: "s1", offset: -1 },
			end: { segmentKey: "s1", offset: 2 },
			selectedText: "",
			locatorStart: null,
			locatorEnd: null
		})).toThrow("Invalid selection offset");
	});

	it("rejects selections from another document", () => {
		expect(() => ReconstructSelection(work, {
			documentId: "other",
			start: { segmentKey: "s1", offset: 0 },
			end: { segmentKey: "s1", offset: 2 },
			selectedText: "",
			locatorStart: null,
			locatorEnd: null
		})).toThrow("does not match the active document");
	});
});
