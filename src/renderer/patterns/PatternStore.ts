import type { PatternRecord } from "./PatternTypes.js";

// Owns the renderer state for the fixture-backed Patterns feature.
export class PatternStore
{
	// Available pattern records for the current prototype scope.
	private patterns: readonly PatternRecord[] = [];
	// Pattern selected by the reader, if any.
	private selectedPatternId: string | null = null;
	// Canonical identifier of the text currently open in the reader.
	private documentId: string | null = null;
	// Current reader locator used to constrain the default view.
	private focusedLocator: string | null = null;
	// Whether the panel should show all patterns rather than only the active location.
	private showAllPatterns = false;

	// Replaces the available records and selects the first one when possible.
	public SetPatterns(patterns: readonly PatternRecord[]): void
	{
		this.patterns = structuredClone(patterns);
		const visiblePatterns = this.GetPatterns();
		this.selectedPatternId = visiblePatterns[0]?.id ?? null;
	}

	// Records the text currently open in the reader and reconciles its selection.
	public SetDocumentId(documentId: string | null): void
	{
		this.documentId = documentId;
		this.ReconcileSelectedPattern();
	}

	// Returns all available records.
	public GetPatterns(): readonly PatternRecord[]
	{
		const documentPatterns = this.patterns.filter((pattern) => pattern.documentId === this.documentId);
		const patterns = this.showAllPatterns || this.focusedLocator === null
			? documentPatterns
			: documentPatterns.filter((pattern) => pattern.locator === this.focusedLocator);

		return structuredClone(patterns);
	}

	// Records the locator currently centered in the reader.
	public SetFocusedLocator(locator: string | null): void
	{
		this.focusedLocator = locator;
		this.ReconcileSelectedPattern();
	}

	// Selects whether the panel follows the reader or shows the complete section.
	public SetShowAllPatterns(showAllPatterns: boolean): void
	{
		this.showAllPatterns = showAllPatterns;
		this.ReconcileSelectedPattern();
	}

	// Returns whether the panel is showing all mock records.
	public GetShowAllPatterns(): boolean
	{
		return this.showAllPatterns;
	}

	// Returns the locator currently represented by the focused view.
	public GetFocusedLocator(): string | null
	{
		return this.focusedLocator;
	}

	// Returns the selected record, if one exists.
	public GetSelectedPattern(): PatternRecord | null
	{
		const patterns = this.GetPatterns();
		const pattern = patterns.find((candidate) => candidate.id === this.selectedPatternId) ?? null;

		return structuredClone(pattern);
	}

	// Selects a record that belongs to the current list.
	public SelectPattern(id: string): void
	{
		const patterns = this.GetPatterns();
		const exists = patterns.some((pattern) => pattern.id === id);

		if (exists)
		{
			this.selectedPatternId = id;
		}
	}

	// Ensures selection always belongs to the active text and pattern scope.
	private ReconcileSelectedPattern(): void
	{
		const patterns = this.GetPatterns();
		const hasSelection = patterns.some((pattern) => pattern.id === this.selectedPatternId);

		if (!hasSelection)
		{
			this.selectedPatternId = patterns[0]?.id ?? null;
		}
	}
}