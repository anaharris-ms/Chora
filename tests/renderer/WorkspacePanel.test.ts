// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import { DreamController } from "../../src/renderer/dreams/DreamController.js";
import { DreamGateway } from "../../src/renderer/dreams/DreamGateway.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import { IdeaController } from "../../src/renderer/ideas/IdeaController.js";
import { IdeaGateway } from "../../src/renderer/ideas/IdeaGateway.js";
import { IdeaStore } from "../../src/renderer/ideas/IdeaStore.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import { WorkspacePanel } from "../../src/renderer/workspace/WorkspacePanel.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";
import type { IdeaRecord } from "../../src/shared/ideas/IdeaTypes.js";
import type { LibraryText, LibraryTextSummary } from "../../src/shared/library/LibraryTypes.js";

const text: LibraryText = {
	id: "republic", urn: null, title: "Republic", titleGreek: "Πολιτεία", author: "Plato", language: "grc",
	edition: { editor: null, title: null, volume: null, publisher: null, publicationPlace: null, publicationDate: null },
	provenance: { repository: "test", commit: "test", sourceFile: "test", license: "test" },
	segments: [{ key: "s1", locator: { scheme: "Stephanus", value: "327a" }, division: { kind: "book", value: "1" }, speaker: null, text: "abcdef", blockKind: "speech" }]
};

const works: LibraryTextSummary[] = [
	{ id: "republic", urn: null, title: "Republic", titleGreek: "Πολιτεία", author: "Plato", language: "grc", editor: null, fileName: "republic.json" },
	{ id: "phaedo", urn: null, title: "Phaedo", titleGreek: "Φαίδων", author: "Plato", language: "grc", editor: null, fileName: "phaedo.json" }
];

function CreateDream(id: string, title: string): Dream
{
	return {
		id, workId: "republic", dialogue: "Republic", title,
		source: {
			documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 6 },
			selectedText: "abcdef", locatorStart: { scheme: "Stephanus", value: "327a" }, locatorEnd: { scheme: "Stephanus", value: "327a" },
			sourceRefs: ["s1"], startSourceRef: "s1", endSourceRef: "s1", division: { kind: "book", value: "1" }
		},
		signals: [], reflection: "", linkedDreamIds: [], createdAt: "2026-01-01", updatedAt: "2026-01-01"
	};
}

function CreateIdea(): IdeaRecord
{
	return {
		id: "idea-1", workId: "republic", title: "Justice", content: "Justice across the dialogue",
		originSignal: { dreamId: "dream-1", signalId: "signal-1" }, relatedSignals: [],
		createdAt: "2026-01-01", updatedAt: "2026-01-01"
	};
}

afterEach(function Cleanup(): void
{
	document.body.replaceChildren();
	window.sessionStorage.clear();
	window.localStorage.clear();
	vi.restoreAllMocks();
});

