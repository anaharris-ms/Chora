// Normalizes displayed Unicode so combining marks use canonical composed forms when available.
export function NormalizeDisplayText(value: string): string
{
	const normalized = value.normalize("NFC");

	return normalized;
}
