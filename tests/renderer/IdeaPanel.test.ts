// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { ErrorManager } from "../../src/renderer/core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../src/renderer/core/events/ChoraEvents.js";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";
import { DreamStore } from "../../src/renderer/dreams/DreamStore.js";
import { IdeaController } from "../../src/renderer/ideas/IdeaController.js";
import { IdeaGateway } from "../../src/renderer/ideas/IdeaGateway.js";
import { IdeaPanel } from "../../src/renderer/ideas/IdeaPanel.js";
import { IdeaStore, type IdeaDraft } from "../../src/renderer/ideas/IdeaStore.js";
import type { Dream, DreamSignal } from "../../src/shared/dreams/DreamTypes.js";
import type { IdeaRecord, IdeaSignalReference } from "../../src/shared/ideas/IdeaTypes.js";

// Creates one complete Signal fixture for the Ideas panels.
function CreateSignal(id: string, text: string, description: string): DreamSignal
{
	const signal: DreamSignal = {
		id,
		sourceRef: `source-${id}`,
		selection: {
			documentId: "republic",
			start: { segmentKey: id, offset: 0 },
			end: { segmentKey: id, offset: text.length },
			selectedText: text,
			locatorStart: { scheme: "Stephanus", value: id },
			locatorEnd: { scheme: "Stephanus", value: id }
		},
		text,
		description,
		resonances: []
	};

	return signal;
}

// Creates one Dream fixture that owns displayed Signals.
function CreateDream(signals: readonly DreamSignal[]): Dream
{
	const dream: Dream = {
		id: "dream-1",
		workId: "republic",
		dialogue: "Republic",
		title: "Descent",
		source: {
			...signals[0]!.selection,
			sourceRefs: ["source-1"],
			startSourceRef: "source-1",
			endSourceRef: "source-1"
		},
		signals: [...signals],
		reflection: "",
		linkedDreamIds: [],
		createdAt: "2026-01-01",
		updatedAt: "2026-01-01"
	};

	return dream;
}

// Creates one saved Idea fixture.
function CreateIdea(id: string, title: string, reference: IdeaSignalReference): IdeaRecord
{
	const idea: IdeaRecord = {
		id,
		workId: "republic",
		title,
		content: `${title} interpretation`,
		originSignal: reference,
		relatedSignals: [],
		createdAt: "2026-01-01",
		updatedAt: "2026-01-01"
	};

	return idea;
}

// Creates one empty unsaved Idea draft.
function CreateEmptyDraft(): IdeaDraft
{
	const draft: IdeaDraft = {
		ideaId: null,
		workId: "republic",
		title: "",
		content: "",
		originSignal: null,
		relatedSignals: []
	};

	return draft;
}

// Removes DOM and session state created by each panel test.
function ResetDocument(): void
{
	document.body.innerHTML = "";
	window.sessionStorage.clear();
}

// Creates shared renderer collaborators for one panel test.
function CreateFixture(signals: readonly DreamSignal[], ideas: readonly IdeaRecord[]): {
	readonly events: ChoraEventBus<ChoraEvents>;
	readonly dreamStore: DreamStore;
	readonly ideaStore: IdeaStore;
	readonly controller: IdeaController;
}
{
	const events = new ChoraEventBus<ChoraEvents>();
	const dreamStore = new DreamStore(new SessionStore());
	dreamStore.SetCatalogue([CreateDream(signals)]);
	const ideaStore = new IdeaStore();
	ideaStore.SetWork("republic", ideas);
	const errors = new ErrorManager(events);
	const controller = new IdeaController(events, errors, ideaStore, new IdeaGateway());
	const fixture = { events, dreamStore, ideaStore, controller };

	return fixture;
}

