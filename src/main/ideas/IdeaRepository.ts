import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IdeaRecord } from "../../shared/ideas/IdeaTypes.js";
import { IdeaMarkdownCodec } from "./IdeaMarkdownCodec.js";

// Owns canonical Idea Markdown paths and serialized filesystem access.
export class IdeaRepository
{
	// Maps Idea identities to their authoritative persisted paths.
	private readonly origins = new Map<string, string>();

	// Creates an Idea repository rooted inside the reader-owned Chora directory.
	public constructor(
		private readonly rootPath: string,
		private readonly codec: IdeaMarkdownCodec)
	{
	}

	// Loads every persisted Idea and records its authoritative origin.
	public async LoadAsync(): Promise<IdeaRecord[]>
	{
		const records: IdeaRecord[] = [];
		const workEntries = await this.ReadDirectoriesAsync(this.rootPath);

		for (const workEntry of workEntries)
		{
			if (workEntry.isDirectory())
			{
				const ideasPath = path.join(this.rootPath, workEntry.name, "Ideas");
				const ideaEntries = await this.ReadDirectoriesAsync(ideasPath);

				for (const ideaEntry of ideaEntries)
				{
					const normalizedName = ideaEntry.name.toLocaleLowerCase();
					const isMarkdown = normalizedName.endsWith(".md");

					if (ideaEntry.isFile() && isMarkdown)
					{
						const filePath = path.join(ideasPath, ideaEntry.name);
						const content = await readFile(filePath, "utf8");
						const record = this.codec.Parse(content);
						const hasOrigin = this.origins.has(record.id);

						if (hasOrigin)
						{
							throw new Error(`Duplicate persisted Idea identifier: ${record.id}`);
						}

						this.origins.set(record.id, filePath);
						records.push(record);
					}
				}
			}
		}

		return records;
	}

	// Saves one Idea at its canonical path and removes a superseded filename.
	public async SaveAsync(record: IdeaRecord): Promise<void>
	{
		const previousPath = this.origins.get(record.id) ?? null;
		const filePath = this.CreatePath(record);
		const content = this.codec.Serialize(record);
		await this.WriteAsync(filePath, content);

		if (previousPath !== null && !this.AreSamePath(previousPath, filePath))
		{
			try
			{
				await unlink(previousPath);
			}
			catch (error)
			{
				const errorCode = this.GetErrorCode(error);

				if (errorCode !== "ENOENT")
				{
					await this.RemoveReplacementAsync(filePath);
					throw error;
				}
			}
		}

		this.origins.set(record.id, filePath);
	}

	// Deletes one Idea from its authoritative persisted origin.
	public async DeleteAsync(ideaId: string): Promise<void>
	{
		const filePath = this.origins.get(ideaId);

		if (filePath === undefined)
		{
			throw new Error(`Idea persistence is missing for ${ideaId}`);
		}

		await unlink(filePath);
		this.origins.delete(ideaId);
	}

	// Reads a directory or treats a missing directory as empty.
	private async ReadDirectoriesAsync(directoryPath: string): Promise<Dirent<string>[]>
	{
		let entries: Dirent<string>[] = [];

		try
		{
			entries = await readdir(directoryPath, { withFileTypes: true });
		}
		catch (error)
		{
			const errorCode = this.GetErrorCode(error);

			if (errorCode !== "ENOENT")
			{
				throw error;
			}
		}

		return entries;
	}

	// Creates and validates the canonical Markdown path for one Idea.
	private CreatePath(record: IdeaRecord): string
	{
		const lowercaseTitle = record.title.toLocaleLowerCase();
		const normalizedTitle = lowercaseTitle.normalize("NFKD");
		const separatedTitle = normalizedTitle.replace(/[^\p{L}\p{N}]+/gu, "-");
		const trimmedTitle = separatedTitle.replace(/^-+|-+$/gu, "");
		const slug = trimmedTitle.slice(0, 64) || "idea";
		const fileName = `${slug}--${record.id}.md`;
		const filePath = path.resolve(this.rootPath, record.workId, "Ideas", fileName);
		this.AssertInsideRoot(filePath);

		return filePath;
	}

	// Proves that a canonical Idea path remains inside the repository root.
	private AssertInsideRoot(filePath: string): void
	{
		const rootPath = path.resolve(this.rootPath);
		const relativePath = path.relative(rootPath, filePath);
		const escapesByTraversal = relativePath.startsWith(`..${path.sep}`);
		const isOutsideRoot = relativePath.length === 0 || escapesByTraversal || path.isAbsolute(relativePath);

		if (isOutsideRoot)
		{
			throw new Error("Idea persistence path is outside the library root");
		}
	}

	// Writes one Idea atomically through a temporary sibling file.
	private async WriteAsync(filePath: string, content: string): Promise<void>
	{
		const directoryPath = path.dirname(filePath);
		const temporaryPath = `${filePath}.tmp`;
		await mkdir(directoryPath, { recursive: true });
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, filePath);
	}

	// Compares two filesystem paths using platform-appropriate casing rules.
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

	// Extracts a Node filesystem error code without hiding the original failure.
	private GetErrorCode(error: unknown): string
	{
		let errorCode = "";

		if (error instanceof Error && "code" in error)
		{
			const nodeError = error as NodeJS.ErrnoException;
			errorCode = nodeError.code ?? "";
		}

		return errorCode;
	}

	// Removes a replacement file when the previous origin could not be retired.
	private async RemoveReplacementAsync(filePath: string): Promise<void>
	{
		try
		{
			await unlink(filePath);
		}
		catch (error)
		{
			const errorCode = this.GetErrorCode(error);

			if (errorCode !== "ENOENT")
			{
				throw error;
			}
		}
	}
}
