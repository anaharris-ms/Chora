import { describe, expect, it } from "vitest";
import path from "node:path";
import { ChatPromptLoader, PromptLoader } from "../../src/main/chat/PromptLoader.js";

describe("prompt loading", function PromptLoaderTests()
{
	it("loads each chat context from its Markdown resource", async function LoadsChatPrompts()
	{
		const prompts = new PromptLoader(path.join(process.cwd(), "Prompts"));
		const loader = new ChatPromptLoader(prompts);

		const contextBase = { documentId: "republic", sourcePassage: "text", contextBefore: "", contextAfter: "", locator: null, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 4 }, dream: { id: "d1", title: "", exegesis: "", signals: [] } } as const;
		expect(await loader.LoadAsync({ ...contextBase, mode: "DREAM" })).toContain("Dream context");
		expect(await loader.LoadAsync({ mode: "TEXT", documentId: "republic", sourcePassage: "text", contextBefore: "", contextAfter: "", locator: null, start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 4 } })).toContain("reading companion discussing a passage");
		expect(await loader.LoadAsync({ mode: "FREE" })).toContain("No text is currently open");
	});

	it("rejects unsafe prompt names", async function RejectsUnsafeNames()
	{
		const loader = new PromptLoader(path.join(process.cwd(), "Prompts"));

		await expect(loader.LoadAsync("../secret")).rejects.toThrow("Prompt names may contain only");
	});
});
