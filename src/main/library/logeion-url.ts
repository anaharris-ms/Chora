const LogeionBaseUrl = "https://logeion.uchicago.edu";

function GetLookupWord(selectedText: string): string
{
	const trimmedText = selectedText.trim();
	const words = trimmedText.split(/\s+/);
	const firstWord = words[0] ?? "";
	const lookupWord = firstWord.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
	return lookupWord;
}

export function CreateLogeionUrl(selectedText: string): string | null
{
	const lookupWord = GetLookupWord(selectedText);
	let lookupUrl: string | null = null;

	if (lookupWord.length > 0)
	{
		lookupUrl = `${LogeionBaseUrl}/${lookupWord}`;
	}

	return lookupUrl;
}
