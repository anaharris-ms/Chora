import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import type { ApiSubscription } from "../../shared/contracts/ChoraApi.js";

// Stateless IPC client for the Chat use cases exposed by the main process.
export class ChatGateway
{
	// Subscribes to streamed assistant tokens for the active request.
	public SubscribeToStream(handler: (delta: ChatStreamDelta) => void): ApiSubscription
	{
		const unsubscribe = window.chora.SubscribeChatDelta(handler);

		return unsubscribe;
	}

	// Returns the provider configured for the reader's Relay connection.
	public GetProviderAsync(): Promise<ProviderId>
	{
		return window.chora.GetConfiguredProvider();
	}

	// Lists the models available for a new conversation.
	public GetProviderOptionsAsync(): Promise<ProviderOption[]>
	{
		return window.chora.GetProviderOptions();
	}

	// Lists the tools the assistant may invoke during a conversation.
	public GetToolsAsync(): Promise<ChatToolDefinition[]>
	{
		return window.chora.GetChatTools();
	}

	// Lists durable conversations for the Chat history view.
	public ListConversationsAsync(): Promise<ChatConversationSummary[]>
	{
		return window.chora.ListChatConversations();
	}

	// Starts a new conversation with the reader's first message.
	public StartAsync(context: ChatContext, selection: ModelSelection, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.StartChat(context, selection, message, requestId);
	}

	// Continues an existing conversation with the reader's next message.
	public ContinueAsync(conversationId: string, context: ChatContext, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.ContinueChat(conversationId, context, message, requestId);
	}

	// Deletes a saved conversation through the privileged process.
	public async DeleteConversationAsync(conversationId: string): Promise<void>
	{
		await window.chora.DeleteChatConversation(conversationId);
	}

	// Loads one durable conversation for reopening in the active Chat view.
	public LoadConversationAsync(conversationId: string): Promise<ChatConversationSnapshot>
	{
		return window.chora.LoadChatConversation(conversationId);
	}
}
