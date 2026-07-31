import type { ChatMessage, ChatToolDefinition, DreamInteractionMode } from "../../shared/chat/chat-types.js";
import type { ProviderId, ProviderOption } from "../../shared/chat/model-types.js";
import { SessionStore } from "../core/session/session-store.js";

export type ChatStatus = "idle" | "submitting" | "streaming" | "failed";

interface ChatSessionSnapshot
{
	messages: ChatMessage[];
	conversationId: string | null;
	provider: ProviderId;
	draft?: string;
	dreamInteractionMode?: DreamInteractionMode;
}

export class ChatStore
{
	private static readonly SessionKey = "chora:chat-session";
	private static readonly DraftKey = "chora:chat-draft";
	private messages: ChatMessage[] = [];
	private conversationId: string | null = null;
	private provider: ProviderId = "mock";
	private providerOptions: ProviderOption[] = [];
	private tools: ChatToolDefinition[] = [];
	private status: ChatStatus = "idle";
	private streamText = "";
	private errorMessage: string | null = null;
	private draft = "";
	private activeRequestId: string | null = null;
	private dreamInteractionMode: DreamInteractionMode = "ECHO";
	private isDreamActive = false;
	private persistenceTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly sessions: SessionStore)
	{
		const snapshot = this.sessions.Load<ChatSessionSnapshot>(ChatStore.SessionKey);
		if (snapshot !== null)
		{
			this.messages = snapshot.messages;
			this.conversationId = snapshot.conversationId;
			this.provider = snapshot.provider;
			this.dreamInteractionMode = snapshot.dreamInteractionMode ?? "ECHO";
		}
		this.draft = this.sessions.Load<string>(ChatStore.DraftKey) ?? snapshot?.draft ?? "";
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

	public GetProviderOptions(): readonly ProviderOption[]
	{
		return this.providerOptions;
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

	public GetDreamInteractionMode(): DreamInteractionMode
	{
		return this.dreamInteractionMode;
	}

	public GetIsDreamActive(): boolean
	{
		return this.isDreamActive;
	}

	public Initialize(provider: ProviderId, options: ProviderOption[], tools: ChatToolDefinition[]): void
	{
		if (this.conversationId === null) this.provider = provider;
		this.providerOptions = [...options];
		this.tools = [...tools];
		this.Persist();
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
		this.Persist();
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
		this.Persist();
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
		this.Persist();
	}

	public SetDraft(value: string): void
	{
		this.draft = value;
		this.SchedulePersistence();
	}

	public SetProvider(provider: ProviderId): void
	{
		if (this.conversationId === null) this.provider = provider;
		this.Persist();
	}

	public SetDreamInteractionMode(mode: DreamInteractionMode): void
	{
		this.dreamInteractionMode = mode;
		this.Persist();
	}

	public SetIsDreamActive(isDreamActive: boolean): void
	{
		this.isDreamActive = isDreamActive;
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
		this.sessions.Remove(ChatStore.SessionKey);
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

	private Persist(): void
	{
		this.sessions.Save(ChatStore.SessionKey, { messages: this.messages, conversationId: this.conversationId, provider: this.provider, dreamInteractionMode: this.dreamInteractionMode });
	}

	private PersistDraft(): void
	{
		this.sessions.Save(ChatStore.DraftKey, this.draft);
	}
}
