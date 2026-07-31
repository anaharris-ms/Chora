import { randomUUID } from "node:crypto";
import type { ChatContext, ChatResult, ChatToolDefinition } from "../../shared/chat/chat-types.js";
import type { ModelDeltaHandler, ModelProvider, ProviderId } from "../../shared/chat/model-types.js";
import { BuildChatRequestAsync } from "./chat-request-builder.js";
import { ChatToolRegistry } from "./chat-tool-registry.js";
import { CreateModelProvider } from "../models/model-provider-factory.js";
import { ChatPromptLoader } from "./prompt-loader.js";
import { ChatSessionRepository, type ChatSession } from "./chat-session-repository.js";

export type ChatProviderFactory = (providerId: ProviderId) => ModelProvider;

function BuildModelResult(response: Awaited<ReturnType<ModelProvider["CompleteAsync"]>>, conversationId: string): ChatResult
{
	const result: ChatResult = {
		text: response.rawText,
		provider: response.provider,
		model: response.model,
		conversationId,
		kind: "model"
	};

	if (response.usage !== undefined) result.usage = response.usage;

	return result;
}

export class ChatService
{
	private readonly tools: ChatToolRegistry;
	private readonly createProvider: ChatProviderFactory;
	private readonly promptLoader: ChatPromptLoader;

	public constructor(
		tools: ChatToolRegistry = new ChatToolRegistry(),
		createProvider: ChatProviderFactory = CreateModelProvider,
		promptLoader: ChatPromptLoader = new ChatPromptLoader(),
		private readonly sessions: ChatSessionRepository = new ChatSessionRepository()
	)
	{
		this.tools = tools;
		this.createProvider = createProvider;
		this.promptLoader = promptLoader;
	}

	public GetTools(): ChatToolDefinition[]
	{
		return this.tools.List();
	}

	public async Start(context: ChatContext, providerId: ProviderId, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const session: ChatSession = {
			provider: this.createProvider(providerId),
			messages: []
		};
		const conversationId = randomUUID();
		const result = await this.SendAsync(session, conversationId, context, question, onDelta);
		this.sessions.Add(conversationId, session);

		return result;
	}

	public async Continue(conversationId: string, context: ChatContext, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const session = this.GetSession(conversationId);
		const result = await this.SendAsync(session, conversationId, context, question, onDelta);

		return result;
	}

	private async SendAsync(session: ChatSession, conversationId: string, context: ChatContext, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const trimmedQuestion = question.trim();

		if (trimmedQuestion.length === 0) throw new Error("A chat question is required.");

		const toolResult = await this.tools.InvokeAsync(trimmedQuestion);
		let result: ChatResult;

		if (toolResult !== null)
		{
			const content = `Tool @${toolResult.toolName}\n${toolResult.content}`;
			result = { text: content, conversationId, kind: "tool" };
			session.messages.push({ role: "user", content: trimmedQuestion });
			session.messages.push({ role: "assistant", content });
		}
		else
		{
			const request = await BuildChatRequestAsync(context, trimmedQuestion, [...session.messages], this.promptLoader);
			const response = await session.provider.CompleteAsync(request, onDelta);
			result = BuildModelResult(response, conversationId);
			session.messages.push({ role: "user", content: trimmedQuestion });
			session.messages.push({ role: "assistant", content: response.rawText });
		}

		return result;
	}

	private GetSession(conversationId: string): ChatSession
	{
		const session = this.sessions.Get(conversationId);
		return session;
	}
}
