import type { TextSelection } from "./SelectionTypes.js";
import type { LibraryText, TextSegment } from "./LibraryTypes.js";

function GetSegmentByKey(work: LibraryText, segmentKey: string): TextSegment
{
	const segment = work.segments.find((item) => item.key === segmentKey);

	if (segment === undefined) throw new Error(`Invalid segment key: ${segmentKey}`);

	return segment;
}

function ValidateOffset(segment: TextSegment, offset: number): void
{
	const isValid = Number.isInteger(offset) && offset >= 0 && offset <= segment.text.length;

	if (!isValid) throw new Error(`Invalid selection offset for segment ${segment.key}: ${offset}`);
}

function BuildSelectedText(work: LibraryText, selection: TextSelection): string
{
	const startIndex = work.segments.findIndex((item) => item.key === selection.start.segmentKey);
	const endIndex = work.segments.findIndex((item) => item.key === selection.end.segmentKey);
	let canonical = "";

	if (startIndex < 0 || endIndex < startIndex) throw new Error("Invalid selection segment ordering.");

	for (let index = startIndex; index <= endIndex; index += 1)
	{
		const segment = work.segments[index];

		if (segment === undefined) throw new Error("Invalid selection segment ordering.");

		const isFirst = index === startIndex;
		const isLast = index === endIndex;
		let segmentText = segment.text;

		if (isFirst && isLast) segmentText = segmentText.slice(selection.start.offset, selection.end.offset);
		else if (isFirst) segmentText = segmentText.slice(selection.start.offset);
		else if (isLast) segmentText = segmentText.slice(0, selection.end.offset);
		if (canonical.length > 0) canonical += "\n";
		canonical += segmentText;
	}

	return canonical;
}

export function ReconstructSelection(work: LibraryText, selection: TextSelection): TextSelection
{
	if (selection.documentId !== work.id) throw new Error("Selection document does not match the active document.");

	const startSegment = GetSegmentByKey(work, selection.start.segmentKey);
	const endSegment = GetSegmentByKey(work, selection.end.segmentKey);
	ValidateOffset(startSegment, selection.start.offset);
	ValidateOffset(endSegment, selection.end.offset);
	const canonicalText = BuildSelectedText(work, selection);
	const normalizedSelection: TextSelection = {
		documentId: selection.documentId,
		start: { segmentKey: selection.start.segmentKey, offset: selection.start.offset },
		end: { segmentKey: selection.end.segmentKey, offset: selection.end.offset },
		selectedText: canonicalText,
		locatorStart: startSegment.locator,
		locatorEnd: endSegment.locator
	};

	return normalizedSelection;
}

export function ValidateSelectionText(work: LibraryText, selection: TextSelection): void
{
	const canonicalSelection = ReconstructSelection(work, selection);

	if (canonicalSelection.selectedText !== selection.selectedText) throw new Error("Selection reconstruction mismatch.");
}

export function IsSelectionWithin(work: LibraryText, selection: TextSelection, source: TextSelection): boolean
{
	const selectionStartIndex = work.segments.findIndex((segment) => segment.key === selection.start.segmentKey);
	const selectionEndIndex = work.segments.findIndex((segment) => segment.key === selection.end.segmentKey);
	const sourceStartIndex = work.segments.findIndex((segment) => segment.key === source.start.segmentKey);
	const sourceEndIndex = work.segments.findIndex((segment) => segment.key === source.end.segmentKey);
	const startsInside = selectionStartIndex > sourceStartIndex || (selectionStartIndex === sourceStartIndex && selection.start.offset >= source.start.offset);
	const endsInside = selectionEndIndex < sourceEndIndex || (selectionEndIndex === sourceEndIndex && selection.end.offset <= source.end.offset);
	const isInside = selection.documentId === source.documentId
		&& selectionStartIndex >= sourceStartIndex
		&& selectionEndIndex <= sourceEndIndex
		&& sourceStartIndex >= 0
		&& sourceEndIndex >= sourceStartIndex
		&& startsInside
		&& endsInside;

	return isInside;
}

export function CompareSelections(work: LibraryText, first: TextSelection, second: TextSelection): number
{
	const firstIndex = work.segments.findIndex((segment) => segment.key === first.start.segmentKey);
	const secondIndex = work.segments.findIndex((segment) => segment.key === second.start.segmentKey);
	let comparison = firstIndex - secondIndex;

	if (comparison === 0) comparison = first.start.offset - second.start.offset;

	return comparison;
}

export function MergeSelections(work: LibraryText, first: TextSelection, second: TextSelection): TextSelection
{
	const firstStartIndex = work.segments.findIndex((segment) => segment.key === first.start.segmentKey);
	const secondStartIndex = work.segments.findIndex((segment) => segment.key === second.start.segmentKey);
	const firstEndIndex = work.segments.findIndex((segment) => segment.key === first.end.segmentKey);
	const secondEndIndex = work.segments.findIndex((segment) => segment.key === second.end.segmentKey);
	const firstStartsEarlier = firstStartIndex < secondStartIndex || (firstStartIndex === secondStartIndex && first.start.offset <= second.start.offset);
	const firstEndsLater = firstEndIndex > secondEndIndex || (firstEndIndex === secondEndIndex && first.end.offset >= second.end.offset);
	const start = firstStartsEarlier ? first.start : second.start;
	const end = firstEndsLater ? first.end : second.end;
	const merged = ReconstructSelection(work, {
		documentId: work.id,
		start: { ...start },
		end: { ...end },
		selectedText: "",
		locatorStart: null,
		locatorEnd: null
	});
	return merged;
}
