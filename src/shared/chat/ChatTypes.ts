import type { SourceLocator } from "../library/LibraryTypes.js";
import type { ModelMessageRole, ModelUsage, ProviderId } from "./ModelTypes.js";
import type { TextSelection } from "../library/SelectionTypes.js";

export interface TextChatContext
{
	mode: "TEXT";
	documentId: string;
	sourcePassage: string;
	contextBefore: string;
	contextAfter: string;
	locator: SourceLocator | null;
	start: TextSelection["start"];
	end: TextSelection["end"];
}

export interface DreamChatContent
{
	// Signal explicitly selected by the reader as the conversation's focus.
	focusedSignal?: { id: string; text: string; description: string };
	id: string;
	title: string;
	exegesis: string;
	signals: Array<{ text: string; description: string }>;
}

export interface DreamChatContext extends Omit<TextChatContext, "mode">
{
	mode: "DREAM";
	dream: DreamChatContent;
}

export interface FreeChatContext
{
	mode: "FREE";
}

export type ChatContext = DreamChatContext | TextChatContext | FreeChatContext;

export interface ChatStreamDelta
{
	requestId: string;
	text: string;
}

export interface ChatResult
{
	text: string;
	provider?: ProviderId;
	model?: string;
	usage?: ModelUsage;
	conversationId: string;
	kind: "model" | "tool";
}

export interface ChatMessage
{
	role: ModelMessageRole;
	content: string;
	kind?: "model" | "tool";
}

// Serializable record representing one reader-owned conversation.
export interface ChatConversationSnapshot
{
	// Explicit signal focus retained when a saved conversation is reopened.
	signalContext?: DreamChatContext;
	// Stable identifier assigned to the conversation.
	id: string;
	// Reader-facing title derived from the first exchange.
	title: string;
	// Provider used when the conversation was last continued.
	provider: ProviderId;
	// Exact model selected when the conversation began.
	modelId: string;
	// Ordered conversation history.
	messages: ChatMessage[];
	// Time at which the conversation was created.
	createdAt: string;
	// Time at which the conversation was last completed.
	updatedAt: string;
}

// Compact read model displayed by the saved conversation list.
export interface ChatConversationSummary
{
	// Stable identifier assigned to the conversation.
	id: string;
	// Reader-facing title derived from the first exchange.
	title: string;
	// Time at which the conversation was last completed.
	updatedAt: string;
}

export interface ChatToolDefinition
{
	name: string;
	label: string;
	description: string;
}
