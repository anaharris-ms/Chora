import { describe, expect, it } from "vitest";
import path from "node:path";
import { BuildChatRequestAsync } from "../../src/main/chat/ChatRequestBuilder.js";
import { ChatPromptLoader, PromptLoader } from "../../src/main/chat/PromptLoader.js";
import type { ChatContext } from "../../src/shared/chat/ChatTypes.js";

const promptLoader = new ChatPromptLoader(new PromptLoader(path.join(process.cwd(), "Prompts")));

describe("chat request construction", function ChatRequestTests()
{
	it.each([
		[{ mode: "FREE" }, "No text is currently open"],
		[{ mode: "TEXT", documentId: "republic", sourcePassage: "κατέβην", contextBefore: "", contextAfter: "", locator: { scheme: "Stephanus", value: "327a" }, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 8 } }, "reading companion discussing a passage"],
		[{ mode: "DREAM", documentId: "republic", sourcePassage: "κατέβην", contextBefore: "", contextAfter: "", locator: { scheme: "Stephanus", value: "327a" }, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 8 }, dream: { id: "d1", title: "Descent", exegesis: "Movement begins.", signals: [{ text: "κατέβην", description: "Chosen movement." }] } }, "Dream context"]
	] as Array<[ChatContext, string]>)
	("builds the correct %s mode request", async function BuildsModeRequest(context, expectedPrompt)
	{
		const request = await BuildChatRequestAsync(context, "What should I notice?", [], promptLoader);

		expect(request.context).toEqual(context);
		expect(request.systemPrompt).toContain(expectedPrompt);
		expect(request.systemPrompt).not.toContain(JSON.stringify(context, null, 2));
	});
});
