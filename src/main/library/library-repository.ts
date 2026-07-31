import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryManifest, LibraryText, LibraryTextSummary } from "../../shared/library/library-types.js";
import { ResolveResourcePath } from "../bootstrap/resource-paths.js";

export class LibraryRepository
{
	private static readonly ManifestPath = path.join("corpus", "generated", "manifest.json");
	private static readonly TextsPath = path.join("corpus", "generated", "works");

	public async ListAsync(): Promise<LibraryTextSummary[]>
	{
		const manifest = await this.LoadManifestAsync();
		return manifest.works;
	}

	public async GetAsync(textId: string): Promise<LibraryText>
	{
		const textPath = ResolveResourcePath(LibraryRepository.TextsPath, `${textId}.json`);
		const content = await fs.readFile(textPath, "utf8");
		const text = JSON.parse(content) as LibraryText;
		return text;
	}

	private async LoadManifestAsync(): Promise<LibraryManifest>
	{
		const manifestPath = ResolveResourcePath(LibraryRepository.ManifestPath);
		const content = await fs.readFile(manifestPath, "utf8");
		const manifest = JSON.parse(content) as LibraryManifest;
		return manifest;
	}
}
