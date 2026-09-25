import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { PatternController } from "../../src/renderer/patterns/PatternController.js";
import { PatternGateway } from "../../src/renderer/patterns/PatternGateway.js";
import { PatternStore } from "../../src/renderer/patterns/PatternStore.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import type { LibraryText } from "../../src/shared/library/LibraryTypes.js";

// Representative document containing a locator that overlaps the fixture data.
const foreignDocument: LibraryText = {
	id: "foreign-text",
	title: "Foreign text",
	segments: [{ key: "foreign-353b", locator: { scheme: "Stephanus", value: "353b" }, text: "Foreign passage." }]
};

// Hermeneia-backed preload records used by the renderer boundary tests.
const patterns = [
	{
		id: "republic-book-01-section-08:p001:353b",
		documentId: "republic",
		title: "The soul",
		forms: ["ἔργον", "ἀρετή"],
		observation: "A recurrence.",
		locator: "353b"
	},
	{
		id: "republic-book-01-section-08:p002:353c",
		documentId: "republic",
		title: "The soul",
		forms: ["εὖ", "κακῶς"],
		observation: "A contrast.",
		locator: "353c"
	}
];

// Configures the context-isolated API expected by the renderer gateway.
function ConfigurePatternsApi(): void
{
	vi.stubGlobal("window", { chora: { ListPatterns: vi.fn(async () => structuredClone(patterns)) } });
}

describe("PatternController", function PatternControllerTests()
{
	afterEach(function RestorePatternsApi()
	{
		vi.unstubAllGlobals();
	});

	it("does not navigate when the open document does not own the pattern", async function PreventsForeignNavigation()
	{
		ConfigurePatternsApi();
		const events = new ChoraEventBus<ChoraEvents>();
		const publish = vi.spyOn(events, "PublishAsync");
		const store = new PatternStore();
		const library = new LibraryStore();
		library.Open(foreignDocument, null);
		const controller = new PatternController(events, store, new PatternGateway(), library);
		await controller.LoadAsync("republic");
		controller.SetDocumentId("republic");
		controller.SetShowAllPatterns(true);

		await controller.SelectPatternAsync("republic-book-01-section-08:p001:353b");

		expect(publish).not.toHaveBeenCalledWith("library.jump-requested", expect.anything());
	});

	it("limits visible patterns to the document and focused locator", async function ScopesPatternsAsync()
	{
		ConfigurePatternsApi();
		const store = new PatternStore();
		const controller = new PatternController(new ChoraEventBus<ChoraEvents>(), store, new PatternGateway(), new LibraryStore());
		await controller.LoadAsync("republic");
		controller.SetDocumentId("republic");
		controller.SetFocusedLocator("353b");

		expect(store.GetPatterns().map((pattern) => pattern.id)).toEqual(["republic-book-01-section-08:p001:353b"]);
		controller.SetDocumentId("foreign-text");

		expect(store.GetPatterns()).toEqual([]);
		expect(store.GetSelectedPattern()).toBeNull();
	});

	it("returns immutable snapshots and reconciles hidden selection", async function ProtectsStoreStateAsync()
	{
		ConfigurePatternsApi();
		const store = new PatternStore();
		const controller = new PatternController(new ChoraEventBus<ChoraEvents>(), store, new PatternGateway(), new LibraryStore());
		await controller.LoadAsync("republic");
		controller.SetDocumentId("republic");
		controller.SetShowAllPatterns(true);
		const snapshot = store.GetPatterns();
		const first = snapshot[0];

		if (first !== undefined)
		{
			(first.forms as string[]).push("untracked");
		}

		store.SelectPattern("republic-book-01-section-08:p002:353c");
		controller.SetShowAllPatterns(false);
		controller.SetFocusedLocator("353b");

		expect(store.GetPatterns()[0]?.forms).not.toContain("untracked");
		expect(store.GetSelectedPattern()?.id).toBe("republic-book-01-section-08:p001:353b");
	});
});
