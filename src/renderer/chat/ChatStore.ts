import type { ChatConversationSnapshot, ChatConversationSummary, ChatMessage, ChatToolDefinition, DreamChatContext } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import { SessionStore } from "../core/session/SessionStore.js";

export type ChatStatus = "idle" | "submitting" | "streaming" | "failed";
export type ChatView = "catalogue" | "conversation";

// Sole renderer-side owner of Chat conversation and composer state.
export class ChatStore
{
	// Session storage key for the composer draft.
	private static readonly DraftKey = "chora:chat-draft";
	// Delay before an uncommitted draft is persisted to session storage.
	private static readonly DraftPersistenceDelayMilliseconds = 250;
	// Messages in the active conversation.
	private messages: ChatMessage[] = [];
	// Identifier of the active conversation once it has been persisted, or null when unsaved.
	private conversationId: string | null = null;
	// Provider selected for a new conversation.
	private provider: ProviderId = "mock";
	// Model selected for a new conversation.
	private modelId = "mock";
	// Models available for a new conversation.
	private providerOptions: ProviderOption[] = [];
	// Tools the assistant may invoke during a conversation.
	private tools: ChatToolDefinition[] = [];
	// Lifecycle of the active request, or "idle" when nothing is in flight.
	private status: ChatStatus = "idle";
	// Assistant text streamed so far for the active request.
	private streamText = "";
	// Message describing the most recent request failure, or null when none occurred.
	private errorMessage: string | null = null;
	// Composer text not yet sent.
	private draft = "";
	// Correlation identifier for the in-flight request, or null when none is active.
	private activeRequestId: string | null = null;
	// Which view of the Chat feature is currently displayed.
	private view: ChatView = "catalogue";
	// Durable conversation summaries for the Chat history view.
	private conversations: ChatConversationSummary[] = [];
	// Pending draft-persistence timer, or null when nothing is scheduled.
	private persistenceTimer: ReturnType<typeof setTimeout> | null = null;
	// Explicit context retained for this signal conversation when reading focus changes.
	private signalContext: DreamChatContext | null = null;
	// Prevents overlapping workflows while a saved chat is being deleted.
	private deleting = false;

	// Reports whether a deletion is waiting for the main process.
	public GetIsDeleting(): boolean
	{
		return this.deleting;
	}

	// Marks the deletion workflow without changing the transcript or draft.
	public SetDeleting(value: boolean): void
	{
		this.deleting = value;
	}

	// Removes a confirmed deletion and preserves an unsent draft when closing that chat.
	public RemoveConversation(conversationId: string): void
	{
		this.conversations = this.conversations.filter(function KeepConversation(conversation): boolean
		{
			return conversation.id !== conversationId;
		});
		if (this.conversationId === conversationId)
		{
			const draft = this.draft;
			this.Reset();
			this.SetDraft(draft);
			this.ShowCatalogue();
		}
	}

	// Returns an isolated snapshot of the selected signal context.
	public GetSignalContext(): DreamChatContext | null
	{
		const context = structuredClone(this.signalContext);
		return context;
	}

	// Refreshes the selected signal from the editor before sending.
	public SetSignalContext(context: DreamChatContext): void
	{
		this.signalContext = structuredClone(context);
	}

	// Restores the composer draft from a prior application run.
	public constructor(private readonly sessions: SessionStore)
	{
		this.draft = this.sessions.Load<string>(ChatStore.DraftKey) ?? "";
	}

	// Returns an immutable snapshot of the active conversation's messages.
	public GetMessages(): readonly ChatMessage[]
	{
		return structuredClone(this.messages);
	}

	// Returns the identifier of the active conversation, or null when it is unsaved.
	public GetConversationId(): string | null
	{
		return this.conversationId;
	}

	// Returns the provider selected for a new conversation.
	public GetProvider(): ProviderId
	{
		return this.provider;
	}

	// Returns the exact provider and model chosen for a new conversation.
	public GetModelSelection(): ModelSelection
	{
		const selection: ModelSelection = {
			providerId: this.provider,
			modelId: this.modelId
		};

		return selection;
	}

	// Returns the models available for a new conversation.
	public GetProviderOptions(): readonly ProviderOption[]
	{
		return structuredClone(this.providerOptions);
	}

	// Replaces the selectable model catalogue without changing an active selection.
	public SetProviderOptions(options: ProviderOption[]): void
	{
		this.providerOptions = structuredClone(options);
	}

	// Returns the tools the assistant may invoke during a conversation.
	public GetTools(): readonly ChatToolDefinition[]
	{
		return structuredClone(this.tools);
	}

	// Returns the lifecycle of the active request.
	public GetStatus(): ChatStatus
	{
		return this.status;
	}

	// Returns the assistant text streamed so far for the active request.
	public GetStreamText(): string
	{
		return this.streamText;
	}

	// Returns the message describing the most recent request failure, or null when none occurred.
	public GetErrorMessage(): string | null
	{
		return this.errorMessage;
	}

	// Returns the composer text not yet sent.
	public GetDraft(): string
	{
		return this.draft;
	}

	// Returns the correlation identifier for the in-flight request, or null when none is active.
	public GetActiveRequestId(): string | null
	{
		return this.activeRequestId;
	}

	// Returns whether the active conversation has been persisted.
	public GetHasConversation(): boolean
	{
		return this.conversationId !== null;
	}

