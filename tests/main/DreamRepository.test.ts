import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Dream } from "../../src/main/dreams/Dream.js";
import { DreamLibrary } from "../../src/main/dreams/DreamLibrary.js";
import { MigrateDream, ParseDreamMarkdown, SerializeDreamMarkdown } from "../../src/main/dreams/DreamMarkdownCodec.js";
import { DreamRepository, type DreamPersistenceRecord } from "../../src/main/dreams/DreamRepository.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";

const GreekPassage = "Κατέβην χθὲς εἰς Πειραιᾶ";
const directories: string[] = [];

function CreateDream(id: string, title: string): Dream
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

	it("migrates legacy reflection fields and link names", () =>
	{
		const dream = CreateDream("legacy", "Descent");
		const migrated = MigrateDream({ ...dream, reflection: "", seeing: "A descent.", relations: "Past and future.", threads: "Will and futurity.", linkedDreamIds: undefined, linkedMemoryIds: ["older"] });

		expect(migrated?.reflection).toContain("[Previous Relations]");
		expect(migrated?.reflection).toContain("[Previous Threads to Follow]");
		expect(migrated?.linkedDreamIds).toEqual(["older"]);
	});

	it("reads legacy libraries without moving their files", async () =>
	{
		const primary = await mkdtemp(path.join(os.tmpdir(), "chora-dreams-"));
		const legacy = await mkdtemp(path.join(os.tmpdir(), "chora-memories-"));
		directories.push(primary, legacy);
		const legacyRepository = new DreamRepository(legacy);
		const legacyLibrary = new DreamLibrary(legacy, legacyRepository);
		await legacyLibrary.SaveAsync(CreateDream("legacy", "Remembered"));
		const primaryRepository = new DreamRepository(primary, [legacy]);
		const primaryLibrary = new DreamLibrary(primary, primaryRepository);
		const dreams = await primaryLibrary.ListAsync();

		expect(dreams.map((dream) => dream.id)).toContain("legacy");
		expect(await readdir(path.join(legacy, "republic"))).toHaveLength(1);
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

	it("materializes an edited legacy Dream into the primary library", async () =>
	{
		const primary = await mkdtemp(path.join(os.tmpdir(), "chora-dreams-"));
		const legacy = await mkdtemp(path.join(os.tmpdir(), "chora-memories-"));
		const original = CreateDream("legacy", "Remembered");
		const edited = { ...original, title: "Remembered differently" };
		directories.push(primary, legacy);
		const legacyRepository = new DreamRepository(legacy);
		const legacyLibrary = new DreamLibrary(legacy, legacyRepository);
		await legacyLibrary.SaveAsync(original);

		const repository = new DreamRepository(primary, [legacy]);
		const library = new DreamLibrary(primary, repository);
		await library.SaveAsync(edited);

		const legacyContent = await readFile(path.join(legacy, "republic", "remembered--legacy.md"), "utf8");
		const primaryContent = await readFile(path.join(primary, "republic", "remembered-differently--legacy.md"), "utf8");

		expect(legacyContent).toContain("# Remembered");
		expect(primaryContent).toContain("# Remembered differently");
	});

	it("does not delete a legacy Dream", async () =>
	{
		const primary = await mkdtemp(path.join(os.tmpdir(), "chora-dreams-"));
		const legacy = await mkdtemp(path.join(os.tmpdir(), "chora-memories-"));
		directories.push(primary, legacy);
		const legacyRepository = new DreamRepository(legacy);
		const legacyLibrary = new DreamLibrary(legacy, legacyRepository);
		await legacyLibrary.SaveAsync(CreateDream("legacy", "Remembered"));

		const repository = new DreamRepository(primary, [legacy]);
		const library = new DreamLibrary(primary, repository);

		await expect(library.DeleteAsync("legacy")).rejects.toThrow("Legacy Dreams are read-only");
		expect(await readdir(path.join(legacy, "republic"))).toHaveLength(1);
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

	it("deletes only the Dream with the requested identifier", async () =>
	{
		const library = await CreateLibraryAsync();
		await library.SaveAsync(CreateDream("one", "First"));
		await library.SaveAsync(CreateDream("two", "Second"));

		await library.DeleteAsync("one");

		const remaining = await library.ListAsync();
		expect(remaining.map((dream) => dream.id)).toEqual(["two"]);
	});

	it("retains its index until an explicit invalidation", async function RefreshesRepositoryIndexExplicitly()
	{
		const directory = await mkdtemp(path.join(os.tmpdir(), "chora-dream-index-"));
		directories.push(directory);
		const repository = new DreamRepository(directory);
		const original = CreateDream("indexed", "Original");
		const filePath = path.join(directory, "republic", "original--indexed.md");
		const record: DreamPersistenceRecord = { dream: original, filePath, origin: "primary" };

		await repository.SaveAsync(record);
		const initial = await repository.LoadAsync();
		const replacement = { ...original, title: "Replacement" };
		const replacementContent = SerializeDreamMarkdown(replacement);
		await writeFile(filePath, replacementContent, "utf8");
		const cached = await repository.LoadAsync();
		repository.InvalidateIndex();
		const refreshed = await repository.LoadAsync();

		expect(initial[0]?.dream.title).toBe("Original");
		expect(cached[0]?.dream.title).toBe("Original");
		expect(refreshed[0]?.dream.title).toBe("Replacement");
	});

	it("normalizes owned links and rejects duplicate signals", () =>
	{
		const record = CreateDream("one", "  Descent  ");
		record.linkedDreamIds = ["one", "two", "two", "  three  "];
		const dream = new Dream(record);
		const signal = {
			id: "signal",
			sourceRef: "s1",
			selection: record.source,
			text: "χθὲς",
			description: ""
		};

		dream.AddSignal(signal);
		expect(() => dream.AddSignal(signal)).toThrow("Dream signal already exists: signal");
		const normalized = dream.ToRecord();

		expect(normalized.title).toBe("Descent");
		expect(normalized.linkedDreamIds).toEqual(["two", "three"]);
		expect(normalized.signals).toHaveLength(1);
	});
});
