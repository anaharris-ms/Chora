// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import { ReadingContextBuilder } from "../../src/renderer/core/context/ReadingContextBuilder.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import { DreamController } from "../../src/renderer/dreams/DreamController.js";
import { DreamGateway } from "../../src/renderer/dreams/DreamGateway.js";
import { DreamSignalsPanel } from "../../src/renderer/dreams/DreamSignalsPanel.js";
import { ChatStore } from "../../src/renderer/chat/ChatStore.js";
import { ChatController } from "../../src/renderer/chat/ChatController.js";
import { ChatGateway } from "../../src/renderer/chat/ChatGateway.js";
import { ChatPanel } from "../../src/renderer/chat/ChatPanel.js";
import { ChatConversation } from "../../src/main/chat/ChatConversation.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";

describe("Signal chat", function SignalChatTests()
{
	afterEach(function Cleanup(): void
	{
		window.sessionStorage.clear();
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it("keeps the dormant signal-chat workflow available without rendering Chat controls", async function ChatsAboutSelectedSignalAsync(): Promise<void>
	{
		const sessions = new SessionStore();
		const dreams = new DreamStore(sessions);
		const selection = { documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 6 }, selectedText: "abcdef", locatorStart: null, locatorEnd: null };
		const dream: Dream = {
			id: "dream", workId: "republic", dialogue: "Republic", title: "Return", reflection: "My reflections",
			source: { ...selection, sourceRefs: ["s1"], startSourceRef: "s1", endSourceRef: "s1" },
			signals: [
				{ id: "first", text: "abc", description: "First thought", sourceRef: "s1", selection },
				{ id: "second", text: "def", description: "My full **second** thought", sourceRef: "s1", selection }
			], linkedDreamIds: [], createdAt: "2026-09-07", updatedAt: "2026-09-07"
		};
		dreams.Open(dream, false);
		const library = new LibraryStore();
		const contexts = new ReadingContextBuilder(library, dreams);
		const events = new ChoraEventBus<ChoraEvents>();
		const errors = new ErrorManager(events);
		const failures = vi.fn();
		events.SetErrorHandler(failures);
		const store = new ChatStore(sessions);
		const gateway = new ChatGateway();
		vi.spyOn(gateway, "SubscribeToStream").mockReturnValue(function Unsubscribe(): void {});
		const start = vi.spyOn(gateway, "StartAsync").mockResolvedValue({ text: "Reply", conversationId: "conversation", kind: "model" });
		const next = vi.spyOn(gateway, "ContinueAsync").mockResolvedValue({ text: "Next reply", conversationId: "conversation", kind: "model" });
		vi.spyOn(gateway, "ListConversationsAsync").mockResolvedValue([]);
		vi.spyOn(gateway, "GetProviderOptionsAsync").mockResolvedValue([]);
		const controller = new ChatController(events, errors, contexts, store, gateway);
		const dreamGateway = new DreamGateway();
		const dreamController = new DreamController(events, errors, library, dreams, dreamGateway);
		const signals = new DreamSignalsPanel(dreamController, errors);
		const root = document.createElement("div");
		const panel = new ChatPanel(root, events, store, controller);
		document.body.append(root, signals.Root);
		signals.Update(dream);
		try
		{
			store.SetDraft("An unsent question");
			dreams.UpdateSignalDescription("second", "My latest **unsaved** thought");
			expect(signals.Root.querySelector("[data-signal-chat]")).toBeNull();
			dreamController.ChatWithSignal("second");
			await vi.waitFor(function Opened(): void
			{
				expect(root.querySelector(".chat-signal-focus")?.textContent).toBe("def");
				expect(store.GetConversationId()).toBe("conversation");
			});
			expect(start).toHaveBeenCalledExactlyOnceWith(expect.any(Object), expect.any(Object), "My latest **unsaved** thought", expect.any(String));
			expect(store.GetDraft()).toBe("An unsent question");
			expect(store.GetView()).toBe("conversation");
			expect(signals.Root.querySelector('[data-signal-toggle="second"]')?.getAttribute("aria-current")).toBe("false");
			expect(signals.Root.querySelector<HTMLElement>('[data-signal-id="second"]')?.hidden).toBe(true);
			const sent = start.mock.calls[0]?.[0];
			expect(sent).toMatchObject({ mode: "DREAM", sourcePassage: "abcdef", dream: { focusedSignal: { id: "second", text: "def", description: "My latest **unsaved** thought" } } });
			await events.PublishAsync("chat.signal-requested", { dreamId: "dream", signalId: "second" });
			expect(store.GetConversationId()).toBe("conversation");
			expect(start).toHaveBeenCalledTimes(1);
			expect(next).not.toHaveBeenCalled();
			expect(store.GetMessages()).toHaveLength(2);
			const composer = root.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
			composer.focus();
			vi.spyOn(console, "error").mockImplementation(function IgnoreExpectedBusyError(): void {});
			store.BeginRequest("Pending question", "pending");
			await events.PublishAsync("chat.changed", {});
			expect(root.querySelector("[data-chat-input]")).toBe(composer);
			expect(composer.disabled).toBe(false);
			expect(document.activeElement).toBe(composer);
			composer.blur();
			composer.focus();
			expect(document.activeElement).toBe(composer);
			composer.value = "Draft during reply";
			composer.dispatchEvent(new Event("input", { bubbles: true }));
			composer.setSelectionRange(2, 7);
			await events.PublishAsync("chat.changed", {});
			expect(document.activeElement).toBe(composer);
			expect(composer.selectionStart).toBe(2);
			expect(composer.selectionEnd).toBe(7);
			expect(root.querySelector<HTMLSelectElement>("[data-chat-provider]")?.disabled).toBe(true);
			store.AppendStream("Partial reply");
			await events.PublishAsync("chat.changed", {});
			expect(root.querySelector<HTMLSelectElement>("[data-chat-provider]")?.disabled).toBe(true);
			await events.PublishAsync("chat.signal-requested", { dreamId: "dream", signalId: "first" });
			expect(store.GetStatus()).toBe("streaming");
			expect(store.GetSignalContext()?.dream.focusedSignal?.id).toBe("second");
			store.FailRequest("Pending question", "Cancelled by test");
			await events.PublishAsync("chat.changed", {});
			expect(root.querySelector<HTMLSelectElement>("[data-chat-provider]")?.disabled).toBe(false);
			dreams.Close();
			await controller.SendAsync("And this?");
			expect(next.mock.calls[0]?.[1]).toEqual(sent);
			if (sent !== undefined)
			{
				const conversation = new ChatConversation("saved", { providerId: "mock", modelId: "mock" });
				conversation.SetSignalContext(sent);
				const snapshot = conversation.CreateSnapshot();
				const restored = ChatConversation.Restore(snapshot);
				const reopened = restored.CreateSnapshot();
				store.OpenConversation(reopened);
				expect(store.GetSignalContext()).toEqual(sent);
			}
			store.SetProviderOptions([
				{ providerId: "mock", modelId: "mock", modelName: "Mock" },
				{ providerId: "copilot-relay", modelId: "other-model", modelName: "Other model" }
			]);
			store.SetDraft("Keep this question");
			await events.PublishAsync("chat.changed", {});
			const nativeConfirm = vi.spyOn(window, "confirm");
			let modelSelect = root.querySelector<HTMLSelectElement>("[data-chat-provider]")!;
			expect(modelSelect.disabled).toBe(false);
			modelSelect.selectedIndex = 1;
			modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
			document.querySelector<HTMLButtonElement>("[data-chat-model-cancel]")!.click();
			expect(store.GetConversationId()).toBe("saved");
			expect(store.GetModelSelection().providerId).toBe("mock");
			expect(document.activeElement).toBe(composer);
			modelSelect = root.querySelector<HTMLSelectElement>("[data-chat-provider]")!;
			modelSelect.selectedIndex = 1;
			modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
			document.querySelector<HTMLButtonElement>("[data-chat-model-confirm]")!.click();
			expect(nativeConfirm).not.toHaveBeenCalled();
			expect(store.GetConversationId()).toBeNull();
			expect(root.querySelector("[data-chat-input]")).toBe(composer);
			expect(document.activeElement).toBe(composer);
			expect(store.GetDraft()).toBe("Keep this question");
			expect(store.GetSignalContext()).toEqual(sent);
			expect(store.GetMessages()).toEqual([]);
			await controller.SendAsync("Try the other model");
			expect(start).toHaveBeenLastCalledWith(sent, { providerId: "copilot-relay", modelId: "other-model" }, "Try the other model", expect.any(String));
			controller.NewConversation();
			expect(store.GetSignalContext()).toBeNull();
			expect(contexts.GetSignalContext("missing", "missing")).toBeNull();
			expect(failures).not.toHaveBeenCalled();
		}
		finally
		{
			signals.Dispose();
			panel.Dispose();
			controller.Dispose();
			dreams.Dispose();
		}
	});
});