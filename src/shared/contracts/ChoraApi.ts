import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../chat/ModelTypes.js";
import type { LibraryText, LibraryTextSummary, SourceNotice } from "../library/LibraryTypes.js";
import type { SelectionAction } from "../library/SelectionTypes.js";
import type { Dream } from "../dreams/DreamTypes.js";
import type { PatternRecord } from "../patterns/PatternTypes.js";

export type ApiSubscription = () => void;

export interface ChoraApi
{
	ListLibraryTexts(): Promise<LibraryTextSummary[]>;
	LoadLibraryText(workId: string): Promise<LibraryText>;
	SubscribeLibraryTextSelected(callback: (workId: string) => void): ApiSubscription;
	SubscribeExternalTextLoaded(callback: (work: LibraryText) => void): ApiSubscription;
	ShowSelectionContextMenu(): Promise<SelectionAction>;
	ShowDreamSourceContextMenu(): Promise<SelectionAction>;
	CopySelectedText(selectedText: string): Promise<void>;
	LookUpWord(selectedText: string): Promise<void>;
	StartChat(context: ChatContext, selection: ModelSelection, question: string, requestId: string): Promise<ChatResult>;
	ContinueChat(conversationId: string, context: ChatContext, question: string, requestId: string): Promise<ChatResult>;
	ListChatConversations(): Promise<ChatConversationSummary[]>;
	LoadChatConversation(conversationId: string): Promise<ChatConversationSnapshot>;
	// Permanently removes a saved conversation.
	DeleteChatConversation(conversationId: string): Promise<void>;
	GetChatTools(): Promise<ChatToolDefinition[]>;
	SubscribeChatDelta(callback: (delta: ChatStreamDelta) => void): ApiSubscription;
	GetConfiguredProvider(): Promise<ProviderId>;
	GetProviderOptions(): Promise<ProviderOption[]>;
	GetSourceNotice(workId: string): Promise<SourceNotice>;
	ListPatterns(workId: string): Promise<PatternRecord[]>;
	SaveDream(dream: Dream): Promise<Dream>;
	DeleteDream(dreamId: string): Promise<void>;
	ListDreams(): Promise<Dream[]>;
	AllocateDreamId(): Promise<string>;
}
