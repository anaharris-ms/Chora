export type ProviderErrorCode = "configuration" | "authentication" | "rate-limit" | "network" | "timeout" | "malformed-response" | "mock-failure";

export class ProviderError extends Error
{
	public readonly code: ProviderErrorCode;

	public constructor(code: ProviderErrorCode, message: string)
	{
		super(message);
		this.code = code;
		this.name = "ProviderError";
	}
}

export function CreateProviderError(code: ProviderErrorCode, message: string): ProviderError
{
	const error = new ProviderError(code, message);

	return error;
}

export function CreateResponseError(providerName: string, status: number): ProviderError
{
	let error: ProviderError;

	if (status === 401 || status === 403)
	{
		error = CreateProviderError("authentication", `${providerName} rejected the configured API key.`);
	}
	else if (status === 429)
	{
		error = CreateProviderError("rate-limit", `${providerName} rate limited the model request. Please try again later.`);
	}
	else
	{
		error = CreateProviderError("network", `${providerName} could not complete the model request.`);
	}

	return error;
}

export function TranslateProviderError(providerName: string, error: unknown): ProviderError
{
	let translatedError: ProviderError;

	if (error instanceof ProviderError)
	{
		translatedError = error;
	}
	else if (error instanceof DOMException && error.name === "AbortError")
	{
		translatedError = CreateProviderError("timeout", `${providerName} did not respond before the model request timed out.`);
	}
	else
	{
		translatedError = CreateProviderError("network", `${providerName} could not be reached.`);
	}

	return translatedError;
}
