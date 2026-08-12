import type { ChatConversationSnapshot, ChatConversationSummary, ChatMessage } from "../../shared/chat/ChatTypes.js";
import type { ModelMessage, ModelSelection, ProviderId } from "../../shared/chat/ModelTypes.js";

// Reader-owned conversation that preserves a serializable message history.
export class ChatConversation
{
	// Maximum title length retained in the saved conversation list.
	private static readonly MaximumTitleLength = 72;
// Stable identity of this conversation.
	private readonly id: string;
// Provider selected when this conversation began.
	private readonly provider: ProviderId;
// Exact model selected when this conversation began.
	private readonly modelId: string;
// Time at which this conversation was first created.
	private readonly createdAt: string;
// Ordered messages owned by this conversation.
	private readonly messages: ChatMessage[];
// Reader-facing title derived from the first user message.
	private title: string;
// Time at which this conversation last completed an exchange.
	private updatedAt: string;

	// Creates a new conversation with no persisted exchanges.
	public constructor(id: string, selection: ModelSelection, createdAt: string = new Date().toISOString())
	{
		this.id = id;
		this.provider = selection.providerId;
		this.modelId = selection.modelId;
		this.createdAt = createdAt;
		this.messages = [];
		this.title = "New conversation";
		this.updatedAt = createdAt;
	}

	// Restores a persisted conversation after its repository has validated the snapshot.
	public static Restore(snapshot: ChatConversationSnapshot): ChatConversation
	{
		const selection: ModelSelection = {
			providerId: snapshot.provider,
			modelId: snapshot.modelId
		};
		let conversation = new ChatConversation(snapshot.id, selection, snapshot.createdAt);
		conversation.title = snapshot.title;
		conversation.updatedAt = snapshot.updatedAt;
		conversation.messages.push(...structuredClone(snapshot.messages));

		return conversation;
	}

	// Returns the stable conversation identifier.
	public GetId(): string
	{
		return this.id;
	}

	// Returns the provider required to reconstruct a runtime session.
	public GetProvider(): ProviderId
	{
		return this.provider;
	}

	// Returns the durable provider and model selection for runtime session reconstruction.
	public GetModelSelection(): ModelSelection
	{
		const selection: ModelSelection = {
			providerId: this.provider,
			modelId: this.modelId
		};

		return selection;
	}

	// Returns immutable message snapshots for a model request or renderer response.
	public GetMessages(): readonly ChatMessage[]
	{
		let messages = structuredClone(this.messages);

		return messages;
	}

	// Returns provider-ready history without renderer-only message metadata.
	public GetModelHistory(): readonly ModelMessage[]
	{
		let history: ModelMessage[] = [];

		for (let message of this.messages)
		{
			let modelMessage: ModelMessage = {
				role: message.role,
				content: message.content
			};
			history.push(modelMessage);
		}

		return history;
	}

	// Adds one completed reader and assistant exchange to the conversation.
	public AddExchange(question: string, response: ChatMessage): void
	{
		let userMessage: ChatMessage = { role: "user", content: question };
		this.messages.push(userMessage);
		this.messages.push(structuredClone(response));

		if (this.messages.length === 2)
		{
			this.title = this.CreateTitle(question);
		}

		this.updatedAt = new Date().toISOString();
	}

	// Returns the complete persistence record.
	public CreateSnapshot(): ChatConversationSnapshot
	{
		let snapshot: ChatConversationSnapshot = {
			id: this.id,
			title: this.title,
			provider: this.provider,
			modelId: this.modelId,
			messages: structuredClone(this.messages),
			createdAt: this.createdAt,
			updatedAt: this.updatedAt
		};

		return snapshot;
	}

	// Returns the minimal information required by the conversation list.
	public CreateSummary(): ChatConversationSummary
	{
		let summary: ChatConversationSummary = {
			id: this.id,
			title: this.title,
			updatedAt: this.updatedAt
		};

		return summary;
	}

	// Creates a compact title without allowing a question to dominate the list.
	private CreateTitle(question: string): string
	{
		let compact = question.replace(/\s+/gu, " ").trim();
		let title = compact;

		if (compact.length > ChatConversation.MaximumTitleLength)
		{
			title = `${compact.slice(0, ChatConversation.MaximumTitleLength - 1).trimEnd()}…`;
		}

		return title.length > 0 ? title : "New conversation";
	}
}