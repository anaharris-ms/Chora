import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dream } from "../../shared/dreams/dream-types.js";
import { Errors } from "../diagnostics/main-error-manager.js";
import { ParseDreamMarkdown, SerializeDreamMarkdown } from "./dream-markdown-codec.js";

interface StoredDream extends Dream
{
	filePath: string;
}

function CreateFileName(dream: Dream): string
{
	const slug = dream.title.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "dream";
	const fileName = `${slug}--${dream.id}.md`;
	return fileName;
}

export class DreamRepository
{
	public constructor(private readonly libraryPath: string, private readonly legacyLibraryPaths: readonly string[] = [])
	{
	}

	public async List(): Promise<Dream[]>
	{
		const storedDreams = await this.ListStoredAsync();
		const dreams = storedDreams.map(({ filePath: _filePath, ...dream }) => dream);
		return dreams;
	}

	public async Save(dream: Dream): Promise<Dream>
	{
		const existing = (await this.ListStoredAsync()).find((record) => record.id === dream.id);
		const saved: Dream = {
			...dream,
			title: dream.title.trim(),
			createdAt: existing?.createdAt ?? dream.createdAt,
			updatedAt: new Date().toISOString(),
			linkedDreamIds: Array.from(new Set(dream.linkedDreamIds.filter((id) => id !== dream.id)))
		};
		const filePath = existing?.filePath ?? path.join(this.libraryPath, saved.workId, CreateFileName(saved));
		await this.WriteAsync(filePath, SerializeDreamMarkdown(saved));
		return saved;
	}

	public async Delete(dreamId: string): Promise<void>
	{
		const existing = (await this.ListStoredAsync()).find((record) => record.id === dreamId);

		if (existing !== undefined)
		{
			await unlink(existing.filePath);
		}
	}

	private async ListStoredAsync(): Promise<StoredDream[]>
	{
		const records = new Map<string, StoredDream>();
		const roots = [this.libraryPath, ...this.legacyLibraryPaths];
		for (const root of roots)
		{
			for (const filePath of await this.ListMarkdownPathsAsync(root))
			{
				try
				{
					const content = await readFile(filePath, "utf8");
					const dream = ParseDreamMarkdown(content);
					if (dream !== null && !records.has(dream.id)) records.set(dream.id, { ...dream, filePath });
				}
				catch (error)
				{
					Errors.Error("DreamRepository", `Unable to read Dream Markdown file: ${filePath}`, error);
				}
			}
		}
		return [...records.values()];
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
