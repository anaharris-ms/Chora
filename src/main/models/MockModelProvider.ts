import type { ModelDeltaHandler, ModelProvider, ModelRequest, ModelResponse } from "../../shared/chat/ModelTypes.js";
import { CreateProviderError } from "./ModelProviderError.js";

const MockLatencyMilliseconds = 650;

// Creates deterministic chat or discovery output without external inference.
function CreateChatResponse(request: ModelRequest): string
{
	const isIdeaDiscovery = request.systemPrompt.includes("IDEA_SIGNAL_DISCOVERY");
	let response = "{\"matches\":[]}";

	if (!isIdeaDiscovery)
	{
		const selectedText = request.context.mode === "FREE" ? request.userPrompt : request.context.sourcePassage;
		const trimmedText = selectedText.trim();
		const normalizedText = trimmedText.replace(/\s+/gu, " ");
		const excerpt = normalizedText.slice(0, 240);
		response = `Working from this selected text-state: "${excerpt}". The first useful question is how the passage's movement, delay, or reversal bears on your question.`;
	}

	return response;
}

function IsFailureEnabled(): boolean
{
	const configuredValue = process.env.MOCK_MODEL_FAILURE ?? process.env.MOCK_ANALYSIS_FAILURE ?? "false";
	const normalizedValue = configuredValue.trim().toLowerCase();
	const isEnabled = normalizedValue === "true";

	return isEnabled;
}

function WaitForLatency(): Promise<void>
{
	const delay = new Promise<void>(function ResolveDelay(resolve)
	{
		setTimeout(resolve, MockLatencyMilliseconds);
	});

	return delay;
}

export class MockModelProvider implements ModelProvider
{
	public readonly id = "mock" as const;

	public async CompleteAsync(request: ModelRequest, onDelta?: ModelDeltaHandler): Promise<ModelResponse>
	{
		await WaitForLatency();

		if (IsFailureEnabled())
		{
			const error = CreateProviderError("mock-failure", "Mock model failure is enabled by MOCK_MODEL_FAILURE.");

			throw error;
		}

		const rawText = CreateChatResponse(request);
		const result: ModelResponse = {
			provider: this.id,
			model: "deterministic-mock",
			rawText
		};

		if (onDelta !== undefined)
		{
			onDelta(rawText);
		}

		return result;
	}
}
