import path from "node:path";
import type { LibraryText, TextSegment } from "../../shared/library/library-types.js";

const ExternalDocumentId = "external-text";

function NormalizeText(text: string): string
{
	let normalizedText = text;
	normalizedText = normalizedText.replaceAll("\r\n", "\n");
	normalizedText = normalizedText.replaceAll("\r", "\n");

	if (normalizedText.startsWith("\uFEFF"))
	{
		normalizedText = normalizedText.slice(1);
	}

	return normalizedText;
}

function BuildSegments(text: string): TextSegment[]
{
	// Keep plain text as a single segment so the existing reader and selection flow stay intact.
	const segments: TextSegment[] = [
		{
			key: "segment-1",
			locator: null,
			speaker: null,
			text,
			blockKind: "other"
		}
	];
	return segments;
}

export function BuildExternalText(filePath: string, text: string): LibraryText
{
	const normalizedText = NormalizeText(text);
	const fileName = path.basename(filePath);
	const work: LibraryText = {
		id: ExternalDocumentId,
		urn: null,
		title: fileName,
		titleGreek: null,
		author: "External file",
		language: "und",
		edition: {
			editor: null,
			title: null,
			volume: null,
			publisher: null,
			publicationPlace: null,
			publicationDate: null
		},
		provenance: {
			sourceKind: "external",
			repository: "Local file system",
			commit: "not applicable",
			sourceFile: fileName,
			license: "not supplied",
			externalFilePath: filePath
		},
		segments: BuildSegments(normalizedText)
	};
	return work;
}
