import type { ChatStreamDelta } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection } from "../../shared/chat/ModelTypes.js";
import type { ApiSubscription } from "../../shared/contracts/ChoraApi.js";
import { ReadingContextBuilder } from "../core/context/ReadingContextBuilder.js";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChatGateway } from "./ChatGateway.js";
import { ChatStore } from "./ChatStore.js";

// Coordinates Chat workflows between the composer, the active transcript, and the main process.
export class ChatController
{
	// Owns the live subscription to streamed assistant tokens.
	private readonly unsubscribeFromStream: ApiSubscription;
	// Pending stream-notification timer, or null when nothing is scheduled.
	private notificationTimer: ReturnType<typeof setTimeout> | null = null;
	// Releases the signal-chat event subscription with the controller.
	private readonly unsubscribeFromSignal: ApiSubscription;
	// Releases the whole-Dream chat event subscription with the controller.
	private readonly unsubscribeFromDream: ApiSubscription;

	// Creates the controller and subscribes to streamed assistant tokens.
	public constructor(
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly errors: ErrorManager,
		private readonly contexts: ReadingContextBuilder,
		private readonly store: ChatStore,
		private readonly gateway: ChatGateway)
	{
		this.unsubscribeFromStream = this.gateway.SubscribeToStream(this.ReceiveDelta.bind(this));
		this.unsubscribeFromSignal = this.events.Subscribe("chat.signal-requested", this.HandleSignalRequestedAsync.bind(this));
		this.unsubscribeFromDream = this.events.Subscribe("chat.dream-requested", this.HandleDreamRequestedAsync.bind(this));
	}

	// Opens a signal conversation and sends the reader's observation as its first turn.
	private async HandleSignalRequestedAsync(event: ChoraEvents["chat.signal-requested"]): Promise<void>
	{
		const status = this.store.GetStatus();
		if (status === "submitting" || status === "streaming" || this.store.GetIsDeleting())
		{
			const error = new Error("A chat response is still in progress.");
			this.errors.Report("ChatController", error, "Wait for the current response before opening a signal chat.");
		}
		else
		{
			const context = this.contexts.GetSignalContext(event.dreamId, event.signalId);
			if (context !== null)
			{
				const current = this.store.GetSignalContext();
				const isSame = current?.dream.id === event.dreamId && current.dream.focusedSignal?.id === event.signalId;
				if (!isSame)
				{
					const draft = this.store.GetDraft();
					this.CancelNotification();
					this.store.BeginNewConversation();
					this.store.SetDraft(draft);
				}
				this.store.SetSignalContext(context);
				this.store.ShowConversation();
				await this.PublishChangedAsync();
				await this.events.PublishAsync("chat.conversation-opened", {});
				const signal = context.dream.focusedSignal;
				const messages = this.store.GetMessages();
				if (signal !== undefined && messages.length === 0)
				{
					const description = signal.description.trim();
					const opening = description.length > 0 ? description : signal.text;
					await this.SendMessageAsync(opening, true);
				}
			}
		}
	}

	// Opens a fresh conversation about the whole Dream, without pinning any specific signal.
	private async HandleDreamRequestedAsync(event: ChoraEvents["chat.dream-requested"]): Promise<void>
	{
		const status = this.store.GetStatus();
		if (status === "submitting" || status === "streaming" || this.store.GetIsDeleting())
		{
			const error = new Error("A chat response is still in progress.");
			this.errors.Report("ChatController", error, "Wait for the current response before opening a Dream chat.");
		}
		else
		{
			const context = this.contexts.GetContext();
			if (context.mode === "DREAM" && context.dream.id === event.dreamId)
			{
				const draft = this.store.GetDraft();
				this.CancelNotification();
				this.store.BeginNewConversation();
				this.store.SetDraft(draft);
				this.store.ShowConversation();
				await this.PublishChangedAsync();
				await this.events.PublishAsync("chat.conversation-opened", {});
			}
		}
	}

	// Initializes Chat state and loads the conversation catalogue for a fresh application run.
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

	// Sends the composer draft as a new or continuing conversation message.
	public async SendAsync(message: string): Promise<void>
	{
		await this.SendMessageAsync(message, false);
	}

