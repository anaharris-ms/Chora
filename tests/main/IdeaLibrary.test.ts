import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IdeaLibrary, type IdeaDreamAccess } from "../../src/main/ideas/IdeaLibrary.js";
import { IdeaMarkdownCodec } from "../../src/main/ideas/IdeaMarkdownCodec.js";
import { IdeaRepository } from "../../src/main/ideas/IdeaRepository.js";
import type { Dream, DreamSignal } from "../../src/shared/dreams/DreamTypes.js";
import type { IdeaSignalReference, SaveIdeaCommand } from "../../src/shared/ideas/IdeaTypes.js";

// Tracks temporary Idea libraries created by this test suite.
const Directories: string[] = [];

// Creates one complete Signal fixture.
function CreateSignal(id: string): DreamSignal
{
	const signal: DreamSignal = {
		id,
		sourceRef: `source-${id}`,
		selection: {
			documentId: "republic",
			start: { segmentKey: id, offset: 0 },
			end: { segmentKey: id, offset: 3 },
			selectedText: id,
			locatorStart: { scheme: "Stephanus", value: id },
			locatorEnd: { scheme: "Stephanus", value: id }
		},
		text: id,
		description: `Description ${id}`,
		resonances: []
	};

	return signal;
}

// Creates one complete Dream fixture with the requested Signals.
function CreateDream(id: string, workId: string, signalIds: readonly string[]): Dream
{
	const source = CreateSignal("source").selection;
	const signals: DreamSignal[] = [];

	for (const signalId of signalIds)
	{
		const signal = CreateSignal(signalId);
		signals.push(signal);
	}

	const dream: Dream = {
		id,
		workId,
		dialogue: "Republic",
		title: `Dream ${id}`,
		source: {
			...source,
			sourceRefs: ["source"],
			startSourceRef: "source",
			endSourceRef: "source"
		},
		signals,
		reflection: "",
		linkedDreamIds: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z"
	};

	return dream;
}

// Creates one Signal reference fixture.
function CreateReference(dreamId: string, signalId: string): IdeaSignalReference
{
	const reference: IdeaSignalReference = { dreamId, signalId };

	return reference;
}

// Creates one narrow save command without authoritative metadata.
function CreateSaveCommand(
	originSignal: IdeaSignalReference,
	relatedSignals: readonly IdeaSignalReference[],
	ideaId: string | null = null): SaveIdeaCommand
{
	const command: SaveIdeaCommand = {
		ideaId,
		workId: "republic",
		title: "The Descent",
		content: "A durable interpretation.",
		originSignal,
		relatedSignals
	};

	return command;
}

// Provides deterministic Dreams to the Idea library.
class StubDreamAccess implements IdeaDreamAccess
{
	// Creates the Dream fixture boundary.
	public constructor(private readonly dreams: readonly Dream[])
	{
	}

	// Lists cloned Dream fixtures.
	public async ListAsync(): Promise<Dream[]>
	{
		const dreams = structuredClone(this.dreams);

		return dreams;
	}
}

// Creates one temporary authoritative Idea library.
async function CreateLibraryAsync(dreams: readonly Dream[]): Promise<IdeaLibrary>
{
	const temporaryRoot = path.join(os.tmpdir(), "chora-ideas-");
	const directory = await mkdtemp(temporaryRoot);
	Directories.push(directory);
	const codec = new IdeaMarkdownCodec();
	const repository = new IdeaRepository(directory, codec);
	const library = new IdeaLibrary(repository, new StubDreamAccess(dreams));

	return library;
}

// Removes all temporary Idea libraries.
async function RemoveDirectoriesAsync(): Promise<void>
{
	const directories = Directories.splice(0);

	for (const directory of directories)
	{
		await rm(directory, { recursive: true, force: true });
	}
}

