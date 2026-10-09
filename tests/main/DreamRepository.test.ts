import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Dream } from "../../src/main/dreams/Dream.js";
import { DreamLibrary } from "../../src/main/dreams/DreamLibrary.js";
import { ParseDreamMarkdown, SerializeDreamMarkdown } from "../../src/main/dreams/DreamMarkdownCodec.js";
import { DreamRepository, type DreamPersistenceRecord } from "../../src/main/dreams/DreamRepository.js";
import type { Dream as DreamRecord } from "../../src/shared/dreams/DreamTypes.js";

const GreekPassage = "Κατέβην χθὲς εἰς Πειραιᾶ";
const directories: string[] = [];

function CreateDream(id: string, title: string): DreamRecord
{
	return {
		id,
		workId: "republic",
		dialogue: "Republic",
		title,
		source: {
			documentId: "republic",
			start: { segmentKey: "s1", offset: 0 },
			end: { segmentKey: "s2", offset: 9 },
			selectedText: GreekPassage,
			locatorStart: { scheme: "Stephanus", value: "327a" },
			locatorEnd: { scheme: "Stephanus", value: "327b" },
			sourceRefs: ["s1", "s2"],
			startSourceRef: "s1",
			endSourceRef: "s2"
		},
		signals: [],
		reflection: "",
		linkedDreamIds: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z"
	};
}

async function CreateLibraryAsync(): Promise<DreamLibrary>
{
	const directory = await mkdtemp(path.join(os.tmpdir(), "chora-dream-"));
	directories.push(directory);
	const repository = new DreamRepository(directory);
	const library = new DreamLibrary(directory, repository);

	return library;
}

