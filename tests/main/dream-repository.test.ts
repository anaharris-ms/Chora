import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MigrateDream, ParseDreamMarkdown, SerializeDreamMarkdown } from "../../src/main/dreams/dream-markdown-codec.js";
import { DreamRepository } from "../../src/main/dreams/dream-repository.js";
import type { Dream } from "../../src/shared/dreams/dream-types.js";

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

async function CreateRepositoryAsync(): Promise<DreamRepository>
{
	const directory = await mkdtemp(path.join(os.tmpdir(), "chora-dream-"));
	directories.push(directory);
	return new DreamRepository(directory);
}

describe("Dream repository", function DreamRepositoryTests()
{
	afterEach(async () =>
	{
		for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
	});

	it("saves a titleless Dream containing only exegesis", async () =>
	{
		const repository = await CreateRepositoryAsync();
		const dream = CreateDream("one", "   ");
		dream.reflection = "A descent toward another way of seeing.";
		await repository.Save(dream);
		const records = await repository.List();
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
		await new DreamRepository(legacy).Save(CreateDream("legacy", "Remembered"));
		const dreams = await new DreamRepository(primary, [legacy]).List();

		expect(dreams.map((dream) => dream.id)).toContain("legacy");
		expect(await readdir(path.join(legacy, "republic"))).toHaveLength(1);
	});

	it("writes readable Markdown in the work folder", async () =>
	{
		const repository = await CreateRepositoryAsync();
		await repository.Save(CreateDream("one", "Descent"));
		const directory = directories[0];
		if (directory === undefined) throw new Error("Test directory was not created.");
		const content = await readFile(path.join(directory, "republic", "descent--one.md"), "utf8");

		expect(content).toContain("workId: republic");
		expect(content).toContain("# Descent");
		expect(content).toContain(GreekPassage);
	});

	it("deletes only the Dream with the requested identifier", async () =>
	{
		const repository = await CreateRepositoryAsync();
		await repository.Save(CreateDream("one", "First"));
		await repository.Save(CreateDream("two", "Second"));

		await repository.Delete("one");

		const remaining = await repository.List();
		expect(remaining.map((dream) => dream.id)).toEqual(["two"]);
	});
});
