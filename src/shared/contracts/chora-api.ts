import type { ChatContext, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../chat/chat-types.js";
import type { ProviderId, ProviderOption } from "../chat/model-types.js";
import type { LibraryText, LibraryTextSummary, SourceNotice } from "../library/library-types.js";
import type { SelectionAction } from "../library/selection-types.js";
import type { Dream } from "../dreams/dream-types.js";

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
	StartChat(context: ChatContext, providerId: ProviderId, question: string, requestId: string): Promise<ChatResult>;
	ContinueChat(conversationId: string, context: ChatContext, question: string, requestId: string): Promise<ChatResult>;
	GetChatTools(): Promise<ChatToolDefinition[]>;
	SubscribeChatDelta(callback: (delta: ChatStreamDelta) => void): ApiSubscription;
	GetConfiguredProvider(): Promise<ProviderId>;
	GetProviderOptions(): Promise<ProviderOption[]>;
	GetSourceNotice(workId: string): Promise<SourceNotice>;
	SaveDream(dream: Dream): Promise<Dream>;
	DeleteDream(dreamId: string): Promise<void>;
	ListDreams(): Promise<Dream[]>;
}
