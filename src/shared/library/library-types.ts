export interface SourceLocator {
	scheme: string;
	value: string;
}

export interface TextDivision {
	kind: string;
	value: string;
}

export interface LibraryManifest {
	id: string;
	title: string;
	author: string;
	language: string;
	sourceRepository: string;
	sourceCommit: string;
	license: string;
	works: LibraryTextSummary[];
}

export type LibrarySourceKind = "bundled" | "external";

export interface LibraryTextSummary {
	id: string;
	urn: string | null;
	title: string;
	titleGreek: string | null;
	author: string;
	language: string;
	editor: string | null;
	fileName: string;
}

export interface LibraryText {
	id: string;
	urn: string | null;
	title: string;
	titleGreek: string | null;
	author: string;
	language: string;
	edition: {
		editor: string | null;
		title: string | null;
		volume: string | null;
		publisher: string | null;
		publicationPlace: string | null;
		publicationDate: string | null;
	};
	provenance: {
		sourceKind?: LibrarySourceKind;
		repository: string;
		commit: string;
		sourceFile: string;
		license: string;
		externalFilePath?: string | null;
	};
	segments: TextSegment[];
}

export interface TextSegment {
	key: string;
	locator: SourceLocator | null;
	division?: TextDivision | null;
	speaker: string | null;
	text: string;
	blockKind: "speech" | "narration" | "heading" | "other";
}

export interface SourceNotice {
	source: string;
	editor: string | null;
	editionTitle: string | null;
	repository: string;
	license: string;
}
