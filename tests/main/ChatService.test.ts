import { afterEach, describe, expect, it, vi } from "vitest";
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
	it("deletes only the selected chat and refuses deletion during a response", async function DeletesConversationAsync(): Promise<void>
	{
		const provider = new CapturingProvider();
		const promptPath = path.join(process.cwd(), "Prompts");
		const prompts = new PromptLoader(promptPath);
		const loader = new ChatPromptLoader(prompts);
		const service = await CreateServiceAsync(provider, loader);
		const context: ChatContext = { mode: "FREE" };
		const selection = { providerId: "mock", modelId: "mock" } as const;
		const first = await service.Start(context, selection, "First chat");
		const second = await service.Start(context, selection, "Second chat");
		let release: ((response: ModelResponse) => void) | undefined;
		const pending = new Promise<ModelResponse>(function HoldReply(resolve): void
		{
			release = resolve;
		});
		vi.spyOn(provider, "CompleteAsync").mockReturnValueOnce(pending);
		const continuation = service.Continue(first.conversationId, context, "Continue");
		const deletion = service.DeleteConversationAsync(first.conversationId);
		await expect(deletion).rejects.toThrow("conversation is busy");
		release?.({ provider: "mock", model: "mock", rawText: "Completed" });
		await continuation;
		await service.DeleteConversationAsync(first.conversationId);
		const remaining = await service.ListConversationsAsync();
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.id).toBe(second.conversationId);
		const deleted = service.GetConversationAsync(first.conversationId);
		await expect(deleted).rejects.toMatchObject({ code: "ENOENT" });
		const invalid = service.DeleteConversationAsync("../outside");
		await expect(invalid).rejects.toThrow("identifier is invalid");
	});

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
