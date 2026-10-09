// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ReadingSettingsStore } from "../../src/renderer/core/settings/ReadingSettingsStore.js";
import { DreamPanel } from "../../src/renderer/dreams/DreamPanel.js";
import { DreamController } from "../../src/renderer/dreams/DreamController.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import { DreamGateway } from "../../src/renderer/dreams/DreamGateway.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";

// Creates a small persisted Dream with two independently editable signals.
function CreateDream(): Dream
{
	const selection = {
		documentId: "republic", start: { segmentKey: "s1", offset: 0 },
		end: { segmentKey: "s1", offset: 6 }, selectedText: "abcdef",
		locatorStart: null, locatorEnd: null
	};
	const dream: Dream = {
		id: "dream-1", workId: "republic", dialogue: "Republic", title: "A long Dream title",
		source: { ...selection, sourceRefs: ["s1"], startSourceRef: "s1", endSourceRef: "s1" },
		signals: [
			{ id: "signal-1", text: "abc", description: "First description", sourceRef: "s1", selection },
			{ id: "signal-2", text: "def", description: "Second description", sourceRef: "s1", selection }
		],
		reflection: "Initial Exegesis", linkedDreamIds: [], createdAt: "2026-09-06", updatedAt: "2026-09-06"
	};
	return dream;
}

// Selects editor content and activates its bold toolbar action.
function FormatBold(root: HTMLElement): void
{
	const content = root.querySelector<HTMLElement>("[contenteditable=true]")!;
	content.focus();
	const range = document.createRange();
	range.selectNodeContents(content);
	const selection = window.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
	document.dispatchEvent(new Event("selectionchange"));
	root.querySelector<HTMLButtonElement>('[data-markdown-command="bold"]')!.click();
}

// Requires one document element for rename workflow assertions.
function RequireDocumentElement<T extends Element>(selector: string): T
{
	const element = document.querySelector<T>(selector);

	if (element === null)
	{
		throw new Error(`Missing test element: ${selector}`);
	}

	return element;
}

// Requires one ancestor element for rename workflow assertions.
function RequireClosestElement<T extends Element>(element: Element, selector: string): T
{
	const closest = element.closest<T>(selector);

	if (closest === null)
	{
		throw new Error(`Missing test ancestor: ${selector}`);
	}

	return closest;
}

