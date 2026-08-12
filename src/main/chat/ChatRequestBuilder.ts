import type { ChatContext } from "../../shared/chat/ChatTypes.js";
import type { ModelMessage, ModelRequest } from "../../shared/chat/ModelTypes.js";
import { ChatPromptLoader } from "./PromptLoader.js";

const DefaultPromptLoader = new ChatPromptLoader();

export async function BuildChatRequestAsync(
	context: ChatContext,
	question: string,
	history: readonly ModelMessage[] = [],
	promptLoader: ChatPromptLoader = DefaultPromptLoader
): Promise<ModelRequest>
{
	const trimmedQuestion = question.trim();

	if (trimmedQuestion.length === 0) throw new Error("A chat question is required.");

	const systemPrompt = await promptLoader.LoadAsync(context);
	const request: ModelRequest = {
		systemPrompt,
		userPrompt: trimmedQuestion,
		history: [...history],
		context
	};

	return request;
}
