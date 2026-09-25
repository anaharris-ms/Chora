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

describe("Dream resonances", function DreamResonanceTests()
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
		let nextId = 0;
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
				}),
				AllocateDreamId: vi.fn(async () =>
				{
					nextId += 1;
					return `id-${nextId}`;
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

	async function CreateDreamWithSignalAsync(): Promise<string>
	{
		await controller.Create({ documentId: "republic", start: { segmentKey: "s1", offset: 1 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "bc", locatorStart: null, locatorEnd: null });
		await controller.AddSignal({ documentId: "republic", start: { segmentKey: "s1", offset: 1 }, end: { segmentKey: "s1", offset: 3 }, selectedText: "bc", locatorStart: null, locatorEnd: null });
		const signalId = store.GetActiveDream()?.signals[0]?.id;
		if (signalId === undefined) throw new Error("Signal was not created");
		return signalId;
	}

	it("captures a resonance without requiring a passage reference", async function CapturesResonanceWithoutTarget()
	{
		const signalId = await CreateDreamWithSignalAsync();

		await controller.AddResonanceAsync(signalId, "This recalls the divided line.");

		const resonances = store.GetActiveDream()?.signals[0]?.resonances;
		expect(resonances).toHaveLength(1);
		expect(resonances?.[0]?.note).toBe("This recalls the divided line.");
		expect(resonances?.[0]?.targets).toEqual([]);
	});

	it("persists a resonance through save and preserves it across reopening the Dream", async function PersistsAcrossReopen()
	{
		const signalId = await CreateDreamWithSignalAsync();
		await controller.AddResonanceAsync(signalId, "Echoes the cave allegory.");

		await controller.SaveAsync();
		const dreamId = store.GetActiveDream()?.id;
		if (dreamId === undefined) throw new Error("Dream was not saved");

		await controller.CloseAsync();
		await controller.RefreshAsync();
		controller.Open(dreamId);

		const resonances = store.GetActiveDream()?.signals[0]?.resonances;
		expect(resonances).toHaveLength(1);
		expect(resonances?.[0]?.note).toBe("Echoes the cave allegory.");
	});

	it("attaches a passage to an armed resonance while preserving the original note", async function AttachesPassagePreservingNote()
	{
		const signalId = await CreateDreamWithSignalAsync();
		await controller.AddResonanceAsync(signalId, "A recurring image.");
		const resonanceId = store.GetActiveDream()?.signals[0]?.resonances[0]?.id;
		if (resonanceId === undefined) throw new Error("Resonance was not created");

		controller.RequestAttachResonanceTarget(signalId, resonanceId);
		expect(controller.GetArmedResonanceAttach()).toEqual({ signalId, resonanceId });

		await events.PublishAsync("dream.resonance-target-attach-requested", {
			selection: { documentId: "republic", start: { segmentKey: "s2", offset: 0 }, end: { segmentKey: "s2", offset: 3 }, selectedText: "ghi", locatorStart: null, locatorEnd: null }
		});

		const resonance = store.GetActiveDream()?.signals[0]?.resonances[0];
		expect(resonance?.note).toBe("A recurring image.");
		expect(resonance?.targets).toHaveLength(1);
		expect(resonance?.targets[0]?.workId).toBe("republic");
		expect(controller.GetArmedResonanceAttach()).toBeNull();
	});

	it("navigates from the target passage back to the originating signal and removes an attachment without deleting the resonance", async function NavigatesBidirectionallyAndDetaches()
	{
		const signalId = await CreateDreamWithSignalAsync();
		await controller.AddResonanceAsync(signalId, "Points back to the source.");
		const resonanceId = store.GetActiveDream()?.signals[0]?.resonances[0]?.id;
		if (resonanceId === undefined) throw new Error("Resonance was not created");

		controller.RequestAttachResonanceTarget(signalId, resonanceId);
		await events.PublishAsync("dream.resonance-target-attach-requested", {
			selection: { documentId: "republic", start: { segmentKey: "s2", offset: 0 }, end: { segmentKey: "s2", offset: 3 }, selectedText: "ghi", locatorStart: null, locatorEnd: null }
		});
		await controller.SaveAsync();

		const hits = controller.GetResonanceHitsAt("s2");
		expect(hits).toHaveLength(1);
		expect(hits[0]?.signalId).toBe(signalId);

		const targetId = store.GetActiveDream()?.signals[0]?.resonances[0]?.targets[0]?.id;
		if (targetId === undefined) throw new Error("Target was not attached");

		const jumps: unknown[] = [];
		events.Subscribe("library.jump-requested", (event) => jumps.push(event));
		controller.JumpToResonanceTarget(signalId, resonanceId, targetId);
		expect(jumps).toHaveLength(1);

		controller.RemoveResonanceTarget(signalId, resonanceId, targetId);
		await controller.SaveAsync();
		const resonance = store.GetActiveDream()?.signals[0]?.resonances[0];
		expect(resonance?.note).toBe("Points back to the source.");
		expect(resonance?.targets).toEqual([]);
		expect(controller.GetResonanceHitsAt("s2")).toHaveLength(0);
	});

	it("removes a resonance entirely on request", async function RemovesResonance()
	{
		const signalId = await CreateDreamWithSignalAsync();
		await controller.AddResonanceAsync(signalId, "Temporary thought.");
		const resonanceId = store.GetActiveDream()?.signals[0]?.resonances[0]?.id;
		if (resonanceId === undefined) throw new Error("Resonance was not created");

		controller.RemoveResonance(signalId, resonanceId);

		expect(store.GetActiveDream()?.signals[0]?.resonances).toEqual([]);
	});
});
