// One read-only textual pattern occurrence available to the Chora reader.
export interface PatternRecord
{
	// Stable identity of this pattern occurrence.
	readonly id: string;
	// Canonical identifier of the Chora text containing the evidence.
	readonly documentId: string;
	// Reader-facing label identifying the owning source section.
	readonly title: string;
	// Exact textual forms noticed by the pattern scan.
	readonly forms: readonly string[];
	// Short pre-interpretive description of the recurrence.
	readonly observation: string;
	// Canonical source locator used to focus the reader.
	readonly locator: string;
}