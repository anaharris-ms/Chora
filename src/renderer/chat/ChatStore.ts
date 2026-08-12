import type { ChatConversationSnapshot, ChatConversationSummary, ChatMessage, ChatToolDefinition } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import { SessionStore } from "../core/session/SessionStore.js";

export type ChatStatus = "idle" | "submitting" | "streaming" | "failed";
export type ChatView = "catalogue" | "conversation";

export class ChatStore
{
	private static readonly DraftKey = "chora:chat-draft";
	private messages: ChatMessage[] = [];
	private conversationId: string | null = null;
	private provider: ProviderId = "mock";
	private modelId = "mock";
	private providerOptions: ProviderOption[] = [];
	private tools: ChatToolDefinition[] = [];
	private status: ChatStatus = "idle";
	private streamText = "";
	private errorMessage: string | null = null;
	private draft = "";
	private activeRequestId: string | null = null;
	private view: ChatView = "catalogue";
	private conversations: ChatConversationSummary[] = [];
	private persistenceTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly sessions: SessionStore)
	{
		this.draft = this.sessions.Load<string>(ChatStore.DraftKey) ?? "";
	}

	public GetMessages(): readonly ChatMessage[]
	{
		return this.messages;
	}

	public GetConversationId(): string | null
	{
		return this.conversationId;
	}

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

	public GetProviderOptions(): readonly ProviderOption[]
	{
		return this.providerOptions;
	}

	// Replaces the selectable model catalogue without changing an active selection.
	public SetProviderOptions(options: ProviderOption[]): void
	{
		this.providerOptions = [...options];
	}

	public GetTools(): readonly ChatToolDefinition[]
	{
		return this.tools;
	}

	public GetStatus(): ChatStatus
	{
		return this.status;
	}

	public GetStreamText(): string
	{
		return this.streamText;
	}

	public GetErrorMessage(): string | null
	{
		return this.errorMessage;
	}

	public GetDraft(): string
	{
		return this.draft;
	}

	public GetActiveRequestId(): string | null
	{
		return this.activeRequestId;
	}

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
		this.providerOptions = [...options];
		this.tools = [...tools];
	}

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

	public AppendStream(text: string): void
	{
		this.status = "streaming";
		this.streamText += text;
	}

	public CompleteRequest(conversationId: string, message: ChatMessage): void
	{
		this.conversationId = conversationId;
		this.messages.push(message);
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

	// Returns from an active conversation to the saved history catalogue.
	public ShowCatalogue(): void
	{
		this.view = "catalogue";
	}

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

	public SetDraft(value: string): void
	{
		this.draft = value;
		this.SchedulePersistence();
	}

	public SetModelSelection(selection: ModelSelection): void
	{
		if (this.conversationId === null)
		{
			this.provider = selection.providerId;
			this.modelId = selection.modelId;
		}
	}

	public Reset(): void
	{
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

	public Dispose(): void
	{
		this.FlushDraftPersistence();
	}

	private SchedulePersistence(): void
	{
		this.CancelPersistence();
		this.persistenceTimer = setTimeout(() =>
		{
			this.persistenceTimer = null;
			this.PersistDraft();
		}, 250);
	}

	private FlushDraftPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			this.CancelPersistence();
			this.PersistDraft();
		}
	}

	private CancelPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			clearTimeout(this.persistenceTimer);
			this.persistenceTimer = null;
		}
	}

	private PersistDraft(): void
	{
		this.sessions.Save(ChatStore.DraftKey, this.draft);
	}
}
