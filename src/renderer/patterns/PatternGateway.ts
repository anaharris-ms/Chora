import type { PatternRecord } from "./PatternTypes.js";

// Retrieves read-only pattern records through Chora's preload API.
export class PatternGateway
{
	// Loads patterns belonging to one reader text.
	public ListAsync(documentId: string): Promise<PatternRecord[]>
	{
		return window.chora.ListPatterns(documentId);
	}
}