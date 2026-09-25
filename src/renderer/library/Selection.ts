import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";

// Returns the nearest ancestor segment element of a selection endpoint node, or null when outside a segment.
function GetSegmentElement(node: Node | null): HTMLElement | null
{
	const element = node instanceof Element ? node : node?.parentElement ?? null;
	const segmentElement = element?.closest<HTMLElement>("[data-segment-key]") ?? null;

	return segmentElement;
}

// Returns the segment's text element when it contains the given selection endpoint node.
function GetSegmentTextElement(segment: HTMLElement, node: Node): HTMLElement | null
{
	const textElement = segment.querySelector<HTMLElement>(".segment-text");
	let result: HTMLElement | null = null;

	if (textElement !== null && textElement.contains(node)) result = textElement;

	return result;
}

// Returns the character offset within a segment's text element up to a selection boundary.
function GetTextOffset(element: HTMLElement, container: Node, offset: number): number
{
	const range = document.createRange();
	range.selectNodeContents(element);
	range.setEnd(container, offset);
	const textOffset = range.toString().length;

	return textOffset;
}

// Captures the reader's current browser selection as a canonical TextSelection, or null when there is none.
export function CaptureSelection(work: LibraryText): TextSelection | null
{
	const selection = window.getSelection();
	let result: TextSelection | null = null;

	if (selection && selection.rangeCount > 0 && !selection.isCollapsed)
	{
		const range = selection.getRangeAt(0);
		const startSegment = GetSegmentElement(range.startContainer);
		const endSegment = GetSegmentElement(range.endContainer);

		if (startSegment && endSegment)
		{
			const startText = GetSegmentTextElement(startSegment, range.startContainer);
			const endText = GetSegmentTextElement(endSegment, range.endContainer);

			if (startText !== null && endText !== null)
			{
				const startKey = startSegment.dataset.segmentKey ?? "";
				const endKey = endSegment.dataset.segmentKey ?? "";
				const selectedText = selection.toString();
				const locatorStart = work.segments.find((item) => item.key === startKey)?.locator ?? null;
				const locatorEnd = work.segments.find((item) => item.key === endKey)?.locator ?? null;
				result = {
					documentId: work.id,
					start: { segmentKey: startKey, offset: GetTextOffset(startText, range.startContainer, range.startOffset) },
					end: { segmentKey: endKey, offset: GetTextOffset(endText, range.endContainer, range.endOffset) },
					selectedText,
					locatorStart,
					locatorEnd
				};
			}
		}
	}

	return result;
}

// Clears the browser's native selection ranges.
export function ClearBrowserSelection(): void
{
	const selection = window.getSelection();

	if (selection) selection.removeAllRanges();
}
