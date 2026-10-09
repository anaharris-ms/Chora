// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ReadingSettingsStore } from "../../src/renderer/core/settings/ReadingSettingsStore.js";
import { DocumentPanel } from "../../src/renderer/library/DocumentPanel.js";
import { LibraryController } from "../../src/renderer/library/LibraryController.js";
import { LibraryGateway } from "../../src/renderer/library/LibraryGateway.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import type { LibraryText, LibraryTextSummary, SourceNotice } from "../../src/shared/library/LibraryTypes.js";

// Library summary available from the empty startup workspace.
const summary: LibraryTextSummary = {
	id: "republic",
	urn: null,
	title: "Republic",
	titleGreek: null,
	author: "Plato",
	language: "grc",
	editor: null,
	fileName: "republic.json"
};

// Full text opened when Dream creation begins.
const libraryText: LibraryText = {
	...summary,
	edition: { editor: null, title: null, volume: null, publisher: null, publicationPlace: null, publicationDate: null },
	provenance: { repository: "PerseusDL", commit: "test", sourceFile: "republic.xml", license: "CC" },
	segments: [{ key: "s1", locator: { scheme: "Stephanus", value: "327a" }, speaker: null, text: "κατέβην", blockKind: "narration" }]
};

// Source attribution returned with the startup text.
const sourceNotice: SourceNotice = {
	source: "PerseusDL",
	editor: null,
	editionTitle: null,
	repository: "PerseusDL",
	license: "CC"
};

describe("DocumentPanel startup", function DocumentPanelStartupTests()
{
	let panel: DocumentPanel;
	let root: HTMLElement;
	let events: ChoraEventBus<ChoraEvents>;
	let controller: LibraryController;

	beforeEach(async function SetupAsync()
	{
		root = document.createElement("div");
		document.body.append(root);
		events = new ChoraEventBus<ChoraEvents>();
		const errors = new ErrorManager(events);
		const store = new LibraryStore();
		vi.stubGlobal("window", {
			...window,
			chora: {
				ListLibraryTexts: vi.fn(async function ListLibraryTexts(): Promise<LibraryTextSummary[]> { return [summary]; }),
				LoadLibraryText: vi.fn(async function LoadLibraryText(): Promise<LibraryText> { return libraryText; }),
				GetSourceNotice: vi.fn(async function GetSourceNotice(): Promise<SourceNotice> { return sourceNotice; })
			}
		});
		controller = new LibraryController(events, errors, store, new LibraryGateway());
		panel = new DocumentPanel(root, events, store, controller, new ReadingSettingsStore());
		await controller.StartAsync();
	});

	afterEach(function Cleanup(): void
	{
		panel.Dispose();
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("renders the preferred text after Library startup", function RendersPreferredText()
	{
		expect(root.querySelector("#readingPane")).not.toBeNull();
		expect(root.textContent).toContain("κατέβην");
	});
});
