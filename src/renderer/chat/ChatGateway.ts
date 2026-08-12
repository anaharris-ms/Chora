import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import type { ApiSubscription } from "../../shared/contracts/ChoraApi.js";

export class ChatGateway
{
	public StartAsync(context: ChatContext, selection: ModelSelection, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.StartChat(context, selection, message, requestId);
	}

	public ContinueAsync(conversationId: string, context: ChatContext, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.ContinueChat(conversationId, context, message, requestId);
	}

	// Lists durable conversations for the Chat history view.
	public ListConversationsAsync(): Promise<ChatConversationSummary[]>
	{
		return window.chora.ListChatConversations();
	}

	// Loads one durable conversation for reopening in the active Chat view.
	public LoadConversationAsync(conversationId: string): Promise<ChatConversationSnapshot>
	{
		return window.chora.LoadChatConversation(conversationId);
	}

	public GetProviderAsync(): Promise<ProviderId>
	{
		return window.chora.GetConfiguredProvider();
	}

	public GetProviderOptionsAsync(): Promise<ProviderOption[]>
	{
		return window.chora.GetProviderOptions();
	}

	public GetToolsAsync(): Promise<ChatToolDefinition[]>
	{
		return window.chora.GetChatTools();
	}

	public SubscribeToStream(handler: (delta: ChatStreamDelta) => void): ApiSubscription
	{
		const unsubscribe = window.chora.SubscribeChatDelta(handler);
		return unsubscribe;
	}
}