describe("IdeaPanel", function IdeaPanelTests()
{
	afterEach(ResetDocument);

	it("renders the Dreams catalogue pattern as one flat Ideas list", function RendersFlatCatalogue()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signal = CreateSignal("327a", "κατέβην", "Socrates descends.");
		const reference: IdeaSignalReference = { dreamId: "dream-1", signalId: signal.id };
		const fixture = CreateFixture([signal], [
			CreateIdea("idea-1", "Descent", reference),
			CreateIdea("idea-2", "Return", reference)
		]);
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "catalogue");

		expect(root.querySelector("[data-idea-search]")).not.toBeNull();
		expect(root.querySelector("[data-new-idea]")).not.toBeNull();
		expect(root.querySelectorAll(".catalogue-item")).toHaveLength(2);
		expect(root.querySelector(".catalogue-group")).toBeNull();
		expect(root.textContent).toContain("1 Signal");

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});

	it("filters Ideas in place by title, description, and connected Signal text", function FiltersCatalogue()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signal = CreateSignal("327a", "κατέβην", "Socrates descends.");
		const reference: IdeaSignalReference = { dreamId: "dream-1", signalId: signal.id };
		const fixture = CreateFixture([signal], [
			CreateIdea("idea-1", "Descent", reference),
			CreateIdea("idea-2", "Return", reference)
		]);
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "catalogue");
		const search = root.querySelector<HTMLInputElement>("[data-idea-search]");

		if (search !== null)
		{
			search.value = "Return";
			search.dispatchEvent(new Event("input", { bubbles: true }));
		}

		expect(root.querySelectorAll(".catalogue-item")).toHaveLength(1);
		expect(root.textContent).toContain("Return");
		expect(root.textContent).not.toContain("Descent interpretation");

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});

	it("opens an empty new Idea with an available Add Signal action", function RendersEmptyEditor()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signal = CreateSignal("327a", "κατέβην", "Socrates descends.");
		const fixture = CreateFixture([signal], []);
		fixture.ideaStore.SetDraft(CreateEmptyDraft());
		fixture.ideaStore.UpdateDraft("Exchange", "Meaning moves between sources.");
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "editor");

		expect(root.querySelector("[data-open-signal-browser]")?.getAttribute("aria-label")).toBe("Add Signal");
		expect(root.querySelector("[data-open-signal-browser] svg")).not.toBeNull();
		expect(root.querySelector("[data-find-signals]")?.getAttribute("aria-label")).toBe("Find Signals");
		expect(root.querySelector("[data-find-signals] svg")).not.toBeNull();
		expect(root.querySelectorAll(".idea-signals-section .signal-item")).toHaveLength(0);
		expect(root.querySelector("[data-cancel-idea]")?.textContent).toBe("Cancel");
		expect(root.querySelector("[data-save-idea]")?.getAttribute("aria-label")).toBe("Save Idea");
		expect(root.querySelector("[data-save-idea] svg")).not.toBeNull();
		expect(root.querySelector<HTMLButtonElement>("[data-save-idea]")?.disabled).toBe(true);

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});

	it("renders compact rationale-bearing model suggestions", function RendersSuggestions()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signal = CreateSignal("327a", "πομπή", "Exchange bears meaning between speakers.");
		const fixture = CreateFixture([signal], []);
		fixture.ideaStore.SetDraft(CreateEmptyDraft());
		fixture.ideaStore.SetDiscoveryLoading();
		fixture.ideaStore.SetSuggestions([{
			reference: { dreamId: "dream-1", signalId: signal.id },
			rationale: "The observation describes meaning as something carried between sources."
		}]);
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "editor");

		expect(root.querySelector(".idea-suggestion-rationale")?.textContent).toContain("carried between sources");
		expect(root.querySelector("[data-view-available]")).not.toBeNull();
		expect(root.querySelector("[data-add-available]")).not.toBeNull();

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});

	it("searches and connects several Signals without leaving the browser", function AddsSignals()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signals = [
			CreateSignal("327a", "κατέβην", "Socrates descends."),
			CreateSignal("327c", "βίᾳ", "Force structures the return.")
		];
		const fixture = CreateFixture(signals, []);
		fixture.ideaStore.SetDraft(CreateEmptyDraft());
		fixture.ideaStore.ShowSignalBrowser();
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "editor");
		const firstAdd = root.querySelector<HTMLElement>('[data-signal-id="327a"][data-add-available]');
		firstAdd?.click();
		const secondAdd = root.querySelector<HTMLElement>('[data-signal-id="327c"][data-add-available]');
		secondAdd?.click();

		expect(fixture.ideaStore.GetView()).toBe("signals");
		expect(fixture.ideaStore.GetDraft()?.originSignal?.signalId).toBe("327a");
		expect(fixture.ideaStore.GetDraft()?.relatedSignals[0]?.signalId).toBe("327c");
		expect(root.querySelectorAll<HTMLButtonElement>("[data-add-available][disabled]")).toHaveLength(2);

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});

	it("uses the normal catalogue to attach a pending Signal", function RendersPendingCatalogue()
	{
		const root = document.createElement("div");
		document.body.append(root);
		const signal = CreateSignal("327a", "κατέβην", "Socrates descends.");
		const reference: IdeaSignalReference = { dreamId: "dream-1", signalId: signal.id };
		const fixture = CreateFixture([signal], [CreateIdea("idea-1", "Descent", reference)]);
		fixture.ideaStore.BeginAddToIdea(reference);
		const panel = new IdeaPanel(root, fixture.events, fixture.ideaStore, fixture.controller, fixture.dreamStore, "catalogue");

		expect(root.querySelector("[data-cancel-add-to-idea]")).not.toBeNull();
		expect(root.querySelector<HTMLButtonElement>("[data-idea-id]")?.disabled).toBe(true);
		expect(root.textContent).toContain("Connected");

		panel.Dispose();
		fixture.dreamStore.Dispose();
	});
});
