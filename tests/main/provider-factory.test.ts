import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "../../src/shared/chat/model-types.js";
import { KimiModelProvider } from "../../src/main/models/kimi-model-provider.js";
import { MockModelProvider } from "../../src/main/models/mock-model-provider.js";
import { CreateModelProvider, GetProviderOptions } from "../../src/main/models/model-provider-factory.js";

function CreateRequest(): ModelRequest
{
	const request: ModelRequest = {
		systemPrompt: "System prompt",
		userPrompt: "Question",
		history: [],
		context: { mode: "FREE" }
	};

	return request;
}

describe("Model provider factory", function ProviderFactoryTests()
{
	afterEach(function RestoreEnvironment()
	{
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("uses mock when no configured provider is present", function UsesMockDefault()
	{
		const provider = CreateModelProvider();

		expect(provider).toBeInstanceOf(MockModelProvider);
	});

	it("creates the Kimi provider from main-process configuration", function CreatesConfiguredProvider()
	{
		vi.stubEnv("MODEL_PROVIDER", "kimi");
		const kimiProvider = CreateModelProvider();

		expect(kimiProvider).toBeInstanceOf(KimiModelProvider);
	});

	it("lists configured model names for provider selection", function ListsModelNames()
	{
		vi.stubEnv("KIMI_MODEL", "kimi-k2.6");
		const options = GetProviderOptions();

		expect(options).toEqual([
			{
				providerId: "mock",
				modelName: "Mock"
			},
			{
				providerId: "kimi",
				modelName: "kimi-k2.6"
			}
		]);
	});

	it("returns a controlled configuration error before a live request", async function ControlsMissingKeys()
	{
		const kimiProvider = new KimiModelProvider();

		await expect(kimiProvider.CompleteAsync(CreateRequest())).rejects.toMatchObject({
			code: "configuration"
		});
	});
});
