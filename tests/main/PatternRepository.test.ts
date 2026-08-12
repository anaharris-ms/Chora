import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PatternRepository } from "../../src/main/patterns/PatternRepository.js";
import type { LibraryText } from "../../src/shared/library/LibraryTypes.js";

// Library text whose URN is shared with the Hermeneia export fixture.
const republic = { id: "republic", urn: "urn:cts:greekLit:tlg0059.tlg030.perseus-grc2" } as LibraryText;
// Temporary configured Hermeneia export roots created by these tests.
const directories: string[] = [];

// Creates a temporary export root containing the supplied external contract document.
async function CreateExportRootAsync(exportDocument: unknown): Promise<string>
{
	const directory = await mkdtemp(path.join(os.tmpdir(), "chora-patterns-"));
	const sectionsPath = path.join(directory, "Plato", "The Republic", "sections");
	const exportPath = path.join(sectionsPath, "republic-patterns-chapter-01.v1.json");

	directories.push(directory);
	await mkdir(sectionsPath, { recursive: true });
	await writeFile(exportPath, JSON.stringify(exportDocument), "utf8");

	return directory;
}

// Creates the smallest valid Hermeneia v1 export needed by the repository tests.
function CreateExport(title: string = "A section"): unknown
{
	const exportDocument = {
		schemaVersion: 1,
		text: { id: "urn:cts:greekLit:tlg0059.tlg030.perseus-grc2" },
		sections: [
			{
				id: "republic-book-01-section-01",
				title,
				patterns: [
					{
						id: "republic-book-01-section-01:p001",
						observation: "A recurrence.",
						elements: [
							{ form: "λόγος", location: "353b" },
							{ form: "λέγει", location: "353c" },
							{ form: "λέγει", location: null }
						]
					}
				]
			}
		]
	};

	return exportDocument;
}

describe("PatternRepository", function PatternRepositoryTests()
{
	afterEach(async function RemoveTestDirectoriesAsync()
	{
		for (const directory of directories.splice(0))
		{
			await rm(directory, { recursive: true, force: true });
		}

		delete process.env.HERMENEIA_EXPORT_ROOT;
	});

	it("resolves an export through the Library text URN and expands distinct locators", async function LoadsHermeneiaPatternsAsync()
	{
		const exportRoot = await CreateExportRootAsync(CreateExport());
		process.env.HERMENEIA_EXPORT_ROOT = exportRoot;
		const repository = new PatternRepository();

		const patterns = await repository.GetForTextAsync(republic);

		expect(patterns).toEqual([
			{
				id: "republic-book-01-section-01:p001:353b",
				documentId: "republic",
				title: "A section",
				forms: ["λόγος", "λέγει", "λέγει"],
				observation: "A recurrence.",
				locator: "353b"
			},
			{
				id: "republic-book-01-section-01:p001:353c",
				documentId: "republic",
				title: "A section",
				forms: ["λόγος", "λέγει", "λέγει"],
				observation: "A recurrence.",
				locator: "353c"
			}
		]);
	});

	it("rejects an unsupported or malformed external contract", async function RejectsInvalidExportAsync()
	{
		const exportRoot = await CreateExportRootAsync({ schemaVersion: 2, text: {}, sections: [] });
		process.env.HERMENEIA_EXPORT_ROOT = exportRoot;
		const repository = new PatternRepository();

		const load = repository.GetForTextAsync(republic);

		await expect(load).rejects.toThrow("Invalid Hermeneia Pattern Export v1");
	});

	it("caches validated exports until its cache is explicitly invalidated", async function CachesValidatedExportsAsync()
	{
		const exportRoot = await CreateExportRootAsync(CreateExport());
		process.env.HERMENEIA_EXPORT_ROOT = exportRoot;
		const repository = new PatternRepository();
		const exportPath = path.join(exportRoot, "Plato", "The Republic", "sections", "republic-patterns-chapter-01.v1.json");
		const originalContent = JSON.stringify(CreateExport());
		const invalidContent = "x".repeat(originalContent.length);

		const initial = await repository.GetForTextAsync(republic);
		await writeFile(exportPath, invalidContent, "utf8");
		const cached = await repository.GetForTextAsync(republic);
		expect(cached).toEqual(initial);

		repository.InvalidateExportCache();
		const invalidLoad = repository.GetForTextAsync(republic);
		await expect(invalidLoad).rejects.toThrow("Invalid Hermeneia Pattern Export v1");

		const updatedExport = CreateExport("A changed section");
		const content = JSON.stringify(updatedExport);
		await writeFile(exportPath, content, "utf8");
		const refreshed = await repository.GetForTextAsync(republic);
		expect(refreshed[0]?.title).toBe("A changed section");
	});
});