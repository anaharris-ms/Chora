// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../../src/renderer/ui/MarkdownEditor.js";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { ParseDreamMarkdown, SerializeDreamMarkdown } from "../../src/main/dreams/DreamMarkdownCodec.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";

// Mounted editors are disposed even when an assertion fails.
const editors: MarkdownEditor[] = [];

// Mounts the actual Milkdown wrapper with a tracked change callback.
async function CreateEditorAsync(markdown: string, change = vi.fn()): Promise<MarkdownEditor>
{
	const events = new ChoraEventBus<ChoraEvents>();
	const errors = new ErrorManager(events);
	const editor = new MarkdownEditor(markdown, "Test description", change, errors);
	editors.push(editor);
	document.body.append(editor.Root);
	await editor.Ready;
	return editor;
}

// Selects the document through the browser selection interface.
function SelectContent(editor: MarkdownEditor): void
{
	const content = editor.Root.querySelector<HTMLElement>("[contenteditable=true]")!;
	content.focus();
	const range = document.createRange();
	range.selectNodeContents(content);
	const selection = window.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
	document.dispatchEvent(new Event("selectionchange"));
}

afterEach(async function CleanupAsync()
{
	for (const editor of editors) editor.Dispose();
	editors.length = 0;
	await Promise.resolve();
	document.body.replaceChildren();
});

describe("MarkdownEditor", function MarkdownEditorTests()
{
	it("renders Greek and formatting without rewriting the original Markdown on initialization", async function RendersMarkdownAsync()
	{
		const change = vi.fn();
		const markdown = "**κατέβην** and *memory*\n\n> A quotation\n\n- First\n- Second";
		const editor = await CreateEditorAsync(markdown, change);
		expect(editor.Root.querySelector("strong")?.textContent).toBe("κατέβην");
		expect(editor.Root.querySelector("em")?.textContent).toBe("memory");
		expect(editor.Root.querySelectorAll("li")).toHaveLength(2);
		expect(editor.GetMarkdown()).toBe(markdown);
		expect(change).not.toHaveBeenCalled();
		expect(editor.Root.querySelector("[role=textbox]")?.getAttribute("aria-label")).toBe("Test description");
	});

	it("formats a selection and publishes Markdown synchronously with undo support", async function FormatsAndUndoesAsync()
	{
		const change = vi.fn();
		const editor = await CreateEditorAsync("κατέβην", change);
		SelectContent(editor);
		editor.Root.querySelector<HTMLButtonElement>('[data-markdown-command="bold"]')!.click();
		expect(editor.Root.querySelector("strong")?.textContent).toBe("κατέβην");
		expect(change).toHaveBeenCalled();
		expect(editor.GetMarkdown()).toContain("**κατέβην**");
		editor.Root.querySelector<HTMLButtonElement>('[data-markdown-command="undo"]')!.click();
		expect(editor.Root.querySelector("strong")).toBeNull();
		expect(editor.GetMarkdown().trim()).toBe("κατέβην");
	});

	it("renders unsafe links inertly without image or executable HTML elements", async function NeutralizesUnsafeContentAsync()
	{
		const editor = await CreateEditorAsync('[unsafe](javascript:alert%281%29)\n\n![remote](https://example.com/tracker.png)\n\n<script>alert(1)</script>');
		expect(editor.Root.querySelector('a[href^="javascript:"]')).toBeNull();
		expect(editor.Root.querySelector("img,script,iframe")).toBeNull();
		expect(MarkdownEditor.IsSafeLink("javascript:alert(1)")).toBe(false);
		expect(MarkdownEditor.IsSafeLink("file:///C:/secret")).toBe(false);
		expect(MarkdownEditor.IsSafeLink("https://example.com")).toBe(true);
	});

	it.each(["bullet_list", "ordered_list", "blockquote"])("toggles %s on and off", async function TogglesBlocksAsync(command: string)
	{
		const editor = await CreateEditorAsync("An observation");
		SelectContent(editor);
		const button = editor.Root.querySelector<HTMLButtonElement>(`[data-markdown-command="${command}"]`)!;
		button.click();
		const selector = command === "bullet_list" ? "ul" : command === "ordered_list" ? "ol" : "blockquote";
		expect(editor.Root.querySelector(selector)).not.toBeNull();
		button.click();
		expect(editor.Root.querySelector(selector)).toBeNull();
		expect(editor.GetMarkdown().trim()).toBe("An observation");
	});

	it("creates and removes a safe link without losing the selected Greek text", async function EditsLinksAsync()
	{
		const editor = await CreateEditorAsync("κατέβην");
		SelectContent(editor);
		editor.Root.querySelector<HTMLButtonElement>('[data-markdown-command="link"]')!.click();
		const input = editor.Root.querySelector<HTMLInputElement>("input")!;
		input.value = "https://example.com";
		editor.Root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		expect(editor.GetMarkdown()).toContain("[κατέβην](https://example.com)");
		editor.Root.querySelector<HTMLButtonElement>('[data-markdown-command="unlink"]')!.click();
		expect(editor.Root.querySelector("a")).toBeNull();
		expect(editor.GetMarkdown().trim()).toBe("κατέβην");
	});

	it("round-trips formatted descriptions and Exegesis through the existing Markdown file codec", async function PersistsMarkdownAsync()
	{
		const editor = await CreateEditorAsync("κατέβην");
		SelectContent(editor);
		editor.Root.querySelector<HTMLButtonElement>('[data-markdown-command="bold"]')!.click();
		const markdown = editor.GetMarkdown();
		const selection = { documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 7 }, selectedText: "κατέβην", locatorStart: null, locatorEnd: null };
		const dream: Dream = {
			id: "formatted", workId: "republic", dialogue: "Republic", title: "Formatting",
			source: { ...selection, sourceRefs: ["s1"], startSourceRef: "s1", endSourceRef: "s1" },
			signals: [{ id: "one", sourceRef: "s1", selection, text: "κατέβην", description: markdown, resonances: [] }],
			reflection: markdown, linkedDreamIds: [], createdAt: "2026-09-06", updatedAt: "2026-09-06"
		};
		const serialized = SerializeDreamMarkdown(dream);
		const restored = ParseDreamMarkdown(serialized)!;
		expect(restored.signals[0]?.description).toBe(markdown);
		expect(restored.reflection.trim()).toBe(markdown.trim());
		const reopened = await CreateEditorAsync(restored.reflection);
		expect(reopened.Root.querySelector("strong")?.textContent).toBe("κατέβην");
	});

	it("disposes safely before asynchronous initialization completes", async function DisposesEarlyAsync()
	{
		const change = vi.fn();
		const events = new ChoraEventBus<ChoraEvents>();
		const editor = new MarkdownEditor("Original", "Early close", change, new ErrorManager(events));
		document.body.append(editor.Root);
		editor.Dispose();
		await editor.Ready;
		expect(editor.Root.isConnected).toBe(false);
		expect(change).not.toHaveBeenCalled();
	});

	it("preserves Greek text pasted through the clipboard", async function PastesGreekAsync()
	{
		const change = vi.fn();
		const editor = await CreateEditorAsync("Original", change);
		SelectContent(editor);
		const clipboard = new DataTransfer();
		clipboard.setData("text/plain", "κατέβην χθὲς");
		const event = new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true });
		editor.Root.querySelector("[contenteditable=true]")!.dispatchEvent(event);
		expect(editor.GetMarkdown().trim()).toBe("κατέβην χθὲς");
		expect(change).toHaveBeenCalled();
	});
});