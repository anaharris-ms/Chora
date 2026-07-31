import type { ChatContext } from "../../shared/chat/chat-types.js";
import type { TextSelection } from "../../shared/library/selection-types.js";
import type { LibraryText } from "../../shared/library/library-types.js";
import { ReconstructSelection, ValidateSelectionText } from "../library/selection-service.js";

export function ResolveChatContext(work: LibraryText, context: Exclude<ChatContext, { mode: "FREE" }>): ChatContext
{
	const selection: TextSelection = {
		documentId: context.documentId,
		start: context.start,
		end: context.end,
		selectedText: context.sourcePassage,
		locatorStart: context.locator,
		locatorEnd: null
	};

	ValidateSelectionText(work, selection);
	const canonicalSelection = ReconstructSelection(work, selection);
	const startIndex = work.segments.findIndex((segment) => segment.key === canonicalSelection.start.segmentKey);
	const endIndex = work.segments.findIndex((segment) => segment.key === canonicalSelection.end.segmentKey);
	const contextBefore = startIndex > 0 ? work.segments[startIndex - 1]?.text ?? "" : "";
	const contextAfter = endIndex >= 0 && endIndex < work.segments.length - 1 ? work.segments[endIndex + 1]?.text ?? "" : "";
	const resolved: ChatContext = {
		...context,
		sourcePassage: canonicalSelection.selectedText,
		contextBefore,
		contextAfter,
		locator: canonicalSelection.locatorStart,
		start: canonicalSelection.start,
		end: canonicalSelection.end
	};

	return resolved;
}