	// Shares request handling while keeping automatic signal openings out of the composer draft.
	private async SendMessageAsync(message: string, preserveDraft: boolean): Promise<void>
	{
		const content = message.trim();
		const status = this.store.GetStatus();
		if (content.length > 0 && status !== "submitting" && status !== "streaming" && !this.store.GetIsDeleting())
		{
			// Tags this request so streamed deltas can be matched to it; never persisted as domain identity.
			const requestId = crypto.randomUUID();
			const conversationId = this.store.GetConversationId();
			const selection = this.store.GetModelSelection();
			const draft = this.store.GetDraft();
			this.store.BeginRequest(content, requestId);
			if (preserveDraft)
			{
				this.store.SetDraft(draft);
			}
			await this.PublishChangedAsync();
			try
			{
				let context = this.contexts.GetContext();
				const pinned = this.store.GetSignalContext();
				const signal = pinned?.dream.focusedSignal;
				if (pinned !== null && signal !== undefined)
				{
					const latest = this.contexts.GetSignalContext(pinned.dream.id, signal.id);
					context = latest ?? pinned;
					this.store.SetSignalContext(latest ?? pinned);
				}
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
				const currentDraft = this.store.GetDraft();
				const retainedDraft = preserveDraft || currentDraft.length > 0 ? currentDraft : undefined;
				this.Fail(error, "Chat failed.", content, retainedDraft);
			}
		}
	}

	// Deletes a saved chat without changing visible state on failure.
	public async DeleteConversationAsync(conversationId: string): Promise<boolean>
	{
		let deleted = false;
		const status = this.store.GetStatus();
		if (!this.store.GetIsDeleting() && status !== "submitting" && status !== "streaming")
		{
			this.store.SetDeleting(true);
			await this.PublishChangedAsync();
			try
			{
				await this.gateway.DeleteConversationAsync(conversationId);
				this.store.RemoveConversation(conversationId);
				deleted = true;
			}
			catch (error)
			{
				this.errors.Report("ChatController", error, "Unable to delete the conversation. Your chat has not been removed from the list.");
			}
			finally
			{
				this.store.SetDeleting(false);
				await this.PublishChangedAsync();
			}
		}
		return deleted;
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

	// Records composer text as the reader types.
	public SetDraft(value: string): void
	{
		this.store.SetDraft(value);
	}

	// Switches models through a new conversation while preserving the explicit signal and draft.
	public SetModelSelection(selection: ModelSelection): void
	{
		const status = this.store.GetStatus();
		const current = this.store.GetModelSelection();
		const changed = current.providerId !== selection.providerId || current.modelId !== selection.modelId;
		if (changed && status !== "submitting" && status !== "streaming")
		{
			if (this.store.GetHasConversation())
			{
				const draft = this.store.GetDraft();
				const signalContext = this.store.GetSignalContext();
				this.CancelNotification();
				this.store.BeginNewConversation();
				this.store.SetDraft(draft);
				if (signalContext !== null)
				{
					this.store.SetSignalContext(signalContext);
				}
			}
			this.store.SetModelSelection(selection);
			void this.PublishChangedAsync();
		}
	}

	// Releases the stream subscription and flushes composer persistence.
	public Dispose(): void
	{
		this.CancelNotification();
		this.unsubscribeFromStream();
		this.unsubscribeFromSignal();
		this.unsubscribeFromDream();
		this.store.Dispose();
	}

	// Applies a streamed token to the active request, ignoring stale or unrelated deltas.
	private ReceiveDelta(delta: ChatStreamDelta): void
	{
		const status = this.store.GetStatus();
		if (delta.requestId === this.store.GetActiveRequestId() && (status === "submitting" || status === "streaming"))
		{
			this.store.AppendStream(delta.text);
			this.ScheduleNotification();
		}
	}

	// Records a request failure and reports it for diagnostics.
	private Fail(error: unknown, userMessage: string, content: string, retainedDraft?: string): void
	{
		const message = error instanceof Error ? error.message : userMessage;
		this.CancelNotification();
		this.store.FailRequest(content, message);
		if (retainedDraft !== undefined)
		{
			this.store.SetDraft(retainedDraft);
		}
		this.errors.Report("ChatController", error, userMessage);
		void this.PublishChangedAsync();
	}

	// Publishes the current Chat transcript and status to subscribers.
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

	// Schedules a throttled notification while assistant text streams in.
	private ScheduleNotification(): void
	{
		if (this.notificationTimer === null)
		{
			this.notificationTimer = setTimeout(this.HandleNotificationTimer.bind(this), 16);
		}
	}

	// Publishes a throttled update once the notification timer elapses.
	private HandleNotificationTimer(): void
	{
		this.notificationTimer = null;
		void this.PublishChangedAsync();
	}

	// Cancels a pending stream-notification timer, if any.
	private CancelNotification(): void
	{
		if (this.notificationTimer !== null)
		{
			clearTimeout(this.notificationTimer);
			this.notificationTimer = null;
		}
	}
}