describe("WorkspacePanel", function WorkspacePanelTests()
{
	it("renders one Plato Explorer and mixed Idea/Dream document tabs", async function RendersUnifiedWorkspaceAsync(): Promise<void>
	{
		const events = new ChoraEventBus<ChoraEvents>();
		const errors = new ErrorManager(events);
		const library = new LibraryStore();
		library.SetLibrary(works);
		library.Open(text, null);
		const sessions = new SessionStore();
		const dreamStore = new DreamStore(sessions);
		const first = CreateDream("dream-1", "Descent");
		const second = CreateDream("dream-2", "Return");
		dreamStore.SetCatalogue([first, second]);
		dreamStore.Open(first, false);
		const dreamGateway = new DreamGateway();
		vi.spyOn(dreamGateway, "ListAsync").mockResolvedValue([first, second]);
		vi.spyOn(dreamGateway, "SaveAsync").mockImplementation(async (dream) => structuredClone(dream));
		const copy = vi.spyOn(dreamGateway, "CopyAsync").mockResolvedValue(undefined);
		const dreamController = new DreamController(events, errors, library, dreamStore, dreamGateway);
		const ideaStore = new IdeaStore(sessions);
		ideaStore.SetWork("republic", [CreateIdea()]);
		const ideaController = new IdeaController(events, errors, ideaStore, new IdeaGateway());
		const explorer = document.createElement("div");
		const tabs = document.createElement("div");
		document.body.append(explorer, tabs);
		const panel = new WorkspacePanel(explorer, tabs, events, dreamStore, dreamController, ideaStore, ideaController, library);

		expect(explorer.textContent).toContain("Plato");
		expect(explorer.textContent).toContain("Republic");
		expect(explorer.querySelector("[data-workspace-search]")?.getAttribute("placeholder")).toBe("Filter Ideas and Dreams…");
		expect(explorer.textContent).toContain("Add work…");
		expect(explorer.textContent).toContain("Ideas");
		expect(explorer.textContent).toContain("Dreams");
		expect(explorer.textContent).toContain("Book I");
		expect(explorer.textContent).toContain("Descent (327a)");
		expect(explorer.textContent).not.toContain("Chat");
		expect(explorer.querySelectorAll("[data-rename-workspace-dream]")).toHaveLength(1);
		expect(explorer.querySelector("[data-rename-workspace-dream]")?.getAttribute("data-rename-workspace-dream")).toBe("dream-1");
		const newDream = explorer.querySelector<HTMLButtonElement>("[data-new-workspace-dream]")!;
		expect(newDream.disabled).toBe(true);
		expect(newDream.parentElement?.title).toBe("Select a passage to create a Dream");

		library.SetSelection(first.source);
		await events.PublishAsync("library.selection-changed", {});
		expect(explorer.querySelector<HTMLButtonElement>("[data-new-workspace-dream]")?.disabled).toBe(false);

		expect(tabs.querySelectorAll("[data-workspace-tab]")).toHaveLength(1);
		expect(tabs.querySelector("[data-workspace-tab-kind='dream']")?.textContent).toContain("Descent");
		const actions = Array.from(tabs.querySelectorAll<HTMLButtonElement>(".action-menu-items > button"), (button) => button.textContent?.trim());
		expect(actions).toEqual(["Save", "Close", "Delete", "Copy as Markdown"]);
		tabs.querySelector<HTMLButtonElement>("[data-workspace-copy-dream]")?.click();
		await vi.waitFor(function Copied(): void { expect(copy).toHaveBeenCalledOnce(); });

		explorer.querySelector<HTMLButtonElement>("[data-workspace-idea='idea-1']")?.click();
		await vi.waitFor(function IdeaOpened(): void
		{
			expect(tabs.querySelectorAll("[data-workspace-tab]")).toHaveLength(2);
		});
		expect(tabs.querySelector("[data-workspace-tab-kind='idea']")?.getAttribute("aria-selected")).toBe("true");

		explorer.querySelector<HTMLButtonElement>("[data-workspace-dream='dream-2']")?.click();
		await vi.waitFor(function SecondDreamOpened(): void
		{
			expect(tabs.querySelectorAll("[data-workspace-tab]")).toHaveLength(3);
		});
		expect(tabs.querySelector("[data-workspace-tab='dream-2']")?.getAttribute("aria-selected")).toBe("true");
		expect(explorer.querySelectorAll("[data-rename-workspace-dream]")).toHaveLength(1);
		expect(explorer.querySelector("[data-rename-workspace-dream]")?.getAttribute("data-rename-workspace-dream")).toBe("dream-2");

		let returnCount = 0;
		events.Subscribe("idea.return-requested", function CountReturn(): void { returnCount += 1; });
		panel.SetIdeaReturnAvailable(true);
		tabs.querySelector<HTMLButtonElement>("[data-return-to-idea]")?.click();
		await Promise.resolve();
		expect(returnCount).toBe(1);

		const search = explorer.querySelector<HTMLInputElement>("[data-workspace-search]")!;
		search.value = "justice";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		expect(explorer.textContent).toContain("Justice");
		expect(explorer.textContent).not.toContain("Descent (327a)");

		let requestedWorkId = "";
		events.Subscribe("library.text-open-requested", function CaptureRequestedWork(event): void { requestedWorkId = event.textId; });
		explorer.querySelector<HTMLButtonElement>("[data-add-work]")?.click();
		const workFilter = document.querySelector<HTMLElement>(".work-picker-search")!;
		expect(workFilter.classList.contains("application-find")).toBe(true);
		expect(workFilter.classList.contains("dream-search")).toBe(false);
		const addPhaedo = document.querySelector<HTMLButtonElement>("[data-add-library-work='phaedo']")!;
		expect(addPhaedo.textContent).toContain("Phaedo");
		addPhaedo.click();
		await Promise.resolve();
		expect(requestedWorkId).toBe("phaedo");
		expect(window.localStorage.getItem("chora:workspace-works")).toContain("phaedo");
		expect(explorer.textContent).toContain("Phaedo");

		panel.Dispose();
		dreamStore.Dispose();
	});

	it("restores open Idea tabs from the session", function RestoresIdeaTabs(): void
	{
		const sessions = new SessionStore();
		const store = new IdeaStore(sessions);
		store.SetWork("republic", [CreateIdea()]);
		store.SetDraft(store.CreateDraft(CreateIdea()));
		store.UpdateDraft("Revised Justice", "Draft content");

		const restored = new IdeaStore(sessions);
		restored.SetWork("republic", [CreateIdea()]);
		expect(restored.GetOpenTabs()).toEqual([{ key: "idea-1", ideaId: "idea-1", title: "Revised Justice" }]);
		expect(restored.GetDraft()?.content).toBe("Draft content");
	});
});
