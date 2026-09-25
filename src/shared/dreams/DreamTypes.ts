import type { TextSelection } from "../library/SelectionTypes.js";
import type { TextDivision } from "../library/LibraryTypes.js";

// A passage the reader has connected to a Resonance, located the same way a Signal locates its own passage.
export interface ResonanceTarget
{
	id: string;
	workId: string;
	selection: TextSelection;
}

// A model-proposed passage awaiting the reader's explicit acceptance or dismissal. Never created automatically.
export interface ResonanceCandidate
{
	id: string;
	target: ResonanceTarget;
	rationale: string;
	createdAt: string;
}

// A reader-authored connection from a signal to another passage. Useful with or without an attached target.
export interface DreamResonance
{
	id: string;
	note: string;
	targets: ResonanceTarget[];
	candidates: ResonanceCandidate[];
	createdAt: string;
	updatedAt: string;
}

export interface DreamSignal
{
	id: string;
	sourceRef: string;
	selection: TextSelection;
	text: string;
	description: string;
	resonances: DreamResonance[];
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