describe("Dream library", function DreamLibraryTests()
{
	afterEach(async () =>
	{
		for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
	});

	it("saves a titleless Dream containing only exegesis", async () =>
	{
		const library = await CreateLibraryAsync();
		const dream = CreateDream("one", "   ");
		dream.reflection = "A descent toward another way of seeing.";
		await library.SaveAsync(dream);
		const records = await library.ListAsync();
		const directory = directories[0];
		if (directory === undefined) throw new Error("Test directory was not created.");
		const files = await readdir(path.join(directory, "republic"));

		expect(files[0]).toBe("dream--one.md");
		expect(records[0]?.title).toBe("");
		expect(records[0]?.signals).toEqual([]);
		expect(records[0]?.reflection).toBe(dream.reflection);
		expect(records[0]?.source.selectedText).toBe(GreekPassage);
	});

	it("round trips Greek polytonic text without changing code points", () =>
	{
		const dream = CreateDream("greek", "Πρόσοψις");
		dream.signals.push({ id: "signal", sourceRef: "s1", selection: dream.source, text: "χθὲς", description: "ἅμα — a simultaneous movement." });
		const parsed = ParseDreamMarkdown(SerializeDreamMarkdown(dream));

		expect(parsed).toEqual(dream);
	});

	it("rejects identifiers that could escape the primary Dream library", async () =>
	{
		const library = await CreateLibraryAsync();
		const unsafeIdDream = CreateDream("../outside", "Unsafe identifier");
		const unsafeWorkDream = CreateDream("safe", "Unsafe work");
		unsafeWorkDream.workId = "../outside";

		await expect(library.SaveAsync(unsafeIdDream)).rejects.toThrow("Dream identifier is invalid");
		await expect(library.SaveAsync(unsafeWorkDream)).rejects.toThrow("Dream work identifier is invalid");
	});

	it("writes readable Markdown in the work folder", async () =>
	{
		const library = await CreateLibraryAsync();
		await library.SaveAsync(CreateDream("one", "Descent"));
		const directory = directories[0];
		if (directory === undefined) throw new Error("Test directory was not created.");
		const content = await readFile(path.join(directory, "republic", "descent--one.md"), "utf8");

		expect(content).toContain("workId: republic");
		expect(content).toContain("# Descent");
		expect(content).toContain(GreekPassage);
	});

	it("renames the persisted file whenever the normalized title slug changes", async function RenamesPersistedFileAsync()
	{
		const library = await CreateLibraryAsync();
		const dream = CreateDream("one", "Original");
		await library.SaveAsync(dream);
		const directory = directories[0];
		if (directory === undefined)
		{
			throw new Error("Test directory was not created.");
		}

		const workPath = path.join(directory, "republic");

		dream.title = "Replacement";
		await library.SaveAsync(dream);
		const replacementFiles = await readdir(workPath);
		expect(replacementFiles).toEqual(["replacement--one.md"]);
		const replacementPath = path.join(workPath, "replacement--one.md");
		const replacementContent = await readFile(replacementPath, "utf8");
		expect(replacementContent).toContain("# Replacement");

		dream.title = "Replacement!";
		await library.SaveAsync(dream);
		const unchangedFiles = await readdir(workPath);
		expect(unchangedFiles).toEqual(["replacement--one.md"]);

		dream.title = "   ";
		await library.SaveAsync(dream);
		const untitledFiles = await readdir(workPath);
		expect(untitledFiles).toEqual(["dream--one.md"]);
	});

	it("preserves the existing file when writing the renamed file fails", async function PreservesExistingFileAsync()
	{
		const directory = await mkdtemp(path.join(os.tmpdir(), "chora-dream-rename-failure-"));
		directories.push(directory);
		const repository = new DreamRepository(directory);
		const original = CreateDream("one", "Original");
		const originalPath = path.join(directory, "republic", "original--one.md");
		await repository.SaveAsync({ dream: original, filePath: originalPath });
		const blockerPath = path.join(directory, "blocker");
		await writeFile(blockerPath, "not a directory", "utf8");
		const replacement = { ...original, title: "Replacement" };
		const replacementPath = path.join(blockerPath, "replacement--one.md");

		const failedSave = repository.SaveAsync({ dream: replacement, filePath: replacementPath }, originalPath);
		await expect(failedSave).rejects.toThrow();

		const originalContent = await readFile(originalPath, "utf8");
		expect(originalContent).toContain("# Original");
	});

	it("deletes only the Dream with the requested identifier", async () =>
	{
		const library = await CreateLibraryAsync();
		await library.SaveAsync(CreateDream("one", "First"));
		await library.SaveAsync(CreateDream("two", "Second"));

		await library.DeleteAsync("one");

		const remaining = await library.ListAsync();
		expect(remaining.map((dream) => dream.id)).toEqual(["two"]);
	});

	it("reloads persisted records on repeated loads", async function ReloadsRepositoryRecords()
	{
		const directory = await mkdtemp(path.join(os.tmpdir(), "chora-dream-reload-"));
		directories.push(directory);
		const repository = new DreamRepository(directory);
		const original = CreateDream("indexed", "Original");
		const filePath = path.join(directory, "republic", "original--indexed.md");
		const record: DreamPersistenceRecord = { dream: original, filePath };

		await repository.SaveAsync(record);
		const initial = await repository.LoadAsync();
		const replacement = { ...original, title: "Replacement" };
		const replacementContent = SerializeDreamMarkdown(replacement);
		await writeFile(filePath, replacementContent, "utf8");
		const reloaded = await repository.LoadAsync();

		expect(initial[0]?.dream.title).toBe("Original");
		expect(reloaded[0]?.dream.title).toBe("Replacement");
	});

	it("normalizes owned links and deduplicates hydrated signals", () =>
	{
		const record = CreateDream("one", "  Descent  ");
		record.linkedDreamIds = ["one", "two", "two", "  three  "];
		const signal = {
			id: "signal",
			sourceRef: "s1",
			selection: record.source,
			text: "χθὲς",
			description: "",
		};

		record.signals = [signal, signal];
		const dream = new Dream(record);
		const normalized = dream.ToRecord();

		expect(normalized.title).toBe("Descent");
		expect(normalized.linkedDreamIds).toEqual(["two", "three"]);
		expect(normalized.signals).toHaveLength(1);
	});
});
