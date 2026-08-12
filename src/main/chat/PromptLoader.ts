import fs from "node:fs/promises";
import path from "node:path";
import type { ChatContext } from "../../shared/chat/ChatTypes.js";
import { ResolveResourcePath } from "../bootstrap/ResourcePaths.js";

export class PromptLoader
{
	private readonly promptDirectory: string | null;
	private readonly cache = new Map<string, string>();

	public constructor(promptDirectory: string | null = null)
	{
		this.promptDirectory = promptDirectory;
	}

	public async LoadAsync(promptName: string): Promise<string>
	{
		if (!/^[a-z0-9-]+$/u.test(promptName)) throw new Error("Prompt names may contain only lowercase letters, numbers, and hyphens.");

		let prompt = this.cache.get(promptName);

		if (prompt === undefined)
		{
			const promptDirectory = this.promptDirectory ?? ResolveResourcePath("Prompts");
			const promptPath = path.join(promptDirectory, `${promptName}.md`);
			prompt = (await fs.readFile(promptPath, "utf8")).trim();

			if (prompt.length === 0) throw new Error(`Prompt ${promptName} is empty.`);

			this.cache.set(promptName, prompt);
		}

		return prompt;
	}
}

export class ChatPromptLoader
{
	private readonly prompts: PromptLoader;

	public constructor(prompts: PromptLoader = new PromptLoader())
	{
		this.prompts = prompts;
	}

	public async LoadAsync(context: ChatContext): Promise<string>
	{
		let promptName = "chat-free";
		if (context.mode === "TEXT") promptName = "chat-text";
		if (context.mode === "DREAM") promptName = "chat-dream";
		const prompt = await this.prompts.LoadAsync(promptName);

		return prompt;
	}
}
