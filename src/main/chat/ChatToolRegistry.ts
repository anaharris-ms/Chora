import type { ChatToolDefinition } from "../../shared/chat/ChatTypes.js";

export interface ChatToolResult
{
	toolName: string;
	content: string;
}

export type ChatToolHandler = (query: string) => Promise<string> | string;

interface RegisteredChatTool
{
	definition: ChatToolDefinition;
	handler: ChatToolHandler;
}

export class ChatToolRegistry
{
	private readonly tools = new Map<string, RegisteredChatTool>();

	public Register(definition: ChatToolDefinition, handler: ChatToolHandler): void
	{
		const name = definition.name.trim().toLocaleLowerCase();

		if (!/^[a-z][a-z0-9-]*$/u.test(name)) throw new Error("Tool names must begin with a letter and contain only letters, numbers, or hyphens.");
		if (this.tools.has(name)) throw new Error(`The @${name} tool is already registered.`);

		this.tools.set(name, { definition: { ...definition, name }, handler });
	}

	public List(): ChatToolDefinition[]
	{
		return Array.from(this.tools.values()).map((tool) => ({ ...tool.definition }));
	}

	public async InvokeAsync(message: string): Promise<ChatToolResult | null>
	{
		const invocation = /^@([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/iu.exec(message.trim());
		let result: ChatToolResult | null = null;

		if (invocation !== null)
		{
			const toolName = (invocation[1] ?? "").toLocaleLowerCase();
			const query = invocation[2]?.trim() ?? "";
			const tool = this.tools.get(toolName);

			if (tool === undefined) throw new Error(`The @${toolName} tool is not registered.`);

			const content = await tool.handler(query);
			result = { toolName, content };
		}

		return result;
	}
}
