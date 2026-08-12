import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { LibraryStore } from "../../src/renderer/library/LibraryStore.js";
import { DreamController } from "../../src/renderer/dreams/DreamController.js";
import { DreamGateway } from "../../src/renderer/dreams/DreamGateway.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import type { LibraryText } from "../../src/shared/library/LibraryTypes.js";
import type { Dream } from "../../src/shared/dreams/DreamTypes.js";

const document = {
	id: "republic",
	title: "Republic",
	segments: [
		{ key: "s1", locator: { scheme: "Stephanus", value: "327a" }, text: "abcdef" },
		{ key: "s2", locator: { scheme: "Stephanus", value: "327b" }, text: "ghijkl" }
	]
} as LibraryText;

function CreateStorage(): Storage
{
	const records = new Map<string, string>();
	return {
		get length(): number { return records.size; },
		clear(): void { records.clear(); },
		getItem: (key) => records.get(key) ?? null,
		key: (index) => [...records.keys()][index] ?? null,
		removeItem: (key) => records.delete(key),
		setItem: (key, value) => records.set(key, value)
	};
}

describe("DreamController", function DreamControllerTests()
{
	let controller: DreamController;
	let store: DreamStore;
	let events: ChoraEventBus<ChoraEvents>;
	let storage: Storage;
	let saved: Dream[];

	beforeEach(() =>
	{
		vi.useFakeTimers();
		storage = CreateStorage();
		saved = [];
		vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `id-${Math.random()}`) });
		vi.stubGlobal("window", {
			sessionStorage: storage,
			chora: {
				ListDreams: vi.fn(async () => saved),
				DeleteDream: vi.fn(async (dreamId: string) =>
				{
					saved = saved.filter((dream) => dream.id !== dreamId);
				}),
				SaveDream: vi.fn(async (dream: Dream) =>
				{
					saved = [structuredClone(dream)];
					return structuredClone(dream);
				})
			}
		});
		events = new ChoraEventBus<ChoraEvents>();
		const errors = new ErrorManager(events);
		const library = new LibraryStore();
		library.Open(document, null);
		store = new DreamStore(new SessionStore());
		controller = new DreamController(events, errors, library, store, new DreamGateway());
	});

	afterEach(() =>
	{
		store.Dispose();
		vi.useRealTimers();
	});

	it("creates an empty Dream and orders manually-added signals by source", function CreatesAndOrdersSignals()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 1 }, end: { segmentKey: "s2", offset: 4 }, selectedText: "bcdef\nghij", locatorStart: null, locatorEnd: null });
		controller.AddSignal({ documentId: "republic", start: { segmentKey: "s2", offset: 1 }, end: { segmentKey: "s2", offset: 3 }, selectedText: "hi", locatorStart: null, locatorEnd: null });
		controller.AddSignal({ documentId: "republic", start: { segmentKey: "s1", offset: 2 }, end: { segmentKey: "s1", offset: 4 }, selectedText: "cd", locatorStart: null, locatorEnd: null });

		const dream = store.GetActiveDream();
		expect(dream?.title).toBe("");
		expect(dream?.reflection).toBe("");
		expect(dream?.signals.map((signal) => signal.text)).toEqual(["cd", "hi"]);
	});

	it("does not expose mutable active Dream state", function ProtectsActiveDreamState()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 1 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "bc", locatorStart: null, locatorEnd: null });
		const snapshot = store.GetActiveDream();
		const revision = store.GetRevision();

		if (snapshot !== null)
		{
			snapshot.title = "Untracked mutation";
		}

		expect(store.GetActiveDream()?.title).toBe("");
		expect(store.GetRevision()).toBe(revision);
	});

	it("extends a Dream source passage in canonical source order", function ExtendsSource()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 1 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "bc", locatorStart: null, locatorEnd: null });

		controller.ExtendSource({ documentId: "republic", start: { segmentKey: "s2", offset: 1 }, end: { segmentKey: "s2", offset: 4 }, selectedText: "hij", locatorStart: null, locatorEnd: null });

		const source = store.GetActiveDream()?.source;
		expect(source?.start).toEqual({ segmentKey: "s1", offset: 1 });
		expect(source?.end).toEqual({ segmentKey: "s2", offset: 4 });
		expect(source?.selectedText).toBe("bcdef\nghij");
		expect(source?.sourceRefs).toEqual(["s1", "s2"]);
	});

	it("debounces Dream draft persistence while preserving recovery", async function RestoresDraft()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		const setItem = vi.spyOn(storage, "setItem");
		controller.UpdateExegesis("A remembered perception.");
		controller.UpdateExegesis("A remembered perception growing.");

		expect(setItem).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(399);
		expect(setItem).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(setItem).toHaveBeenCalledOnce();
		const restored = new DreamStore(new SessionStore());

		expect(restored.GetActiveDream()?.reflection).toBe("A remembered perception growing.");
		expect(restored.GetIsDirty()).toBe(true);
	});

	it("saves the complete Dream and reports a saved state", async function SavesDream()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		controller.UpdateExegesis("A perception.");

		await controller.SaveAsync();

		expect(saved[0]?.reflection).toBe("A perception.");
		expect(store.GetIsDirty()).toBe(false);
		expect(store.GetSaveState()).toBe("saved");
	});

	it("autosaves a changed Dream after the editing pause", async function AutosavesDream()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		controller.UpdateExegesis("A perception preserved automatically.");

		await vi.advanceTimersByTimeAsync(749);
		expect(saved).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);

		expect(saved[0]?.reflection).toBe("A perception preserved automatically.");
		expect(store.GetIsDirty()).toBe(false);
	});

	it("saves a dirty Dream before the editor closes", async function SavesOnClose()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		controller.UpdateExegesis("Saved while closing.");

		await controller.CloseAsync();

		expect(saved[0]?.reflection).toBe("Saved while closing.");
		expect(store.GetActiveDream()).toBeNull();
		expect(store.GetCatalogue()).toHaveLength(1);
	});

	it("keeps a dirty Dream open when the close save fails", async function PreservesFailedClose()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		controller.UpdateExegesis("This must not be discarded.");
		vi.mocked(window.chora.SaveDream).mockRejectedValueOnce(new Error("Disk unavailable"));

		await controller.CloseAsync();

		expect(store.GetActiveDream()?.reflection).toBe("This must not be discarded.");
		expect(store.GetIsDirty()).toBe(true);
		expect(store.GetSaveState()).toBe("error");
	});

	it("deletes the active Dream and refreshes the catalogue", async function DeletesDream()
	{
		controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 0 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "abc", locatorStart: null, locatorEnd: null });
		await controller.SaveAsync();

		await controller.DeleteAsync();

		expect(window.chora.DeleteDream).toHaveBeenCalledOnce();
		expect(store.GetActiveDream()).toBeNull();
		expect(store.GetCatalogue()).toEqual([]);
	});
});
