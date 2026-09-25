import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { ChatController } from "../../src/renderer/chat/ChatController.js";
import { ChatGateway } from "../../src/renderer/chat/ChatGateway.js";
import { ChatStore } from "../../src/renderer/chat/ChatStore.js";
import type { ReadingContextBuilder } from "../../src/renderer/core/context/ReadingContextBuilder.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import type { ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta } from "../../src/shared/chat/ChatTypes.js";
import type { ProviderOption } from "../../src/shared/chat/ModelTypes.js";

class TestStorage
{
	private readonly values = new Map<string, string>();

	public GetValue(key: string): string | null
	{
		return this.values.get(key) ?? null;
	}

	public getItem(key: string): string | null
	{
		return this.GetValue(key);
	}

	public setItem(key: string, value: string): void
	{
		this.values.set(key, value);
	}

	public removeItem(key: string): void
	{
		this.values.delete(key);
	}
}

describe("ChatController", function ChatControllerTests()
{
	let events: ChoraEventBus<ChoraEvents>;
	let controller: ChatController;
	let store: ChatStore;
	let storage: TestStorage;
	let streamHandler: ((delta: ChatStreamDelta) => void) | null;
	let resolveRequest: ((result: ChatResult) => void) | null;
	let unsubscribeFromStream: ReturnType<typeof vi.fn>;
	let activeRequestId: string;

	beforeEach(() =>
	{
		vi.useFakeTimers();
		storage = new TestStorage();
		streamHandler = null;
		resolveRequest = null;
		activeRequestId = "";
		unsubscribeFromStream = vi.fn();
		vi.stubGlobal("window", {
			sessionStorage: storage,
			chora: {
				SubscribeChatDelta: vi.fn((handler: (delta: ChatStreamDelta) => void) =>
				{
					streamHandler = handler;
					return unsubscribeFromStream;
				}),
				StartChat: vi.fn((...args: unknown[]) => new Promise<ChatResult>((resolve) =>
				{
					activeRequestId = String(args[3] ?? "");
					resolveRequest = resolve;
				})),
				ContinueChat: vi.fn(),
				ListChatConversations: vi.fn(async () => []),
				LoadChatConversation: vi.fn(),
				GetConfiguredProvider: vi.fn(async () => "mock"),
				GetProviderOptions: vi.fn(async () => []),
				GetChatTools: vi.fn(async () => [])
			}
		});
		events = new ChoraEventBus<ChoraEvents>();
		const contexts = { GetContext: () => ({ mode: "FREE" as const }) } as ReadingContextBuilder;
		store = new ChatStore(new SessionStore());
		controller = new ChatController(events, new ErrorManager(events), contexts, store, new ChatGateway());
	});

	afterEach(() =>
	{
		vi.useRealTimers();
	});

	it("gives immediate send feedback and coalesces streaming notifications", async function StreamsWithoutEventStorms()
	{
		let changeCount = 0;
		events.Subscribe("chat.changed", () =>
		{
			changeCount += 1;
		});
		controller.SetDraft("Stay with this word.");

		const sending = controller.SendAsync(store.GetDraft());
		for (let index = 0; index < 5; index += 1) await Promise.resolve();
		expect(store.GetStatus()).toBe("submitting");
		expect(store.GetDraft()).toBe("");
		expect(changeCount).toBe(1);

		const requestId = activeRequestId;
		streamHandler?.({ requestId: "stale-request", text: "Ignore me." });
		streamHandler?.({ requestId, text: "First " });
		streamHandler?.({ requestId, text: "response" });
		expect(store.GetStreamText()).toBe("First response");
		expect(changeCount).toBe(1);
		await vi.advanceTimersByTimeAsync(16);
		expect(changeCount).toBe(2);

		resolveRequest?.({ text: "First response", conversationId: "conversation", kind: "model" });
		await sending;
		expect(store.GetStatus()).toBe("idle");
		expect(store.GetMessages().map((message) => message.role)).toEqual(["user", "assistant"]);
		expect(changeCount).toBe(3);
	});

	it("debounces draft persistence instead of serializing on every keystroke", async function DebouncesDraftPersistence()
	{
		controller.SetDraft("a");
		controller.SetDraft("ab");
		controller.SetDraft("abc");

		expect(storage.GetValue("chora:chat-draft")).toBeNull();
		await vi.advanceTimersByTimeAsync(249);
		expect(storage.GetValue("chora:chat-draft")).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(storage.GetValue("chora:chat-draft")).toBe('"abc"');
		expect(storage.GetValue("chora:chat-session")).toBeNull();
	});

	it("loads saved history, opens a conversation, and returns to the catalogue", async function NavigatesDurableConversations()
	{
		const summary: ChatConversationSummary = {
			id: "saved-conversation",
			title: "A saved question",
			provider: "mock",
			updatedAt: "2026-03-01T00:00:00.000Z",
			messageCount: 2
		};
		const snapshot: ChatConversationSnapshot = {
			...summary,
			createdAt: "2026-03-01T00:00:00.000Z",
			messages: [
				{ role: "user", content: "A saved question" },
				{ role: "assistant", content: "A saved answer", kind: "model" }
			]
		};
		vi.mocked(window.chora.ListChatConversations).mockResolvedValue([summary]);
		vi.mocked(window.chora.LoadChatConversation).mockResolvedValue(snapshot);

		await controller.StartAsync();
		expect(store.GetView()).toBe("catalogue");
		expect(store.GetConversations()).toEqual([summary]);

		await controller.OpenConversationAsync(summary.id);
		expect(store.GetView()).toBe("conversation");
		expect(store.GetMessages()).toEqual(snapshot.messages);

		controller.NewConversation();
		expect(store.GetConversationId()).toBeNull();
		expect(store.GetMessages()).toEqual([]);

		await controller.ShowCatalogueAsync();
		expect(store.GetView()).toBe("catalogue");
	});

	it("refreshes selectable models when a new conversation begins", async function RefreshesModelsForNewConversation()
	{
		const models: ProviderOption[] = [
			{
				providerId: "copilot-relay",
				modelId: "gpt-5.4",
				modelName: "VS Code Copilot: gpt-5.4"
			}
		];
		vi.mocked(window.chora.GetProviderOptions).mockResolvedValue(models);

		controller.NewConversation();
		await Promise.resolve();
		await Promise.resolve();

		expect(window.chora.GetProviderOptions).toHaveBeenCalledOnce();
		expect(store.GetProviderOptions()).toEqual(models);
	});

	it("restores the submitted text when a request fails", async function RestoresFailedMessage()
	{
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(window.chora.StartChat).mockRejectedValueOnce(new Error("offline"));
		controller.SetDraft("Try this thought.");
		await controller.SendAsync(store.GetDraft());

		expect(store.GetStatus()).toBe("failed");
		expect(store.GetDraft()).toBe("Try this thought.");
		expect(store.GetMessages()).toEqual([]);
	});

	it("keeps a newer composer draft when a pending request fails", async function KeepsNewDraftAsync()
	{
		vi.spyOn(console, "error").mockImplementation(function IgnoreExpectedFailure(): void {});
		vi.mocked(window.chora.StartChat).mockImplementationOnce(async function FailAfterTypingAsync(): Promise<ChatResult>
		{
			controller.SetDraft("My next thought");
			throw new Error("offline");
		});
		await controller.SendAsync("Earlier question");
		expect(store.GetStatus()).toBe("failed");
		expect(store.GetDraft()).toBe("My next thought");
		expect(store.GetMessages()).toEqual([]);
	});

	it("releases its model stream subscription", function ReleasesStreamSubscription()
	{
		controller.Dispose();

		expect(unsubscribeFromStream).toHaveBeenCalledOnce();
	});
});
