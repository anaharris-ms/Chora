import type { ChatContext } from "../../shared/chat/chat-types.js";
import type { ModelMessage, ModelRequest } from "../../shared/chat/model-types.js";
import { ChatPromptLoader } from "./prompt-loader.js";

const DefaultPromptLoader = new ChatPromptLoader();

export async function BuildChatRequestAsync(
	context: ChatContext,
	question: string,
	history: ModelMessage[] = [],
	promptLoader: ChatPromptLoader = DefaultPromptLoader
): Promise<ModelRequest>
{
	const trimmedQuestion = question.trim();

	if (trimmedQuestion.length === 0) throw new Error("A chat question is required.");

	const systemPrompt = await promptLoader.LoadAsync(context);
	const request: ModelRequest = {
		systemPrompt,
		userPrompt: trimmedQuestion,
		history,
		context
	};

	return request;
}
