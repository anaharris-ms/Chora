import { describe, expect, it } from "vitest";
import path from "node:path";
import { ChatService } from "../../src/main/chat/chat-service.js";
import { ChatPromptLoader, PromptLoader } from "../../src/main/chat/prompt-loader.js";
import type { ChatContext } from "../../src/shared/chat/chat-types.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../../src/shared/chat/model-types.js";

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

describe("chat sessions", function ChatSessionTests()
{
	it("uses the current inferred context on every turn while preserving history", async function UpdatesContext()
	{
		const provider = new CapturingProvider();
		const promptLoader = new ChatPromptLoader(new PromptLoader(path.join(process.cwd(), "Prompts")));
		const service = new ChatService(undefined, () => provider, promptLoader);
		const free: ChatContext = { mode: "FREE" };
		const text: ChatContext = { mode: "TEXT", documentId: "republic", sourcePassage: "κατέβην", contextBefore: "Before.", contextAfter: "After.", locator: { scheme: "Stephanus", value: "327a" }, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 8 } };
		const dream: ChatContext = {
			mode: "DREAM",
			interactionMode: "ECHO",
			documentId: "republic",
			sourcePassage: "κατέβην",
			contextBefore: "Before.",
			contextAfter: "After.",
			locator: { scheme: "Stephanus", value: "327a" },
			start: { segmentKey: "s1", offset: 0 },
			end: { segmentKey: "s1", offset: 8 },
			dream: { id: "d1", title: "Descent", exegesis: "Movement begins.", signals: [{ text: "κατέβην", description: "Chosen movement." }] }
		};

		const started = await service.Start(free, "mock", "How do I begin?");
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
	});
});
