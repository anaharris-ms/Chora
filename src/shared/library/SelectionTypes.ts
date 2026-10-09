import type { SourceLocator } from "./LibraryTypes.js";

export interface TextSelection
{
	documentId: string;
	start: { segmentKey: string; offset: number };
	end: { segmentKey: string; offset: number };
	selectedText: string;
	locatorStart: SourceLocator | null;
	locatorEnd: SourceLocator | null;
}

export type SelectionAction = "copy" | "lookup" | "create-dream" | "add-to-dream" | "add-dream-signal" | "copy-dream-source" | "add-dream-source-signal" | null;
