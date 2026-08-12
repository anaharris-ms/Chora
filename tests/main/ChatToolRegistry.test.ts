import { describe, expect, it } from "vitest";
import { ChatToolRegistry } from "../../src/main/chat/ChatToolRegistry.js";

describe("chat tool registry", function ChatToolRegistryTests()
{
	it("registers, lists, parses, and invokes an extensible tool", async function InvokesTool()
	{
		const registry = new ChatToolRegistry();
		registry.Register({ name: "lookup", label: "Lookup", description: "Looks up a term." }, (query) => `Found ${query}`);

		expect(registry.List()).toEqual([{ name: "lookup", label: "Lookup", description: "Looks up a term." }]);
		expect(await registry.InvokeAsync("@lookup logos")).toEqual({ toolName: "lookup", content: "Found logos" });
		expect(await registry.InvokeAsync("ordinary message")).toBeNull();
	});
});
