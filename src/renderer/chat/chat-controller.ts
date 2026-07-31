import type { ChatStreamDelta, DreamInteractionMode } from "../../shared/chat/chat-types.js";
import type { ProviderId } from "../../shared/chat/model-types.js";
import type { ApiSubscription } from "../../shared/contracts/chora-api.js";
import { ReadingContextBuilder } from "../core/context/reading-context-builder.js";
import { ErrorManager } from "../core/diagnostics/renderer-error-manager.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/chora-event-bus.js";
import type { ChoraEvents } from "../core/events/chora-events.js";
import { ChatGateway } from "./chat-gateway.js";
import { ChatStore } from "./chat-store.js";

export class ChatController
{
	private readonly unsubscribeFromStream: ApiSubscription;
	private readonly subscriptions: Unsubscribe[] = [];
	private notificationTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly events: ChoraEventBus<ChoraEvents>, private readonly errors: ErrorManager, private readonly contexts: ReadingContextBuilder, private readonly store: ChatStore, private readonly gateway: ChatGateway)
	{
		this.unsubscribeFromStream = this.gateway.SubscribeToStream((delta) => this.ReceiveDelta(delta));
		this.subscriptions.push(this.events.Subscribe("dream.opened", () => this.SetDreamActive(true)));
		this.subscriptions.push(this.events.Subscribe("dream.closed", () => this.SetDreamActive(false)));
	}

	public async StartAsync(): Promise<void>
	{
		try
		{
			const provider = await this.gateway.GetProviderAsync();
			const options = await this.gateway.GetProviderOptionsAsync();
			const tools = await this.gateway.GetToolsAsync();
			this.store.Initialize(provider, options, tools);
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
			this.store.BeginRequest(content, requestId);
			await this.PublishChangedAsync();
			try
			{
				const context = this.contexts.GetContext(this.store.GetDreamInteractionMode());
				const result = conversationId === null
					? await this.gateway.StartAsync(context, this.store.GetProvider(), content, requestId)
					: await this.gateway.ContinueAsync(conversationId, context, content, requestId);
				this.store.CompleteRequest(result.conversationId, { role: "assistant", content: result.text, kind: result.kind });
				this.CancelNotification();
				await this.PublishChangedAsync();
			}
			catch (error)
			{
				this.Fail(error, "Chat failed.", content);
			}
		}
	}

	public Reset(): void
	{
		this.CancelNotification();
		this.store.Reset();
		void this.PublishChangedAsync();
	}

	public SetDraft(value: string): void
	{
		this.store.SetDraft(value);
	}

	public SetProvider(provider: ProviderId): void
	{
		this.store.SetProvider(provider);
		void this.PublishChangedAsync();
	}

	public SetDreamInteractionMode(mode: DreamInteractionMode): void
	{
		this.store.SetDreamInteractionMode(mode);
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

	private SetDreamActive(isDreamActive: boolean): void
	{
		this.store.SetIsDreamActive(isDreamActive);
		void this.PublishChangedAsync();
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
