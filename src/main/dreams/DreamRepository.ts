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
	readonly dream: DreamRecord;
	// Absolute path to the persisted Markdown record.
	readonly filePath: string;
}

// Loads and saves serialized Dream records without applying domain decisions.
export class DreamRepository
{
	// Identifies the filesystem root read by this repository.
	private readonly libraryPath: string;

	// Creates persistence access scoped to one Dream library root.
	public constructor(libraryPath: string)
	{
		this.libraryPath = libraryPath;
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

		const loaded = [...records.values()];

		return loaded;
	}

	// Writes a record at the path chosen by the owning DreamLibrary.
	public async SaveAsync(record: DreamPersistenceRecord, previousFilePath: string | null = null): Promise<void>
	{
		const content = SerializeDreamMarkdown(record.dream);

		await this.WriteAsync(record.filePath, content);
		if (previousFilePath !== null && !this.AreSamePath(previousFilePath, record.filePath))
		{
			try
			{
				await unlink(previousFilePath);
			}
			catch (error)
			{
				const code = this.GetErrorCode(error);

				if (code !== "ENOENT")
				{
					await this.RollBackMovedSaveAsync(record.filePath);
					throw error;
				}
			}
		}
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

	// Recursively finds Markdown records beneath one Dream library directory.
	private async ListMarkdownPathsAsync(directory: string): Promise<string[]>
	{
		let entries: Dirent<string>[] = [];

		try
		{
			entries = await readdir(directory, { withFileTypes: true });
		}
		catch (error)
		{
			const code = this.GetErrorCode(error);

			if (code !== "ENOENT")
			{
				Errors.Error("DreamRepository", "Unable to read the Dream library.", error);
			}
		}

		const paths: string[] = [];

		for (const entry of entries)
		{
			const entryPath = path.join(directory, entry.name);

			if (entry.isDirectory())
			{
				const childPaths = await this.ListMarkdownPathsAsync(entryPath);
				paths.push(...childPaths);
			}
			else
			{
				const normalizedName = entry.name.toLocaleLowerCase();
				const isMarkdown = normalizedName.endsWith(".md");

				if (entry.isFile() && isMarkdown)
				{
					paths.push(entryPath);
				}
			}
		}

		return paths;
	}

	// Writes one Dream atomically through a temporary sibling file.
	private async WriteAsync(filePath: string, content: string): Promise<void>
	{
		const directoryPath = path.dirname(filePath);
		const temporaryPath = `${filePath}.tmp`;
		await mkdir(directoryPath, { recursive: true });
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, filePath);
	}

	// Compares two filesystem paths using platform-appropriate casing.
	private AreSamePath(first: string, second: string): boolean
	{
		const firstPath = path.resolve(first);
		const secondPath = path.resolve(second);
		let isSame = firstPath === secondPath;

		if (process.platform === "win32")
		{
			const normalizedFirst = firstPath.toLocaleLowerCase();
			const normalizedSecond = secondPath.toLocaleLowerCase();
			isSame = normalizedFirst === normalizedSecond;
		}

		return isSame;
	}

	// Removes a replacement file when the original Dream filename could not be retired.
	private async RollBackMovedSaveAsync(filePath: string): Promise<void>
	{
		try
		{
			await unlink(filePath);
		}
		catch (error)
		{
			Errors.Error("DreamRepository", `Unable to roll back renamed Dream file: ${filePath}`, error);
		}
	}

	// Extracts a Node filesystem error code without hiding the original failure.
	private GetErrorCode(error: unknown): string
	{
		let code = "";

		if (error instanceof Error && "code" in error)
		{
			const nodeError = error as NodeJS.ErrnoException;
			code = nodeError.code ?? "";
		}

		return code;
	}
}
