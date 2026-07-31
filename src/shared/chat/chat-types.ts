import type { SourceLocator } from "../library/library-types.js";
import type { ModelMessageRole, ModelUsage, ProviderId } from "./model-types.js";
import type { TextSelection } from "../library/selection-types.js";

export type DreamInteractionMode = "ECHO" | "NUDGE" | "COUNTER_WEIGHT";

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
	id: string;
	title: string;
	exegesis: string;
	signals: Array<{ text: string; description: string }>;
}

export interface DreamChatContext extends Omit<TextChatContext, "mode">
{
	mode: "DREAM";
	interactionMode: DreamInteractionMode;
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

export interface ChatToolDefinition
{
	name: string;
	label: string;
	description: string;
}