	// Returns whether Chat displays its saved-history catalogue or an active conversation.
	public GetView(): ChatView
	{
		return this.view;
	}

	// Returns saved conversation summaries for the Chat history view.
	public GetConversations(): readonly ChatConversationSummary[]
	{
		const conversations = structuredClone(this.conversations);

		return conversations;
	}

	// Selects the default model and records the reader's provider and tool options.
	public Initialize(provider: ProviderId, options: ProviderOption[], tools: ChatToolDefinition[]): void
	{
		const defaultOption = options.find(function FindConfiguredProvider(option: ProviderOption): boolean
		{
			return option.providerId === provider;
		}) ?? options[0];

		if (this.conversationId === null && defaultOption !== undefined)
		{
			this.provider = defaultOption.providerId;
			this.modelId = defaultOption.modelId;
		}
		this.providerOptions = structuredClone(options);
		this.tools = structuredClone(tools);
	}

	// Appends the reader's message and marks the request as in flight.
	public BeginRequest(content: string, requestId: string): void
	{
		this.CancelPersistence();
		this.messages.push({ role: "user", content });
		this.draft = "";
		this.sessions.Remove(ChatStore.DraftKey);
		this.status = "submitting";
		this.streamText = "";
		this.errorMessage = null;
		this.activeRequestId = requestId;
	}

	// Appends streamed assistant text to the active request.
	public AppendStream(text: string): void
	{
		this.status = "streaming";
		this.streamText += text;
	}

	// Records the assistant's completed response and the conversation it now belongs to.
	public CompleteRequest(conversationId: string, message: ChatMessage): void
	{
		this.conversationId = conversationId;
		this.messages.push(structuredClone(message));
		this.status = "idle";
		this.streamText = "";
		this.activeRequestId = null;
	}

	// Replaces the saved history catalogue after main-process persistence completes.
	public SetConversations(conversations: readonly ChatConversationSummary[]): void
	{
		this.conversations = [...structuredClone(conversations)];
	}

	// Opens a saved conversation and restores it as the active renderer state.
	public OpenConversation(snapshot: ChatConversationSnapshot): void
	{
		this.signalContext = structuredClone(snapshot.signalContext ?? null);
		this.messages = structuredClone(snapshot.messages);
		this.conversationId = snapshot.id;
		this.provider = snapshot.provider;
		this.modelId = snapshot.modelId;
		this.status = "idle";
		this.streamText = "";
		this.errorMessage = null;
		this.draft = "";
		this.activeRequestId = null;
		this.view = "conversation";
		this.sessions.Remove(ChatStore.DraftKey);
	}

	// Begins a new unsaved conversation in the active Chat view.
	public BeginNewConversation(): void
	{
		this.Reset();
		this.view = "conversation";
	}

	// Reveals the existing transcript without resetting its signal or draft.
	public ShowConversation(): void
	{
		this.view = "conversation";
	}

	// Returns from an active conversation to the saved history catalogue.
	public ShowCatalogue(): void
	{
		this.view = "catalogue";
	}

	// Restores the reader's message as an unsent draft and records the request failure.
	public FailRequest(content: string, message: string): void
	{
		const lastMessage = this.messages[this.messages.length - 1];
		if (lastMessage?.role === "user" && lastMessage.content === content) this.messages.pop();
		this.draft = content;
		this.PersistDraft();
		this.status = "failed";
		this.errorMessage = message;
		this.streamText = "";
		this.activeRequestId = null;
	}

	// Records composer text and schedules its persistence.
	public SetDraft(value: string): void
	{
		this.draft = value;
		this.SchedulePersistence();
	}

	// Records the provider and model chosen for a new, unsaved conversation.
	public SetModelSelection(selection: ModelSelection): void
	{
		if (this.conversationId === null)
		{
			this.provider = selection.providerId;
			this.modelId = selection.modelId;
		}
	}

	// Clears the active conversation and composer state.
	public Reset(): void
	{
		this.signalContext = null;
		this.messages = [];
		this.conversationId = null;
		this.status = "idle";
		this.streamText = "";
		this.errorMessage = null;
		this.draft = "";
		this.activeRequestId = null;
		this.CancelPersistence();
		this.sessions.Remove(ChatStore.DraftKey);
	}

	// Flushes any pending draft persistence before the store is torn down.
	public Dispose(): void
	{
		this.FlushDraftPersistence();
	}

	// Schedules a delayed draft-persistence write, replacing any pending one.
	private SchedulePersistence(): void
	{
		this.CancelPersistence();
		this.persistenceTimer = setTimeout(this.HandlePersistenceTimer.bind(this), ChatStore.DraftPersistenceDelayMilliseconds);
	}

	// Writes the draft once a pending persistence timer elapses.
	private HandlePersistenceTimer(): void
	{
		this.persistenceTimer = null;
		this.PersistDraft();
	}

	// Writes any pending draft-persistence snapshot immediately.
	private FlushDraftPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			this.CancelPersistence();
			this.PersistDraft();
		}
	}

	// Cancels a pending draft-persistence timer, if any.
	private CancelPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			clearTimeout(this.persistenceTimer);
			this.persistenceTimer = null;
		}
	}

	// Writes the composer draft to session storage.
	private PersistDraft(): void
	{
		this.sessions.Save(ChatStore.DraftKey, this.draft);
	}
}
