import type { ChatStreamDelta } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection } from "../../shared/chat/ModelTypes.js";
import type { ApiSubscription } from "../../shared/contracts/ChoraApi.js";
import { ReadingContextBuilder } from "../core/context/ReadingContextBuilder.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChatGateway } from "./ChatGateway.js";
import { ChatStore } from "./ChatStore.js";

export class ChatController
{
	private readonly unsubscribeFromStream: ApiSubscription;
	private readonly subscriptions: Unsubscribe[] = [];
	private notificationTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly events: ChoraEventBus<ChoraEvents>, private readonly errors: ErrorManager, private readonly contexts: ReadingContextBuilder, private readonly store: ChatStore, private readonly gateway: ChatGateway)
	{
		this.unsubscribeFromStream = this.gateway.SubscribeToStream((delta) => this.ReceiveDelta(delta));
	}

	public async StartAsync(): Promise<void>
	{
		try
		{
			const provider = await this.gateway.GetProviderAsync();
			const options = await this.gateway.GetProviderOptionsAsync();
			const tools = await this.gateway.GetToolsAsync();
			this.store.Initialize(provider, options, tools);
			await this.RefreshConversationsAsync();
			await this.PublishChangedAsync();
		}
		catch (error)
		{
			this.Fail(error, "Unable to initialize chat.", "");
		}
	}

	public async SendAsync(message: string): Promise<void>
	{
		const content = message.trim();
		const status = this.store.GetStatus();
		if (content.length > 0 && status !== "submitting" && status !== "streaming")
		{
			const requestId = crypto.randomUUID();
			const conversationId = this.store.GetConversationId();
			const selection = this.store.GetModelSelection();
			this.store.BeginRequest(content, requestId);
			await this.PublishChangedAsync();
			try
			{
				const context = this.contexts.GetContext();
				const result = conversationId === null
					? await this.gateway.StartAsync(context, selection, content, requestId)
					: await this.gateway.ContinueAsync(conversationId, context, content, requestId);
				this.store.CompleteRequest(result.conversationId, { role: "assistant", content: result.text, kind: result.kind });
				await this.RefreshConversationsAsync();
				this.CancelNotification();
				await this.PublishChangedAsync();
			}
			catch (error)
			{
				this.Fail(error, "Chat failed.", content);
			}
		}
	}

	// Starts a new unsaved conversation and displays its empty transcript.
	public NewConversation(): void
	{
		this.CancelNotification();
		this.store.BeginNewConversation();
		void this.RefreshProviderOptionsAsync();
		void this.PublishChangedAsync();
	}

	// Returns from the active transcript to the persisted conversation list.
	public async ShowCatalogueAsync(): Promise<void>
	{
		this.CancelNotification();
		await this.RefreshConversationsAsync();
		this.store.ShowCatalogue();
		await this.PublishChangedAsync();
	}

	// Loads a selected saved conversation into the active transcript view.
	public async OpenConversationAsync(conversationId: string): Promise<void>
	{
		try
		{
			const snapshot = await this.gateway.LoadConversationAsync(conversationId);
			this.store.OpenConversation(snapshot);
			await this.PublishChangedAsync();
		}
		catch (error)
		{
			this.Fail(error, "Unable to open the conversation.", "");
		}
	}

	public SetDraft(value: string): void
	{
		this.store.SetDraft(value);
	}

	public SetModelSelection(selection: ModelSelection): void
	{
		this.store.SetModelSelection(selection);
		void this.PublishChangedAsync();
	}

	public Dispose(): void
	{
		this.CancelNotification();
		this.unsubscribeFromStream();
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
		this.store.Dispose();
	}

	private ReceiveDelta(delta: ChatStreamDelta): void
	{
		const status = this.store.GetStatus();
		if (delta.requestId === this.store.GetActiveRequestId() && (status === "submitting" || status === "streaming"))
		{
			this.store.AppendStream(delta.text);
			this.ScheduleNotification();
		}
	}

	private Fail(error: unknown, userMessage: string, content: string): void
	{
		const message = error instanceof Error ? error.message : userMessage;
		this.CancelNotification();
		this.store.FailRequest(content, message);
		this.errors.Report("ChatController", error, userMessage);
		void this.PublishChangedAsync();
	}

	private async PublishChangedAsync(): Promise<void>
	{
		await this.events.PublishAsync("chat.changed", { messages: [...this.store.GetMessages()], status: this.store.GetStatus() });
	}

	// Refreshes the renderer catalogue from the main-process conversation repository.
	private async RefreshConversationsAsync(): Promise<void>
	{
		const conversations = await this.gateway.ListConversationsAsync();
		this.store.SetConversations(conversations);
	}

	// Reloads models when a reader begins a conversation after the Relay becomes available.
	private async RefreshProviderOptionsAsync(): Promise<void>
	{
		try
		{
			const options = await this.gateway.GetProviderOptionsAsync();
			this.store.SetProviderOptions(options);
			await this.PublishChangedAsync();
		}
		catch (error)
		{
			this.errors.Report("ChatController", error, "Unable to refresh available models.");
		}
	}

	private ScheduleNotification(): void
	{
		if (this.notificationTimer === null)
		{
			this.notificationTimer = setTimeout(() =>
			{
				this.notificationTimer = null;
				void this.PublishChangedAsync();
			}, 16);
		}
	}

	private CancelNotification(): void
	{
		if (this.notificationTimer !== null)
		{
			clearTimeout(this.notificationTimer);
			this.notificationTimer = null;
		}
	}
}