describe("DreamPanel", function DreamPanelTests()
{
	let panel: DreamPanel;
	let root: HTMLElement;
	let store: DreamStore;
	let events: ChoraEventBus<ChoraEvents>;
	let gateway: DreamGateway;
	let controller: DreamController;
	let library: LibraryStore;
	let auxiliaryPanels: DreamPanel[];

	beforeEach(async function SetupAsync()
	{
		window.sessionStorage.clear();
		root = document.createElement("div");
		document.body.append(root);
		events = new ChoraEventBus<ChoraEvents>();
		store = new DreamStore(new SessionStore());
		const dream = CreateDream();
		store.Open(dream, false);
		gateway = new DreamGateway();
		vi.spyOn(gateway, "ListAsync").mockResolvedValue([dream]);
		vi.spyOn(gateway, "SaveAsync").mockImplementation(async function SaveAsync(record: Dream): Promise<Dream>
		{
			const saved = structuredClone(record);
			return saved;
		});
		library = new LibraryStore();
		auxiliaryPanels = [];
		const errors = new ErrorManager(events);
		controller = new DreamController(events, errors, library, store, gateway);
		panel = new DreamPanel(root, events, store, controller, library, "editor");
		await vi.waitFor(function EditorsReady(): void
		{
			expect(root.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
		});
		vi.useFakeTimers();
	});

	afterEach(function Cleanup()
	{
		panel.Dispose();
		for (const auxiliaryPanel of auxiliaryPanels) auxiliaryPanel.Dispose();
		store.Dispose();
		document.body.replaceChildren();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	// Opens the rename workflow from the Dream Explorer, where title editing is exposed.
	function OpenRenameFromCatalogue(): void
	{
		const activeDream = store.GetActiveDream();
		if (activeDream !== null) store.SetCatalogue([activeDream]);
		const catalogueRoot = document.createElement("div");
		document.body.append(catalogueRoot);
		const cataloguePanel = new DreamPanel(catalogueRoot, events, store, controller, library, "catalogue");
		auxiliaryPanels.push(cataloguePanel);
		catalogueRoot.querySelector<HTMLButtonElement>("[data-rename-dream]")!.click();
	}

	it("opens, switches, and closes persistent Dream tabs without losing inner navigation", async function ManagesDreamTabsAsync()
	{
		const first = store.GetActiveDream()!;
		const second = structuredClone(first);
		second.id = "dream-2";
		second.title = "Second Dream";
		store.SetCatalogue([first, second]);
		const innerTabs = root.querySelectorAll<HTMLButtonElement>(".dream-tabs-host [role=tab]");
		innerTabs[1]?.click();

		controller.Open(second.id);
		expect(store.GetOpenTabs()).toHaveLength(2);
		expect(store.GetActiveDream()?.id).toBe("dream-2");
		controller.ActivateTab("dream-1");

		expect(store.GetActiveDream()?.id).toBe("dream-1");
		expect(root.querySelector<HTMLButtonElement>('.dream-tabs-host [role=tab][aria-selected="true"]')?.textContent).toBe("General Observations");
		const restoredStore = new DreamStore(new SessionStore());
		expect(restoredStore.GetOpenTabs()).toHaveLength(2);
		expect(restoredStore.GetActiveDream()?.id).toBe("dream-1");
		expect(restoredStore.GetEditorTab("dream-1")).toBe("exegesis");
		restoredStore.Dispose();

		await controller.CloseTabAsync("dream-1");
		expect(store.GetOpenTabs()).toHaveLength(1);
		expect(store.GetActiveDream()?.id).toBe("dream-2");
	});

	it("copies the complete Dream as Markdown from the outer document menu", async function CopiesDreamMarkdownAsync()
	{
		const copy = vi.spyOn(gateway, "CopyAsync").mockResolvedValue(undefined);
		const tabs = root.querySelectorAll<HTMLButtonElement>('.dream-tabs-host [role="tab"]');
		expect(Array.from(tabs, function Label(tab): string | null { return tab.textContent; })).toEqual(["Signals", "General Observations"]);
		void controller.CopyDreamAsMarkdownAsync();
		await vi.waitFor(function DreamCopied(): void { expect(copy).toHaveBeenCalledOnce(); });
		const markdown = vi.mocked(copy).mock.calls[0]?.[0] ?? "";
		expect(markdown).toContain("# A long Dream title");
		expect(markdown).toContain("## Source Passage");
		expect(markdown).toContain("### Signal");
		expect(markdown).toContain("> abc");
		expect(markdown).toContain("Source: Republic · s1");
		expect(markdown).toContain("#### Observation");
		expect(markdown).toContain("First description");
		expect(markdown).toContain("## General Observations");
		expect(markdown).toContain("Initial Exegesis");
	});

	it("uses the document tab as the title and retains source disclosure on structural updates", async function PreservesSource()
	{
		expect(root.querySelector("[data-dream-title]")).toBeNull();
		expect(root.querySelector("[data-dream-heading]")).toBeNull();
		expect(root.querySelector(".signal-observation-heading")).toBeNull();
		expect(document.querySelectorAll(".popup-overlay")).toHaveLength(0);
		const details = root.querySelector<HTMLDetailsElement>(".dream-source-section")!;
		const source = root.querySelector("[data-dream-source]")!;
		expect(source.tagName).toBe("BLOCKQUOTE");
		expect(details.open).toBe(true);
		details.open = false;
		await events.PublishAsync("dream.structure-changed", { dreamId: "dream-1" });
		expect(root.querySelector(".dream-source-section")).toBe(details);
		expect(details.open).toBe(false);
		expect(source.textContent).toBe("abcdef");
	});

	it("applies reading size to Dream content", async function ScalesDreamContentAsync()
	{
		const stylesheet = document.createElement("style");
		const styles = ["base", "workspace-theme", "left-tab-panels", "dark-theme", "tabs", "dream-editor", "markdown-editor", "responsive"];
		stylesheet.textContent = styles.map(function ReadStyle(name): string
		{
			const content = readFileSync(`src/renderer/styles/${name}.css`, "utf8");
			return content;
		}).join("\n");
		const previousStyle = document.documentElement.style.cssText;
		const previousTheme = document.documentElement.dataset.theme;
		const previousSettings = window.localStorage.getItem("chora:reading-settings");
		document.head.append(stylesheet);
		try
		{
			const settings = new ReadingSettingsStore();
			settings.Apply();
			const selectors = [".dream-source", ".signal-heading", ".signal-markdown-editor .ProseMirror p", ".dream-exegesis-markdown .ProseMirror p"];
			const formattingToolbar = root.querySelector<HTMLElement>(".signal-markdown-editor .markdown-toolbar")!;
			expect(getComputedStyle(formattingToolbar).position).toBe("sticky");
			expect(getComputedStyle(formattingToolbar).top).toBe("0px");
			for (const delta of [0, 2, -1])
			{
				settings.ChangeFontSize(delta);
				expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe(`${settings.GetFontSize()}px`);
				stylesheet.remove();
				document.head.append(stylesheet);
				for (const selector of selectors)
				{
					const content = root.querySelector<HTMLElement>(selector)!;
					expect(content, selector).not.toBeNull();
					expect(getComputedStyle(content).fontSize, selector).toBe(`${settings.GetFontSize()}px`);
				}
			}
		}
		finally
		{
			stylesheet.remove();
			document.documentElement.style.cssText = previousStyle;
			if (previousTheme === undefined) delete document.documentElement.dataset.theme;
			else document.documentElement.dataset.theme = previousTheme;
			if (previousSettings === null) window.localStorage.removeItem("chora:reading-settings");
			else window.localStorage.setItem("chora:reading-settings", previousSettings);
		}
	});

	it("preserves editors and expansion when switching tabs and autosaves content", async function PreservesEditors()
	{
		const buttons = root.querySelectorAll<HTMLButtonElement>(".dream-tabs-host [role=tab]");
		expect(buttons[1]?.textContent).toBe("General Observations");
		const toggle = root.querySelector<HTMLButtonElement>("[data-signal-toggle]")!;
		toggle.click();
		const description = root.querySelector<HTMLElement>("[data-signal-description]")!;
		FormatBold(description);
		buttons[1]!.click();
		const exegesis = root.querySelector<HTMLElement>("[data-dream-exegesis]")!;
		FormatBold(exegesis);
		buttons[0]!.click();
		expect(root.querySelector("[data-signal-toggle]")).toBe(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(description.hidden).toBe(false);
		expect(description.querySelector("strong")?.textContent).toBe("First description");
		expect(root.querySelector("[data-dream-exegesis]")).toBe(exegesis);
		await vi.advanceTimersByTimeAsync(800);
		expect(gateway.SaveAsync).toHaveBeenCalledWith(expect.objectContaining({ reflection: expect.stringContaining("**Initial Exegesis**") }));
		expect(store.GetActiveDream()?.signals[0]?.description).toContain("**First description**");
		expect(store.GetSaveState()).toBe("idle");
	});

	it("selects one signal at a time without replacing editors", function SelectsOneSignal()
	{
		const first = root.querySelector<HTMLElement>('[data-signal-id="signal-1"]')!;
		const second = root.querySelector<HTMLElement>('[data-signal-id="signal-2"]')!;
		const editor = first.querySelector("[contenteditable=true]");
		expect(first.hidden).toBe(false);
		expect(second.hidden).toBe(true);
		expect(first.querySelector(".signal-detail-heading")).toBeNull();
		expect(first.querySelector("[data-signal-edit]")).toBeNull();
		expect(first.querySelector(".signal-detail-title [data-signal-chat]")).toBeNull();
		expect(root.querySelector('[data-signal-toggle="signal-1"]')?.textContent).toBe("abc");
		root.querySelector<HTMLButtonElement>('[data-signal-toggle="signal-2"]')!.click();
		expect(first.hidden).toBe(true);
		expect(second.hidden).toBe(false);
		root.querySelector<HTMLButtonElement>('[data-signal-toggle="signal-1"]')!.click();
		expect(first.hidden).toBe(false);
		expect(first.querySelector("[contenteditable=true]")).toBe(editor);
	});

	it("renames Dreams and deletes signals from their menu without replacing other editors", async function EditsSettings()
	{
		expect(root.querySelector("[data-dream-heading]")).toBeNull();
		OpenRenameFromCatalogue();
		const input = RequireDocumentElement<HTMLInputElement>("[data-dream-title]");
		const overlay = RequireClosestElement<HTMLElement>(input, ".popup-overlay");
		const save = RequireDocumentElement<HTMLButtonElement>("[data-dream-rename-save]");
		expect(document.activeElement).toBe(input);
		expect(save.textContent).toBe("Save");
		input.value = "Renamed Dream";
		expect(store.GetActiveDream()?.title).toBe("A long Dream title");
		save.click();
		await vi.waitFor(function RenameSaved(): void
		{
			expect(overlay.hidden).toBe(true);
		});
		await vi.waitFor(function DreamRenamed(): void
		{
			expect(store.GetActiveDream()?.title).toBe("Renamed Dream");
		});
		const exegesis = root.querySelector("[data-dream-exegesis]");
		expect(document.querySelector("[data-settings-signals]")).toBeNull();
		const menu = root.querySelector<HTMLDetailsElement>('.signal-item:not([hidden]) .action-menu')!;
		const menuItems = menu.querySelectorAll<HTMLButtonElement>(".action-menu-items > button");
		expect(menuItems).toHaveLength(2);
		expect(Array.from(menuItems, function Label(button): string { return button.textContent?.trim() ?? ""; })).toEqual(["Add to Idea…", "Delete signal"]);
		expect(menu.querySelector("[data-copy-signal-markdown]")).toBeNull();
		expect(menu.querySelector("[data-discover-idea]")).toBeNull();
		expect(menu.querySelector("[data-add-signal-to-idea]")?.textContent).toBe("Add to Idea…");
		const deleteButton = menu.querySelector<HTMLButtonElement>("[data-delete-signal]")!;
		expect(menu.querySelector(".action-menu-items")?.lastElementChild).toBe(deleteButton);
		deleteButton.click();
		await vi.advanceTimersByTimeAsync(800);
		expect(document.querySelector("[data-dream-title]")).toBe(input);
		expect(root.querySelector("[data-dream-exegesis]")).toBe(exegesis);
		expect(store.GetActiveDream()?.signals).toHaveLength(1);
		expect(root.querySelector('[data-signal-id="signal-1"]')).toBeNull();
		expect(root.querySelector<HTMLElement>('[data-signal-id="signal-2"]')?.hidden).toBe(false);
		expect(gateway.SaveAsync).toHaveBeenCalledWith(expect.objectContaining({ title: "Renamed Dream" }));
		expect(store.GetSaveState()).toBe("idle");
	});

	it("saves and closes the rename dialog when Enter is pressed", async function RenamesWithEnter()
	{
		OpenRenameFromCatalogue();
		const input = RequireDocumentElement<HTMLInputElement>("[data-dream-title]");
		const overlay = RequireClosestElement<HTMLElement>(input, ".popup-overlay");
		input.value = "Named with Enter";

		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

		await vi.waitFor(function RenameSaved(): void
		{
			expect(overlay.hidden).toBe(true);
		});
		expect(store.GetActiveDream()?.title).toBe("Named with Enter");
		expect(gateway.SaveAsync).toHaveBeenCalledWith(expect.objectContaining({ title: "Named with Enter" }));
	});

	it("keeps the rename dialog open when saving fails", async function RetainsFailedRename()
	{
		vi.mocked(gateway.SaveAsync).mockRejectedValueOnce(new Error("Disk unavailable"));
		OpenRenameFromCatalogue();
		const input = RequireDocumentElement<HTMLInputElement>("[data-dream-title]");
		const overlay = RequireClosestElement<HTMLElement>(input, ".popup-overlay");
		const save = RequireDocumentElement<HTMLButtonElement>("[data-dream-rename-save]");
		const error = RequireDocumentElement<HTMLElement>("[data-dream-rename-error]");
		input.value = "Unsaved name";

		save.click();

		await vi.waitFor(function RenameFailed(): void
		{
			expect(error.hidden).toBe(false);
		});
		expect(overlay.hidden).toBe(false);
		expect(save.disabled).toBe(false);
		expect(store.GetSaveState()).toBe("error");
		expect(document.activeElement).toBe(input);
	});

	it("focuses the added signal description and resets tabs when opening a different Dream", async function SelectsSignals()
	{
		const exegesisTab = root.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]!;
		exegesisTab.click();
		exegesisTab.focus();
		const active = store.GetActiveDream()!;
		const added = { ...active.signals[0]!, id: "new-signal", description: "" };
		store.ReplaceSignals([added, ...active.signals]);
		const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
		await events.PublishAsync("dream.signal-added", { dreamId: "dream-1", signalId: "new-signal" });
		expect(root.querySelector("[role=tab]")?.getAttribute("aria-selected")).toBe("true");
		const row = root.querySelector<HTMLElement>('[data-signal-id="new-signal"]')!;
		const header = root.querySelector<HTMLElement>('[data-signal-toggle="new-signal"]')?.parentElement;
		expect(header?.querySelector('[data-signal-toggle="new-signal"]')?.getAttribute("aria-current")).toBe("true");
		expect(row.querySelector<HTMLElement>("[data-signal-description]")?.hidden).toBe(false);
		await vi.waitFor(function NewSignalRevealed(): void
		{
			expect(scroll).toHaveBeenCalledTimes(2);
			expect(scroll).toHaveBeenNthCalledWith(1, { block: "nearest", behavior: "smooth" });
			expect(scroll).toHaveBeenNthCalledWith(2, { block: "nearest", behavior: "smooth" });
			expect(scroll.mock.contexts).toContain(header);
			expect(scroll.mock.contexts).toContain(row);
			expect(row.querySelector('[aria-busy="true"]')).toBeNull();
			const content = row.querySelector<HTMLElement>("[contenteditable=true]");
			expect(content).not.toBeNull();
			expect(document.activeElement).toBe(content);
		});
		const oldEditor = root.querySelector("[data-dream-exegesis]");
		const dream = CreateDream();
		dream.id = "dream-2";
		dream.reflection = "Another Dream";
		store.Open(dream, false);
		await events.PublishAsync("dream.opened", {});
		expect(root.querySelector("[data-dream-exegesis]")).not.toBe(oldEditor);
		await vi.waitFor(function NewEditorReady(): void
		{
			expect(root.querySelector("[data-dream-exegesis] [contenteditable=true]")?.textContent).toBe("Another Dream");
		});
	});
});