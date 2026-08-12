import type { PatternRecord } from "../../shared/patterns/PatternTypes.js";
import { LibraryService } from "../library/LibraryService.js";
import { PatternRepository } from "./PatternRepository.js";

// Coordinates Chora text identity with Hermeneia's read-only pattern export.
export class PatternService
{
	// Creates the service with its authoritative Library and external pattern sources.
	public constructor(private readonly library: LibraryService, private readonly repository: PatternRepository)
	{
	}

	// Loads the patterns whose canonical Hermeneia text identity matches one Chora work.
	public async GetAsync(textId: string): Promise<PatternRecord[]>
	{
		const text = await this.library.GetAsync(textId);
		const patterns = await this.repository.GetForTextAsync(text);

		return patterns;
	}
}