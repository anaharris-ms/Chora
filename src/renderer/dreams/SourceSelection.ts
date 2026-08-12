import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";
import type { SourceSelection } from "../../shared/dreams/DreamTypes.js";

interface SourcePiece
{
	segmentKey: string;
	segmentOffset: number;
	start: number;
	end: number;
}

function BuildPieces(work: LibraryText, source: SourceSelection): SourcePiece[]
{
	const startIndex = work.segments.findIndex((segment) => segment.key === source.start.segmentKey);
	const endIndex = work.segments.findIndex((segment) => segment.key === source.end.segmentKey);
	const pieces: SourcePiece[] = [];
	let position = 0;

	if (startIndex < 0 || endIndex < startIndex) throw new Error("Dream source segments are invalid.");

	for (let index = startIndex; index <= endIndex; index += 1)
	{
		const segment = work.segments[index];

		if (segment === undefined) throw new Error("Dream source segment is missing.");

		const segmentOffset = index === startIndex ? source.start.offset : 0;
		const segmentEnd = index === endIndex ? source.end.offset : segment.text.length;
		const length = segmentEnd - segmentOffset;
		pieces.push({ segmentKey: segment.key, segmentOffset, start: position, end: position + length });
		position += length;
		if (index < endIndex) position += 1;
	}

	return pieces;
}

function GetPoint(pieces: SourcePiece[], offset: number): TextSelection["start"] | null
{
	let point: TextSelection["start"] | null = null;

	for (const piece of pieces)
	{
		if (offset >= piece.start && offset <= piece.end)
		{
			point = { segmentKey: piece.segmentKey, offset: piece.segmentOffset + offset - piece.start };
			break;
		}
	}

	return point;
}

export function CreateDreamSourceSelection(work: LibraryText, source: SourceSelection, startOffset: number, endOffset: number): TextSelection | null
{
	const pieces = BuildPieces(work, source);
	const start = GetPoint(pieces, startOffset);
	const end = GetPoint(pieces, endOffset);
	let selection: TextSelection | null = null;

	if (start !== null && end !== null && startOffset < endOffset)
	{
		selection = {
			documentId: source.documentId,
			start,
			end,
			selectedText: source.selectedText.slice(startOffset, endOffset),
			locatorStart: work.segments.find((segment) => segment.key === start.segmentKey)?.locator ?? null,
			locatorEnd: work.segments.find((segment) => segment.key === end.segmentKey)?.locator ?? null
		};
	}

	return selection;
}
