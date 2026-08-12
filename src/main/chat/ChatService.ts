import { randomUUID } from "node:crypto";
import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatMessage, ChatResult, ChatToolDefinition } from "../../shared/chat/ChatTypes.js";
import type { ModelDeltaHandler, ModelProvider, ModelSelection } from "../../shared/chat/ModelTypes.js";
import { BuildChatRequestAsync } from "./ChatRequestBuilder.js";
import { ChatToolRegistry } from "./ChatToolRegistry.js";
import { CreateModelProvider } from "../models/ModelProviderFactory.js";
import { ChatPromptLoader } from "./PromptLoader.js";
import { ChatSessionRepository, type ChatSession } from "./ChatSessionRepository.js";
import { ChatConversation } from "./ChatConversation.js";
import { ChatConversationRepository } from "./ChatConversationRepository.js";

export type ChatProviderFactory = (selection: ModelSelection) => ModelProvider;

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
		private readonly sessions: ChatSessionRepository,
		private readonly conversations: ChatConversationRepository
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

	public async Start(context: ChatContext, selection: ModelSelection, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const conversationId = randomUUID();
		const conversation = new ChatConversation(conversationId, selection);
		const session = this.CreateSession(selection);
		const result = await this.SendAsync(session, conversation, context, question, onDelta);
		this.sessions.Add(conversationId, session);

		return result;
	}

	public async Continue(conversationId: string, context: ChatContext, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const snapshot = await this.conversations.GetAsync(conversationId);
		const conversation = ChatConversation.Restore(snapshot);
		const session = this.GetOrCreateSession(conversation);
		const result = await this.SendAsync(session, conversation, context, question, onDelta);

		return result;
	}

	// Lists saved conversations for the reader's conversation history view.
	public ListConversationsAsync(): Promise<ChatConversationSummary[]>
	{
		return this.conversations.ListAsync();
	}

	// Loads one saved conversation for reopening in the renderer.
	public GetConversationAsync(conversationId: string): Promise<ChatConversationSnapshot>
	{
		return this.conversations.GetAsync(conversationId);
	}

	// Releases all non-serializable providers during module shutdown.
	public Stop(): void
	{
		this.sessions.Clear();
	}

	private async SendAsync(session: ChatSession, conversation: ChatConversation, context: ChatContext, question: string, onDelta?: ModelDeltaHandler): Promise<ChatResult>
	{
		const trimmedQuestion = question.trim();

		if (trimmedQuestion.length === 0) throw new Error("A chat question is required.");

		const toolResult = await this.tools.InvokeAsync(trimmedQuestion);
		let result: ChatResult;

		if (toolResult !== null)
		{
			const content = `Tool @${toolResult.toolName}\n${toolResult.content}`;
			result = { text: content, conversationId: conversation.GetId(), kind: "tool" };
		}
		else
		{
			const history = conversation.GetModelHistory();
			const request = await BuildChatRequestAsync(context, trimmedQuestion, history, this.promptLoader);
			const response = await session.provider.CompleteAsync(request, onDelta);
			result = BuildModelResult(response, conversation.GetId());
		}

		const message: ChatMessage = { role: "assistant", content: result.text, kind: result.kind };
		conversation.AddExchange(trimmedQuestion, message);
		const snapshot = conversation.CreateSnapshot();
		await this.conversations.SaveAsync(snapshot);

		return result;
	}

	// Creates a runtime-only provider session for a durable conversation provider choice.
	private CreateSession(selection: ModelSelection): ChatSession
	{
		const provider = this.createProvider(selection);
		const session: ChatSession = { provider };

		return session;
	}

	// Reuses an active provider session or reconstructs one from the saved conversation.
	private GetOrCreateSession(conversation: ChatConversation): ChatSession
	{
		const conversationId = conversation.GetId();
		const cached = this.sessions.TryGet(conversationId);
		let session = cached;

		if (session === null)
		{
			const selection = conversation.GetModelSelection();
			session = this.CreateSession(selection);
			this.sessions.Add(conversationId, session);
		}

		return session;
	}
}
