import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("electron", function MockElectron()
{
	return {
		app: {
			isPackaged: false,
			getAppPath(): string
			{
				const applicationPath = process.env.CHORA_LIBRARY_REPOSITORY_TEST_PATH ?? "";

				return applicationPath;
			}
		}
	};
});

import { LibraryRepository } from "../../src/main/library/LibraryRepository.js";

// Temporary application roots created by LibraryRepository tests.
const directories: string[] = [];

// Creates a generated Library manifest containing a single known text.
async function CreateRepositoryAsync(): Promise<LibraryRepository>
{
	const directory = await mkdtemp(path.join(os.tmpdir(), "chora-library-"));
	const generatedPath = path.join(directory, "corpus", "generated");
	const worksPath = path.join(generatedPath, "works");
	const manifestPath = path.join(generatedPath, "manifest.json");
	const textPath = path.join(worksPath, "republic.json");
	const manifest = { works: [{ id: "republic" }] };
	const text = { id: "republic" };

	directories.push(directory);
	process.env.CHORA_LIBRARY_REPOSITORY_TEST_PATH = directory;
	await mkdir(worksPath, { recursive: true });
	await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
	await writeFile(textPath, JSON.stringify(text), "utf8");

	const repository = new LibraryRepository();

	return repository;
}

describe("Library repository", function LibraryRepositoryTests()
{
	afterEach(async function RemoveTestDirectoriesAsync()
	{
		for (const directory of directories.splice(0))
		{
			await rm(directory, { recursive: true, force: true });
		}
		delete process.env.CHORA_LIBRARY_REPOSITORY_TEST_PATH;
	});

	it("rejects an identifier that is not listed in the generated manifest", async function RejectsUnknownTextIdAsync()
	{
		const repository = await CreateRepositoryAsync();
		const read = repository.GetAsync("../../../package");

		await expect(read).rejects.toThrow("No Library text matches ../../../package");
	});
});
