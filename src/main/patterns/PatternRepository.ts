import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";
import type { PatternRecord } from "../../shared/patterns/PatternTypes.js";

// Versioned Hermeneia export loaded by this repository.
interface ConsumerPatternExport
{
	schemaVersion: 1;
	text: { id: string };
	sections: readonly ConsumerSection[];
}

// One source section and its consumer-visible patterns.
interface ConsumerSection
{
	id: string;
	title: string;
	patterns: readonly ConsumerPattern[];
}

// One externally supplied Hermeneia pattern.
interface ConsumerPattern
{
	id: string;
	elements: readonly ConsumerPatternElement[];
	observation: string;
}

// One textual evidence item supplied by Hermeneia.
interface ConsumerPatternElement
{
	form: string;
	location: string | null;
}

// One validated export retained by this repository until its source changes.
interface ValidatedExportCacheEntry
{
	// Trusted v1 export document validated from the source file.
	exportDocument: ConsumerPatternExport;
}

// Loads and validates read-only Hermeneia Pattern Export v1 files.
export class PatternRepository
{
	// Environment variable naming the directory containing Hermeneia works.
	private static readonly ExportRootVariable = "HERMENEIA_EXPORT_ROOT";
	// Filename suffix used by supported Hermeneia consumer exports.
	private static readonly ExportFilePattern = /-patterns-chapter-\d+\.v1\.json$/u;
	// Repository-owned validated exports keyed by their absolute source path.
	private readonly validatedExports = new Map<string, ValidatedExportCacheEntry>();

	// Creates a repository with an empty cache scoped to this instance.
	public constructor()
	{
	}

	// Discards validated exports after an external caller changes the export tree.
	public InvalidateExportCache(): void
	{
		this.validatedExports.clear();
	}

	// Returns Chora records for one loaded Library text.
	public async GetForTextAsync(text: LibraryText): Promise<PatternRecord[]>
	{
		const exportRoot = process.env[PatternRepository.ExportRootVariable];
		const patterns: PatternRecord[] = [];

		if (exportRoot !== undefined && exportRoot.length > 0 && text.urn !== null)
		{
			const exportPaths = await this.ListExportPathsAsync(exportRoot);

			for (const exportPath of exportPaths)
			{
				const exportDocument = await this.LoadExportAsync(exportPath);

				if (exportDocument.text.id === text.urn)
				{
					const exportPatterns = this.CreatePatternRecords(text.id, exportDocument);
					patterns.push(...exportPatterns);
				}
			}
		}

		return patterns;
	}

	// Discovers versioned consumer exports under the configured Hermeneia works root.
	private async ListExportPathsAsync(directory: string): Promise<string[]>
	{
		const entries = await fs.readdir(directory, { withFileTypes: true });
		const paths: string[] = [];

		for (const entry of entries)
		{
			const entryPath = path.join(directory, entry.name);

			if (entry.isDirectory())
			{
				const childPaths = await this.ListExportPathsAsync(entryPath);
				paths.push(...childPaths);
			}
			else if (entry.isFile() && PatternRepository.ExportFilePattern.test(entry.name))
			{
				paths.push(entryPath);
			}
		}

		paths.sort();

		return paths;
	}

	// Reads and validates one Hermeneia consumer export before its records cross the IPC boundary.
	private async LoadExportAsync(exportPath: string): Promise<ConsumerPatternExport>
	{
		const cached = this.validatedExports.get(exportPath);
		let exportDocument: ConsumerPatternExport;

		if (cached !== undefined)
		{
			exportDocument = structuredClone(cached.exportDocument);
		}
		else
		{
			const content = await fs.readFile(exportPath, "utf8");
			const value = this.ParseExport(content, exportPath);
			exportDocument = this.ValidateExport(value, exportPath);
			const entry: ValidatedExportCacheEntry = {
				exportDocument: structuredClone(exportDocument)
			};
			this.validatedExports.set(exportPath, entry);
		}

		return exportDocument;
	}

	// Parses external JSON while preserving one stable contract failure for malformed content.
	private ParseExport(content: string, exportPath: string): unknown
	{
		let value: unknown;

		try
		{
			value = JSON.parse(content) as unknown;
		}
		catch
		{
			throw new Error(`Invalid Hermeneia Pattern Export v1: ${exportPath}`);
		}

		return value;
	}

	// Converts one trusted consumer export into reader-navigable locator occurrences.
	private CreatePatternRecords(documentId: string, exportDocument: ConsumerPatternExport): PatternRecord[]
	{
		const records: PatternRecord[] = [];

		for (const section of exportDocument.sections)
		{
			for (const pattern of section.patterns)
			{
				const forms: string[] = [];
				const locators = new Set<string>();

				for (const element of pattern.elements)
				{
					forms.push(element.form);

					if (element.location !== null)
					{
						locators.add(element.location);
					}
				}

				for (const locator of locators)
				{
					const record: PatternRecord = {
						id: `${pattern.id}:${locator}`,
						documentId,
						title: section.title,
						forms,
						observation: pattern.observation,
						locator
					};
					records.push(record);
				}
			}
		}

		return records;
	}

	// Ensures an external JSON document implements the supported contract revision.
	private ValidateExport(value: unknown, exportPath: string): ConsumerPatternExport
	{
		const document = value as Partial<ConsumerPatternExport>;
		let hasValidSections = false;

		if (Array.isArray(document.sections))
		{
			hasValidSections = true;

			for (const section of document.sections)
			{
				if (!this.IsSection(section))
				{
					hasValidSections = false;
				}
			}
		}

		const isValid = document.schemaVersion === 1
			&& typeof document.text?.id === "string"
			&& hasValidSections;

		if (!isValid)
		{
			throw new Error(`Invalid Hermeneia Pattern Export v1: ${exportPath}`);
		}

		return document as ConsumerPatternExport;
	}

	// Checks one section record supplied by the external contract.
	private IsSection(value: unknown): value is ConsumerSection
	{
		const section = value as Partial<ConsumerSection>;
		let hasValidPatterns = false;

		if (Array.isArray(section.patterns))
		{
			hasValidPatterns = true;

			for (const pattern of section.patterns)
			{
				if (!this.IsPattern(pattern))
				{
					hasValidPatterns = false;
				}
			}
		}

		const isValid = typeof section.id === "string"
			&& typeof section.title === "string"
			&& hasValidPatterns;

		return isValid;
	}

	// Checks one pattern record supplied by the external contract.
	private IsPattern(value: unknown): value is ConsumerPattern
	{
		const pattern = value as Partial<ConsumerPattern>;
		let hasValidElements = false;

		if (Array.isArray(pattern.elements))
		{
			hasValidElements = true;

			for (const element of pattern.elements)
			{
				if (!this.IsPatternElement(element))
				{
					hasValidElements = false;
				}
			}
		}

		const isValid = typeof pattern.id === "string"
			&& typeof pattern.observation === "string"
			&& hasValidElements;

		return isValid;
	}

	// Checks one textual evidence item supplied by the external contract.
	private IsPatternElement(value: unknown): value is ConsumerPatternElement
	{
		const element = value as Partial<ConsumerPatternElement>;
		const isValid = typeof element.form === "string"
			&& (typeof element.location === "string" || element.location === null);

		return isValid;
	}
}