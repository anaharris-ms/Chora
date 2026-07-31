import type { TextSelection } from "../library/selection-types.js";
import type { TextDivision } from "../library/library-types.js";

export interface DreamSignal
{
	id: string;
	sourceRef: string;
	selection: TextSelection;
	text: string;
	description: string;
}

export interface SourceSelection extends TextSelection
{
	sourceRefs: string[];
	startSourceRef: string;
	endSourceRef: string;
	division?: TextDivision | null;
	contextBefore?: string;
	contextAfter?: string;
}

export interface Dream
{
	id: string;
	workId: string;
	dialogue: string | null;
	title: string;
	source: SourceSelection;
	signals: DreamSignal[];
	reflection: string;
	linkedDreamIds: string[];
	createdAt: string;
	updatedAt: string;
}
