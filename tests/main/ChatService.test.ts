import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChatService } from "../../src/main/chat/ChatService.js";
import { ChatConversationRepository } from "../../src/main/chat/ChatConversationRepository.js";
import { ChatSessionRepository } from "../../src/main/chat/ChatSessionRepository.js";
import { ChatPromptLoader, PromptLoader } from "../../src/main/chat/PromptLoader.js";
import type { ChatContext } from "../../src/shared/chat/ChatTypes.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../../src/shared/chat/ModelTypes.js";

class CapturingProvider implements ModelProvider
{
	public readonly id = "mock" as const;
	public readonly requests: ModelRequest[] = [];

	public async CompleteAsync(request: ModelRequest): Promise<ModelResponse>
	{
		this.requests.push(request);

		return { provider: "mock", model: "capturing-provider", rawText: `Response ${this.requests.length}` };
	}
}

// Temporary Documents roots used by durable Chat conversation tests.
const directories: string[] = [];

// Creates a ChatService whose saved conversations live in an isolated temporary directory.
async function CreateServiceAsync(provider: CapturingProvider, promptLoader: ChatPromptLoader): Promise<ChatService>
{
	const directory = await mkdtemp(path.join(os.tmpdir(), "chora-chat-"));
	const sessions = new ChatSessionRepository();
	const conversations = new ChatConversationRepository(directory);
	const service = new ChatService(undefined, function CreateCapturingProvider()
	{
		return provider;
	}, promptLoader, sessions, conversations);

	directories.push(directory);

	return service;
}

describe("chat sessions", function ChatSessionTests()
{
	afterEach(async function RemoveConversationDirectoriesAsync()
	{
		for (const directory of directories.splice(0))
		{
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("uses the current inferred context on every turn while preserving history", async function UpdatesContext()
	{
		const provider = new CapturingProvider();
		const promptLoader = new ChatPromptLoader(new PromptLoader(path.join(process.cwd(), "Prompts")));
		const service = await CreateServiceAsync(provider, promptLoader);
		const free: ChatContext = { mode: "FREE" };
		const text: ChatContext = { mode: "TEXT", documentId: "republic", sourcePassage: "κατέβην", contextBefore: "Before.", contextAfter: "After.", locator: { scheme: "Stephanus", value: "327a" }, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 8 } };
		const dream: ChatContext = {
			mode: "DREAM",
			documentId: "republic",
			sourcePassage: "κατέβην",
			contextBefore: "Before.",
			contextAfter: "After.",
			locator: { scheme: "Stephanus", value: "327a" },
			start: { segmentKey: "s1", offset: 0 },
			end: { segmentKey: "s1", offset: 8 },
			dream: { id: "d1", title: "Descent", exegesis: "Movement begins.", signals: [{ text: "κατέβην", description: "Chosen movement." }] }
		};

		const started = await service.Start(free, { providerId: "mock", modelId: "mock" }, "How do I begin?");
		await service.Continue(started.conversationId, text, "What is happening here?");
		await service.Continue(started.conversationId, dream, "Deepen this dream.");

		expect(provider.requests.map((request) => request.context.mode)).toEqual(["FREE", "TEXT", "DREAM"]);
		expect(provider.requests.map((request) => request.history.length)).toEqual([0, 2, 4]);
		expect(provider.requests[2]?.context).toEqual(dream);
		expect(provider.requests[2]?.history).toEqual([
			{ role: "user", content: "How do I begin?" },
			{ role: "assistant", content: "Response 1" },
			{ role: "user", content: "What is happening here?" },
			{ role: "assistant", content: "Response 2" }
		]);
		expect(provider.requests[2]?.userPrompt).toBe("Deepen this dream.");
		const conversations = await service.ListConversationsAsync();
		const saved = await service.GetConversationAsync(started.conversationId);

		expect(conversations).toHaveLength(1);
		expect(saved.modelId).toBe("mock");
		expect(saved.messages).toHaveLength(6);
	});
});
