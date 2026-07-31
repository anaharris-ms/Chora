import type { ModelMessage, ModelProvider } from "../../shared/chat/model-types.js";

export interface ChatSession
{
	provider: ModelProvider;
	messages: ModelMessage[];
}

export class ChatSessionRepository
{
	private readonly sessions = new Map<string, ChatSession>();

	public Add(conversationId: string, session: ChatSession): void
	{
		this.sessions.set(conversationId, session);
	}

	public Get(conversationId: string): ChatSession
	{
		const session = this.sessions.get(conversationId);
		if (session === undefined) throw new Error("The chat conversation is no longer available.");
		return session;
	}
}
