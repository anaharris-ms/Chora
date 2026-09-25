// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
			{ id: "signal-1", text: "abc", description: "First description", sourceRef: "s1", selection, resonances: [] },
			{ id: "signal-2", text: "def", description: "Second description", sourceRef: "s1", selection, resonances: [] }
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

describe("DreamPanel", function DreamPanelTests()
{
	let panel: DreamPanel;
	let root: HTMLElement;
	let store: DreamStore;
	let events: ChoraEventBus<ChoraEvents>;
	let gateway: DreamGateway;

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
		const library = new LibraryStore();
		const errors = new ErrorManager(events);
		const controller = new DreamController(events, errors, library, store, gateway);
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
		store.Dispose();
		document.body.replaceChildren();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("renders a heading and selectable quotation, retaining source disclosure on structural updates", async function PreservesSource()
	{
		expect(root.querySelector("[data-dream-title]")).toBeNull();
		expect(root.querySelector("[data-dream-heading]")?.textContent).toBe("A long Dream title");
		expect(root.querySelector(".dream-editor-header [data-open-resonances]")).toBeNull();
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

	it("preserves editors and expansion when switching tabs and autosaves content", async function PreservesEditors()
	{
		const buttons = root.querySelectorAll<HTMLButtonElement>("[role=tab]");
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
		expect(store.GetSaveState()).toBe("saved");
	});

	it("selects one signal at a time without replacing editors or resonance drafts", function SelectsOneSignal()
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
		const resonances = first.querySelector<HTMLDetailsElement>("[data-resonance-section]")!;
		resonances.open = false;
		expect(resonances.querySelector("summary [data-resonance-add] svg")).not.toBeNull();
		first.querySelector<HTMLButtonElement>("[data-resonance-add]")!.click();
		expect(resonances.open).toBe(true);
		const input = first.querySelector<HTMLInputElement>("[data-resonance-input]")!;
		input.value = "An unfinished thought";
		root.querySelector<HTMLButtonElement>('[data-signal-toggle="signal-2"]')!.click();
		expect(first.hidden).toBe(true);
		expect(second.hidden).toBe(false);
		root.querySelector<HTMLButtonElement>('[data-signal-toggle="signal-1"]')!.click();
		expect(first.hidden).toBe(false);
		expect(first.querySelector("[contenteditable=true]")).toBe(editor);
		expect(first.querySelector<HTMLInputElement>("[data-resonance-input]")?.value).toBe("An unfinished thought");
	});

	it("shows inline capture when empty and adds resonances only from the section plus", async function CapturesResonancesAsync()
	{
		vi.spyOn(gateway, "AllocateIdAsync").mockResolvedValue("resonance-1");
		const row = root.querySelector<HTMLElement>('[data-signal-id="signal-1"]')!;
		const plus = row.querySelector<HTMLButtonElement>("[data-resonance-add]")!;
		const input = row.querySelector<HTMLInputElement>("[data-resonance-input]")!;
		expect(input.placeholder).toBe("What does this bring to mind?");
		expect(document.activeElement).not.toBe(input);
		expect(row.querySelector(".resonance-empty")).toBeNull();
		expect(root.querySelector("[data-open-resonances]")).toBeNull();
		expect(root.querySelector("[data-signal-add-resonance]")).toBeNull();
		expect(plus.hidden).toBe(false);
		plus.click();
		expect(document.activeElement).toBe(input);
		expect(row.querySelectorAll("[data-resonance-capture]")).toHaveLength(1);
		input.value = "A remembered passage";
		row.querySelector<HTMLButtonElement>("[data-resonance-save]")!.click();
		await vi.advanceTimersByTimeAsync(800);
		expect(store.GetActiveDream()?.signals[0]?.resonances).toHaveLength(1);
		expect(row.querySelector("[data-resonance-input]")).toBeNull();
		expect(row.querySelector(".resonance-note")?.textContent).toBe("A remembered passage");
		plus.click();
		const nextInput = row.querySelector<HTMLInputElement>("[data-resonance-input]")!;
		expect(document.activeElement).toBe(nextInput);
		nextInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(row.querySelector("[data-resonance-input]")).toBeNull();
		row.querySelector<HTMLButtonElement>("[data-resonance-delete]")!.click();
		expect(row.querySelector<HTMLInputElement>("[data-resonance-input]")?.value).toBe("");
		expect(store.GetActiveDream()?.signals[0]?.resonances).toHaveLength(0);
		const emptyInput = row.querySelector<HTMLInputElement>("[data-resonance-input]")!;
		emptyInput.value = "Discard me";
		emptyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(row.querySelector<HTMLInputElement>("[data-resonance-input]")?.value).toBe("");
		expect(plus.hidden).toBe(false);
	});

	it("renames Dreams and deletes signals from their menu without replacing other editors", async function EditsSettings()
	{
		expect(root.querySelector(".dream-toolbar [data-manage-signals]")).toBeNull();
		root.querySelector<HTMLButtonElement>("[data-manage-signals]")!.click();
		const input = document.querySelector<HTMLInputElement>("[data-dream-title]")!;
		input.value = "Renamed Dream";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(root.querySelector("[data-dream-heading]")?.textContent).toBe("Renamed Dream");
		const exegesis = root.querySelector("[data-dream-exegesis]");
		expect(document.querySelector("[data-settings-signals]")).toBeNull();
		const menu = root.querySelector<HTMLDetailsElement>('.signal-item:not([hidden]) .action-menu')!;
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
		expect(store.GetSaveState()).toBe("saved");
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
		expect(root.querySelector('[data-signal-toggle="new-signal"]')?.getAttribute("aria-current")).toBe("true");
		expect(row.querySelector<HTMLElement>("[data-signal-description]")?.hidden).toBe(false);
		await vi.waitFor(function NewSignalRevealed(): void
		{
			expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
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
		await events.PublishAsync("dream.opened", { dream });
		expect(root.querySelector("[data-dream-exegesis]")).not.toBe(oldEditor);
		await vi.waitFor(function NewEditorReady(): void
		{
			expect(root.querySelector("[data-dream-exegesis] [contenteditable=true]")?.textContent).toBe("Another Dream");
		});
	});
});