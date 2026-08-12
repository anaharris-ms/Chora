import type { ModelProvider, ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import { CopilotRelayModelProvider } from "./CopilotRelayModelProvider.js";
import { KimiModelProvider } from "./KimiModelProvider.js";
import { MockModelProvider } from "./MockModelProvider.js";
import { DefaultCopilotRelayModelFamily, DefaultKimiModel, GetOptionalValue } from "./ModelProviderSettings.js";

export function GetConfiguredProvider(): ProviderId
{
	const configuredProvider = (process.env.MODEL_PROVIDER ?? process.env.ANALYSIS_PROVIDER)?.trim();
	let providerId: ProviderId = "mock";

	if (configuredProvider === "kimi")
	{
		providerId = "kimi";
	}
	else if (configuredProvider === "copilot-relay")
	{
		providerId = "copilot-relay";
	}

	return providerId;
}

export function CreateModelProvider(selection?: ModelSelection): ModelProvider
{
	const configuredProvider = GetConfiguredProvider();
	const effectiveSelection: ModelSelection = selection ?? { providerId: configuredProvider, modelId: "" };
	const providerId = effectiveSelection.providerId;
	let provider: ModelProvider;

	if (providerId === "kimi")
	{
		provider = new KimiModelProvider(effectiveSelection.modelId);
	}
	else if (providerId === "copilot-relay")
	{
		provider = new CopilotRelayModelProvider(effectiveSelection.modelId);
	}
	else
	{
		provider = new MockModelProvider();
	}

	return provider;
}

export async function GetProviderOptionsAsync(): Promise<ProviderOption[]>
{
	const modelName = GetOptionalValue("KIMI_MODEL", DefaultKimiModel);
	const relayModelFamily = GetOptionalValue("COPILOT_RELAY_MODEL_FAMILY", DefaultCopilotRelayModelFamily);
	const options: ProviderOption[] = [
		{
			providerId: "mock",
			modelId: "mock",
			modelName: "Mock"
		},
		{
			providerId: "kimi",
			modelId: modelName,
			modelName
		}
	];
	const relay = new CopilotRelayModelProvider();
	let modelFamilies: string[];

	try
	{
		modelFamilies = await relay.ListModelFamiliesAsync();
	}
	catch
	{
		modelFamilies = [relayModelFamily];
	}

	for (const modelFamily of modelFamilies)
	{
		const option: ProviderOption = {
			providerId: "copilot-relay",
			modelId: modelFamily,
			modelName: `VS Code Copilot: ${modelFamily}`
		};
		options.push(option);
	}

	return options;
}