describe("IdeaLibrary", function IdeaLibraryTests()
{
	afterEach(RemoveDirectoriesAsync);

	it("preserves one origin and requires two distinct related Signals", async function PersistsOriginFirstIdeaAsync()
	{
		const dreams = [CreateDream("dream-1", "republic", ["signal-1", "signal-2", "signal-3"])];
		const library = await CreateLibraryAsync(dreams);
		const origin = CreateReference("dream-1", "signal-1");
		const invalid = CreateSaveCommand(origin, [
			origin,
			CreateReference("dream-1", "signal-2"),
			CreateReference("dream-1", "signal-2")
		]);
		const rejectedSave = library.SaveAsync(invalid);
		await expect(rejectedSave).rejects.toThrow("originating Signal and at least 2 distinct related Signals");

		const valid = CreateSaveCommand(origin, [
			origin,
			CreateReference("dream-1", "signal-2"),
			CreateReference("dream-1", "signal-3")
		]);
		const saved = await library.SaveAsync(valid);
		expect(saved.originSignal).toEqual(origin);
		expect(saved.relatedSignals).toEqual([
			CreateReference("dream-1", "signal-2"),
			CreateReference("dream-1", "signal-3")
		]);
		expect(saved.id.length).toBeGreaterThan(0);
		expect(saved.createdAt).toBe(saved.updatedAt);
	});

	it("rejects unresolved, foreign-work, and changed origin Signals", async function RejectsInvalidSignalsAsync()
	{
		const dreams = [
			CreateDream("dream-1", "republic", ["signal-1", "signal-2", "signal-3"]),
			CreateDream("dream-2", "symposium", ["foreign"])
		];
		const library = await CreateLibraryAsync(dreams);
		const deletedSignal = CreateSaveCommand(
			CreateReference("dream-1", "deleted"),
			[CreateReference("dream-1", "signal-2"), CreateReference("dream-1", "signal-3")]);
		const deletedResult = library.SaveAsync(deletedSignal);
		await expect(deletedResult).rejects.toThrow("unresolved");

		const foreignSignal = CreateSaveCommand(
			CreateReference("dream-1", "signal-1"),
			[CreateReference("dream-2", "foreign"), CreateReference("dream-1", "signal-3")]);
		const foreignResult = library.SaveAsync(foreignSignal);
		await expect(foreignResult).rejects.toThrow("another work");

		const saved = await library.SaveAsync(CreateSaveCommand(
			CreateReference("dream-1", "signal-1"),
			[CreateReference("dream-1", "signal-2"), CreateReference("dream-1", "signal-3")]));
		const changedOrigin = CreateSaveCommand(
			CreateReference("dream-1", "signal-2"),
			[CreateReference("dream-1", "signal-1"), CreateReference("dream-1", "signal-3")],
			saved.id);
		const changedOriginResult = library.SaveAsync(changedOrigin);
		await expect(changedOriginResult).rejects.toThrow("originating Signal cannot be changed");
	});

	it("writes origin-first Markdown and safely renames by title", async function RenamesMarkdownAsync()
	{
		const origin = CreateReference("dream-1", "signal-1");
		const related = [
			CreateReference("dream-1", "signal-2"),
			CreateReference("dream-1", "signal-3")
		];
		const dreams = [CreateDream("dream-1", "republic", ["signal-1", "signal-2", "signal-3"])];
		const library = await CreateLibraryAsync(dreams);
		const saved = await library.SaveAsync(CreateSaveCommand(origin, related));
		const directory = Directories[0];

		if (directory === undefined)
		{
			throw new Error("Missing test directory");
		}

		const ideasPath = path.join(directory, "republic", "Ideas");
		const firstFileName = `the-descent--${saved.id}.md`;
		const firstFiles = await readdir(ideasPath);
		expect(firstFiles).toEqual([firstFileName]);
		const firstPath = path.join(ideasPath, firstFileName);
		const markdown = await readFile(firstPath, "utf8");
		expect(markdown).toContain("# The Descent");
		expect(markdown).toContain("originSignal:");
		expect(markdown).toContain("relatedSignals:");

		const update = {
			...CreateSaveCommand(origin, related, saved.id),
			title: "Another Name"
		};
		await library.SaveAsync(update);
		const renamedFiles = await readdir(ideasPath);
		expect(renamedFiles).toEqual([`another-name--${saved.id}.md`]);
	});
});
