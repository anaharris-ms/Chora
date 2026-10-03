import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dream as DreamRecord } from "../../shared/dreams/DreamTypes.js";
import { Errors } from "../diagnostics/MainErrorManager.js";
import { ParseDreamMarkdown, SerializeDreamMarkdown } from "./DreamMarkdownCodec.js";

// A parsed Dream record together with its persistence path.
export interface DreamPersistenceRecord
{
	// Serialized Dream data owned by the Dream aggregate.
	dream: DreamRecord;
	// Absolute path to the persisted Markdown record.
	filePath: string;
}

// Loads and saves serialized Dream records without applying domain decisions.
export class DreamRepository
{
	// Creates persistence access scoped to one Dream library root.
	public constructor(private readonly libraryPath: string)
	{
	}

	// Loads persisted records for the Dream library.
	public async LoadAsync(): Promise<DreamPersistenceRecord[]>
	{
		const records = new Map<string, DreamPersistenceRecord>();
		const paths = await this.ListMarkdownPathsAsync(this.libraryPath);

		for (const filePath of paths)
		{
			await this.LoadPathAsync(filePath, records);
		}

		return [...records.values()];
	}

	// Writes a record at the path chosen by the owning DreamLibrary.
	public async SaveAsync(record: DreamPersistenceRecord): Promise<void>
	{
		const content = SerializeDreamMarkdown(record.dream);

		await this.WriteAsync(record.filePath, content);
	}

	// Removes the specified primary persistence record.
	public async DeleteAsync(record: DreamPersistenceRecord): Promise<void>
	{
		await unlink(record.filePath);
	}

	// Reads and parses one Markdown file into a persistence record.
	private async LoadPathAsync(filePath: string, records: Map<string, DreamPersistenceRecord>): Promise<void>
	{
		try
		{
			const content = await readFile(filePath, "utf8");
			const dream = ParseDreamMarkdown(content);
			const hasDream = dream !== null;
			const isNew = hasDream && !records.has(dream.id);

			if (isNew && dream !== null)
			{
				const record: DreamPersistenceRecord = { dream, filePath };
				records.set(dream.id, record);
			}
		}
		catch (error)
		{
			Errors.Error("DreamRepository", `Unable to read Dream Markdown file: ${filePath}`, error);
		}
	}

	private async ListMarkdownPathsAsync(directory: string): Promise<string[]>
	{
		let entries: Dirent<string>[] = [];
		try
		{
			entries = await readdir(directory, { withFileTypes: true });
		}
		catch (error)
		{
			const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : "";
			if (code !== "ENOENT") Errors.Error("DreamRepository", "Unable to read the Dream library.", error);
		}
		const paths: string[] = [];
		for (const entry of entries)
		{
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) paths.push(...await this.ListMarkdownPathsAsync(entryPath));
			else if (entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".md")) paths.push(entryPath);
		}
		return paths;
	}

	private async WriteAsync(filePath: string, content: string): Promise<void>
	{
		await mkdir(path.dirname(filePath), { recursive: true });
		const temporaryPath = `${filePath}.tmp`;
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, filePath);
	}
}
