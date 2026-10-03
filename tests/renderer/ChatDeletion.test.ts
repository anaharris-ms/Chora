// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../../src/renderer/chat/ChatPanel.js";
import { ChatController } from "../../src/renderer/chat/ChatController.js";
import { ChatStore } from "../../src/renderer/chat/ChatStore.js";
import { ChatGateway } from "../../src/renderer/chat/ChatGateway.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ReadingContextBuilder } from "../../src/renderer/core/context/ReadingContextBuilder.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import type { ChatConversationSnapshot } from "../../src/shared/chat/ChatTypes.js";

// Creates a saved chat without touching the reader's filesystem.
function CreateConversation(id: string): ChatConversationSnapshot
{
	const snapshot: ChatConversationSnapshot = {
		id, title: `Chat ${id}`, provider: "mock", modelId: "mock",
		createdAt: "2026-09-12", updatedAt: "2026-09-12",
		messages: [{ role: "user", content: "A question" }, { role: "assistant", content: "An answer", kind: "model" }]
	};
	return snapshot;
}

describe("Chat deletion", function ChatDeletionTests()
{
	let panel: ChatPanel;
	let controller: ChatController;
	let store: ChatStore;
	let dreams: DreamStore;
	let gateway: ChatGateway;
	let events: ChoraEventBus<ChoraEvents>;
	let root: HTMLElement;

	beforeEach(function Setup(): void
	{
		const sessions = new SessionStore();
		store = new ChatStore(sessions);
		dreams = new DreamStore(sessions);
		events = new ChoraEventBus<ChoraEvents>();
		gateway = new ChatGateway();
		vi.spyOn(gateway, "SubscribeToStream").mockReturnValue(function Unsubscribe(): void {});
		vi.spyOn(gateway, "DeleteConversationAsync").mockResolvedValue();
		vi.spyOn(gateway, "LoadConversationAsync").mockResolvedValue(CreateConversation("first"));
		const contexts = new ReadingContextBuilder(new LibraryStore(), dreams);
		const errors = new ErrorManager(events);
		controller = new ChatController(events, errors, contexts, store, gateway);
		store.SetConversations([
			{ id: "first", title: "First chat", provider: "mock", updatedAt: "2026-09-12", messageCount: 2 },
			{ id: "second", title: "Second chat", provider: "mock", updatedAt: "2026-09-12", messageCount: 2 }
		]);
		root = document.createElement("div");
		document.body.append(root);
		panel = new ChatPanel(root, events, store, controller);
	});

	afterEach(function Cleanup(): void
	{
		panel.Dispose();
		controller.Dispose();
		dreams.Dispose();
		document.body.replaceChildren();
		window.sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it("cancels without opening or deleting the chat, then deletes only the confirmed history row", async function DeletesHistoryRowAsync()
	{
		store.SetDraft("Unsent thought");
		const button = root.querySelector<HTMLButtonElement>('[data-chat-delete="first"]')!;
		expect(button.querySelector("svg")).not.toBeNull();
		button.click();
		expect(gateway.LoadConversationAsync).not.toHaveBeenCalled();
		expect(gateway.DeleteConversationAsync).not.toHaveBeenCalled();
		document.querySelector<HTMLButtonElement>("[data-chat-delete-cancel]")!.click();
		expect(document.activeElement).toBe(button);
		button.click();
		document.querySelector<HTMLButtonElement>("[data-chat-delete-confirm]")!.click();
		await vi.waitFor(function Removed(): void
		{
			expect(root.querySelector('[data-chat-open="first"]')).toBeNull();
		});
		expect(gateway.DeleteConversationAsync).toHaveBeenCalledExactlyOnceWith("first");
		expect(root.querySelector('[data-chat-open="second"]')).not.toBeNull();
		expect(store.GetDraft()).toBe("Unsent thought");
	});

	it("retains the active chat and draft on failure and returns to history after retry", async function RetriesDeletionAsync()
	{
		vi.spyOn(console, "error").mockImplementation(function IgnoreExpectedFailure(): void {});
		vi.mocked(gateway.DeleteConversationAsync).mockRejectedValueOnce(new Error("Disk unavailable"));
		await controller.OpenConversationAsync("first");
		store.SetDraft("Keep this draft");
		root.querySelector<HTMLButtonElement>('[data-chat-delete="first"]')!.click();
		const confirm = document.querySelector<HTMLButtonElement>("[data-chat-delete-confirm]")!;
		confirm.click();
		await vi.waitFor(function Failed(): void
		{
			expect(document.querySelector<HTMLElement>("[data-chat-delete-error]")?.hidden).toBe(false);
		});
		expect(store.GetConversationId()).toBe("first");
		expect(store.GetMessages()).toHaveLength(2);
		expect(store.GetDraft()).toBe("Keep this draft");
		confirm.click();
		await vi.waitFor(function Removed(): void
		{
			expect(store.GetConversationId()).toBeNull();
		});
		expect(store.GetView()).toBe("catalogue");
		expect(store.GetDraft()).toBe("Keep this draft");
		expect(store.GetMessages()).toEqual([]);
	});

	it("blocks deletion during replies and duplicate deletion while preserving a different active chat", async function GuardsDeletionAsync()
	{
		store.OpenConversation(CreateConversation("second"));
		store.SetDraft("Keep second draft");
		store.BeginRequest("Question", "request");
		await events.PublishAsync("chat.changed", {});
		expect(root.querySelector<HTMLButtonElement>("[data-chat-delete]")?.disabled).toBe(true);
		expect(await controller.DeleteConversationAsync("first")).toBe(false);
		expect(gateway.DeleteConversationAsync).not.toHaveBeenCalled();
		store.FailRequest("Question", "Test cancellation");
		store.SetDraft("Keep second draft");
		let complete: () => void = function NotStarted(): void {};
		vi.mocked(gateway.DeleteConversationAsync).mockImplementationOnce(function PendingDeletion(): Promise<void>
		{
			const pending = new Promise<void>(function Capture(resolve): void { complete = resolve; });
			return pending;
		});
		const deletion = controller.DeleteConversationAsync("first");
		expect(await controller.DeleteConversationAsync("first")).toBe(false);
		await vi.waitFor(function Started(): void { expect(gateway.DeleteConversationAsync).toHaveBeenCalledOnce(); });
		complete();
		expect(await deletion).toBe(true);
		expect(store.GetConversationId()).toBe("second");
		expect(store.GetMessages()).toHaveLength(2);
		expect(store.GetDraft()).toBe("Keep second draft");
	});
});