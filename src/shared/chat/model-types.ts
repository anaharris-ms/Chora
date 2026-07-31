import type { ChatContext } from "./chat-types.js";

export type ProviderId = "mock" | "kimi";

export interface ProviderOption
{
	providerId: ProviderId;
	modelName: string;
}

export type ModelMessageRole = "user" | "assistant";

export interface ModelMessage
{
	role: ModelMessageRole;
	content: string;
}

export interface ModelRequest
{
	systemPrompt: string;
	userPrompt: string;
	history: ModelMessage[];
	context: ChatContext;
}

export type ModelDeltaHandler = (delta: string) => void;

export interface ModelUsage
{
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

export interface ModelResponse
{
	provider: ProviderId;
	model: string;
	rawText: string;
	requestId?: string;
	usage?: ModelUsage;
}

export interface ModelProvider
{
	readonly id: ProviderId;
	CompleteAsync(request: ModelRequest, onDelta?: ModelDeltaHandler): Promise<ModelResponse>;
}
