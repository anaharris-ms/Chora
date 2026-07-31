import type { ModelProvider, ProviderId, ProviderOption } from "../../shared/chat/model-types.js";
import { KimiModelProvider } from "./kimi-model-provider.js";
import { MockModelProvider } from "./mock-model-provider.js";
import { DefaultKimiModel, GetOptionalValue } from "./model-provider-settings.js";

export function GetConfiguredProvider(): ProviderId
{
	const configuredProvider = (process.env.MODEL_PROVIDER ?? process.env.ANALYSIS_PROVIDER)?.trim();
	let providerId: ProviderId = "mock";

	if (configuredProvider === "kimi")
	{
		providerId = "kimi";
	}

	return providerId;
}

export function CreateModelProvider(selectedProvider?: ProviderId): ModelProvider
{
	const providerId = selectedProvider ?? GetConfiguredProvider();
	let provider: ModelProvider;

	if (providerId === "kimi")
	{
		provider = new KimiModelProvider();
	}
	else
	{
		provider = new MockModelProvider();
	}

	return provider;
}

export function GetProviderOptions(): ProviderOption[]
{
	const modelName = GetOptionalValue("KIMI_MODEL", DefaultKimiModel);
	const options: ProviderOption[] = [
		{
			providerId: "mock",
			modelName: "Mock"
		},
		{
			providerId: "kimi",
			modelName
		}
	];

	return options;
}
