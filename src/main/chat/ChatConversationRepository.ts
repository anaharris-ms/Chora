import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatConversationSnapshot, ChatConversationSummary } from "../../shared/chat/ChatTypes.js";

// Persists serializable reader conversations beneath the Chora documents library.
export class ChatConversationRepository
{
	// Directory name reserved for stored conversation records.
	private static readonly ConversationsDirectoryName = "Conversations";
	// File extension used by conversation records.
	private static readonly ConversationFileExtension = ".json";

	// Creates a repository rooted at the operating-system Documents directory.
	public constructor(private readonly documentsPath: string)
	{
	}

	// Lists saved conversations ordered by most recent completed exchange.
	public async ListAsync(): Promise<ChatConversationSummary[]>
	{
		let snapshots = await this.LoadAllAsync();
		let summaries: ChatConversationSummary[] = [];

		for (let snapshot of snapshots)
		{
			let summary: ChatConversationSummary = {
				id: snapshot.id,
				title: snapshot.title,
				updatedAt: snapshot.updatedAt
			};
			summaries.push(summary);
		}

		summaries.sort(this.CompareSummaries);

		return summaries;
	}

	// Loads one complete persisted conversation by identifier.
	public async GetAsync(conversationId: string): Promise<ChatConversationSnapshot>
	{
		this.ValidateIdentifier(conversationId);
		let filePath = this.GetFilePath(conversationId);
		let content = await readFile(filePath, "utf8");
		let value = JSON.parse(content) as unknown;
		let snapshot = this.ValidateSnapshot(value, filePath);

		return snapshot;
	}

	// Atomically persists a completed conversation exchange.
	public async SaveAsync(snapshot: ChatConversationSnapshot): Promise<void>
	{
		let validatedSnapshot = this.ValidateSnapshot(snapshot, "conversation");
		let directory = this.GetDirectoryPath();
		let filePath = this.GetFilePath(validatedSnapshot.id);
		let temporaryPath = `${filePath}.tmp`;
		let content = `${JSON.stringify(validatedSnapshot, null, 2)}\n`;

		await mkdir(directory, { recursive: true });
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, filePath);
	}

	// Deletes one saved conversation when a future list UI requests it.
	public async DeleteAsync(conversationId: string): Promise<void>
	{
		this.ValidateIdentifier(conversationId);
		let filePath = this.GetFilePath(conversationId);

		await unlink(filePath);
	}

	// Loads all valid conversation records from the repository directory.
	private async LoadAllAsync(): Promise<ChatConversationSnapshot[]>
	{
		let directory = this.GetDirectoryPath();
		let entries: string[] = [];

		try
		{
			entries = await readdir(directory);
		}
		catch (error)
		{
			let code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : "";

			if (code !== "ENOENT")
			{
				throw error;
			}
		}

		let snapshots: ChatConversationSnapshot[] = [];

		for (let entry of entries)
		{
			if (entry.endsWith(ChatConversationRepository.ConversationFileExtension))
			{
				let filePath = path.join(directory, entry);
				let content = await readFile(filePath, "utf8");
				let value = JSON.parse(content) as unknown;
				let snapshot = this.ValidateSnapshot(value, filePath);
				snapshots.push(snapshot);
			}
		}

		return snapshots;
	}

	// Resolves the Chora-controlled directory containing all conversation records.
	private GetDirectoryPath(): string
	{
		let directory = path.join(this.documentsPath, "Chora", ChatConversationRepository.ConversationsDirectoryName);

		return directory;
	}

	// Resolves a validated conversation ID to a repository-controlled file path.
	private GetFilePath(conversationId: string): string
	{
		let fileName = `${conversationId}${ChatConversationRepository.ConversationFileExtension}`;
		let filePath = path.join(this.GetDirectoryPath(), fileName);

		return filePath;
	}

	// Validates a persistence record at the main-process boundary.
	private ValidateSnapshot(value: unknown, source: string): ChatConversationSnapshot
	{
		let snapshot = value as Partial<ChatConversationSnapshot>;
		let isValid = typeof snapshot.id === "string"
			&& typeof snapshot.title === "string"
			&& (snapshot.provider === "mock" || snapshot.provider === "kimi" || snapshot.provider === "copilot-relay")
			&& (snapshot.modelId === undefined || typeof snapshot.modelId === "string")
			&& Array.isArray(snapshot.messages)
			&& snapshot.messages.every(this.IsMessage)
			&& typeof snapshot.createdAt === "string"
			&& typeof snapshot.updatedAt === "string";

		if (!isValid)
		{
			throw new Error(`Invalid Chat conversation: ${source}`);
		}

		let conversationId = snapshot.id;

		if (conversationId === undefined)
		{
			throw new Error(`Invalid Chat conversation: ${source}`);
		}

		this.ValidateIdentifier(conversationId);

		const validatedSnapshot = structuredClone(snapshot as ChatConversationSnapshot);
		validatedSnapshot.modelId ??= "";

		return validatedSnapshot;
	}

	// Validates one persisted conversation message.
	private IsMessage(value: unknown): boolean
	{
		let message = value as Partial<ChatConversationSnapshot["messages"][number]>;
		let isValid = (message.role === "user" || message.role === "assistant")
			&& typeof message.content === "string"
			&& (message.kind === undefined || message.kind === "model" || message.kind === "tool");

		return isValid;
	}

	// Rejects identifiers that could escape the repository-controlled directory.
	private ValidateIdentifier(conversationId: string): void
	{
		let isValid = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(conversationId);

		if (!isValid)
		{
			throw new Error("Chat conversation identifier is invalid");
		}
	}

	// Sorts newest conversation records before older records.
	private CompareSummaries(left: ChatConversationSummary, right: ChatConversationSummary): number
	{
		let comparison = right.updatedAt.localeCompare(left.updatedAt);

		return comparison;
	}
}