import type { ChatContext, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../../shared/chat/chat-types.js";
import type { ProviderId, ProviderOption } from "../../shared/chat/model-types.js";
import type { ApiSubscription } from "../../shared/contracts/chora-api.js";

export class ChatGateway
{
	public StartAsync(context: ChatContext, provider: ProviderId, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.StartChat(context, provider, message, requestId);
	}

	public ContinueAsync(conversationId: string, context: ChatContext, message: string, requestId: string): Promise<ChatResult>
	{
		return window.chora.ContinueChat(conversationId, context, message, requestId);
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
