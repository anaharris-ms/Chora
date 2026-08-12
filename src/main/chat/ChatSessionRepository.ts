import type { ModelProvider } from "../../shared/chat/ModelTypes.js";

export interface ChatSession
{
	provider: ModelProvider;
}

// Owns the bounded cache of non-serializable provider sessions.
export class ChatSessionRepository
{
	// Maximum number of inactive provider sessions retained in application memory.
	private static readonly MaximumSessionCount = 20;
	// Provider sessions ordered from least to most recently used.
	private readonly sessions = new Map<string, ChatSession>();

	// Stores a session and retires the least-recently-used session when capacity is reached.
	public Add(conversationId: string, session: ChatSession): void
	{
		this.sessions.delete(conversationId);
		this.sessions.set(conversationId, session);
		this.TrimToCapacity();
	}

	// Returns a session when it remains active in the runtime cache.
	public TryGet(conversationId: string): ChatSession | null
	{
		const session = this.sessions.get(conversationId);
		let result: ChatSession | null = null;

		if (session !== undefined)
		{
			this.sessions.delete(conversationId);
			this.sessions.set(conversationId, session);
			result = session;
		}

		return result;
	}

	// Releases all runtime-only provider sessions during application shutdown.
	public Clear(): void
	{
		this.sessions.clear();
	}

	// Retires oldest inactive sessions until the configured capacity is satisfied.
	private TrimToCapacity(): void
	{
		while (this.sessions.size > ChatSessionRepository.MaximumSessionCount)
		{
			const oldestConversationId = this.sessions.keys().next().value;

			if (oldestConversationId !== undefined)
			{
				this.sessions.delete(oldestConversationId);
			}
		}
	}
}
