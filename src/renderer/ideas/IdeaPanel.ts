import type { Dream, DreamSignal } from "../../shared/dreams/DreamTypes.js";
import type { IdeaDiscoverySuggestion, IdeaRecord, IdeaSignalReference } from "../../shared/ideas/IdeaTypes.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import type { DreamStore } from "../dreams/DreamStore.js";
import { AddIcon, CloseIcon, SaveIcon, SearchIcon, TrashIcon } from "../ui/Icons.js";
import { NormalizeDisplayText } from "../ui/DisplayText.js";
import { EscapeHtml } from "../ui/Html.js";
import { IdeaController } from "./IdeaController.js";
import { IdeaStore, type IdeaDraft } from "./IdeaStore.js";

// Which view of the Ideas feature this panel instance renders.
export type IdeaPanelMode = "catalogue" | "editor";

// Contains one Signal and the Dream that owns it for display.
export interface ResolvedIdeaSignal
{
	// Contains the owning Dream.
	readonly dream: Dream;
	// Contains the referenced Signal.
	readonly signal: DreamSignal;
}

// Renders the flat Ideas catalogue or active Idea editor and routes browser events.
export class IdeaPanel
{
	// Contains subscriptions released with this panel.
	private readonly subscriptions: Unsubscribe[] = [];
	// Handles all delegated click events from the persistent panel root.
	private readonly clickHandler: (event: Event) => void;
	// Handles all delegated input events from the persistent panel root.
	private readonly inputHandler: (event: Event) => void;
	// Renders feature state after typed application events.
	private readonly updateHandler: () => void;

	// Creates one persistent Ideas panel mode and registers delegated events once.
	public constructor(
		private readonly root: HTMLElement,
		events: ChoraEventBus<ChoraEvents>,
		private readonly store: IdeaStore,
		private readonly controller: IdeaController,
		private readonly dreams: DreamStore,
		private readonly mode: IdeaPanelMode)
	{
		this.clickHandler = this.HandleClick.bind(this);
		this.inputHandler = this.HandleInput.bind(this);
		this.updateHandler = this.Update.bind(this);
		this.root.addEventListener("click", this.clickHandler);
		this.root.addEventListener("input", this.inputHandler);
		const ideaSubscription = events.Subscribe("ideas.changed", this.updateHandler);
		const dreamSubscription = events.Subscribe("dream.catalogue-changed", this.updateHandler);
		this.subscriptions.push(ideaSubscription);
		this.subscriptions.push(dreamSubscription);
		this.Update();
	}

	// Releases event-bus subscriptions owned by this panel.
	public Dispose(): void
	{
		this.root.removeEventListener("click", this.clickHandler);
		this.root.removeEventListener("input", this.inputHandler);

		for (const unsubscribe of this.subscriptions)
		{
			unsubscribe();
		}
	}

	// Resolves one Signal reference against renderer Dream snapshots.
	public ResolveSignal(reference: IdeaSignalReference): ResolvedIdeaSignal | null
	{
		const dreams = this.dreams.GetCatalogue();
		let resolvedDream: Dream | null = null;
		let resolvedSignal: DreamSignal | null = null;

		for (const dream of dreams)
		{
			if (dream.id === reference.dreamId)
			{
				resolvedDream = dream;
			}
		}
		if (resolvedDream !== null)
		{
			for (const signal of resolvedDream.signals)
			{
				if (signal.id === reference.signalId)
				{
					resolvedSignal = signal;
				}
			}
		}

		let resolved: ResolvedIdeaSignal | null = null;

		if (resolvedDream !== null && resolvedSignal !== null)
		{
			resolved = {
				dream: resolvedDream,
				signal: resolvedSignal
			};
		}

		return resolved;
	}

	// Re-renders the panel mode from the current store snapshot.
	private Update(): void
	{
		if (this.mode === "catalogue")
		{
			this.root.innerHTML = this.RenderCatalogue();
		}
		else
		{
			const draft = this.store.GetDraft();

			if (draft === null)
			{
				this.root.replaceChildren();
			}
			else if (this.store.GetView() === "suggestions")
			{
				this.root.innerHTML = this.RenderSuggestionsBrowser(draft);
			}
			else if (this.store.GetView() === "signals")
			{
				this.root.innerHTML = this.RenderSignalBrowser(draft);
			}
			else
			{
				this.root.innerHTML = this.RenderEditor(draft);
			}
		}
	}

	// Renders the Dreams-style flat Ideas catalogue.
	private RenderCatalogue(): string
	{
		const pendingReference = this.store.GetPendingAddReference();
		const cancel = pendingReference === null
			? ""
			: `<button class="catalogue-header-button button-control" data-cancel-add-to-idea type="button" title="Cancel Add to Idea" aria-label="Cancel Add to Idea">${CloseIcon}</button>`;
		const markup = `<section class="idea-catalogue dream-catalogue left-tab-panel"><div class="dream-catalogue-controls"><label class="dream-search">${SearchIcon}<input data-idea-search type="search" aria-label="Search Ideas" placeholder="Search ideas..." value="${EscapeHtml(this.store.GetCatalogueSearch())}"></label><button class="catalogue-header-button button-control" data-new-idea type="button" title="New Idea" aria-label="New Idea">${AddIcon}</button>${cancel}</div><div class="dream-catalogue-list idea-catalogue-list">${this.RenderCatalogueContent()}</div></section>`;

		return markup;
	}

	// Renders matching Ideas as one ungrouped catalogue list.
	private RenderCatalogueContent(): string
	{
		const ideas = this.store.GetIdeas();
		const search = this.NormalizeSearch(this.store.GetCatalogueSearch());
		let content = search.length > 0
			? `<p class="dream-empty">No matching Ideas.</p>`
			: `<p class="dream-empty">No Ideas yet.</p>`;
		let rows = "";

		for (const idea of ideas)
		{
			if (this.MatchesIdeaSearch(idea, search))
			{
				rows += this.RenderCatalogueItem(idea);
			}
		}

		if (rows.length > 0)
		{
			content = rows;
		}

		return content;
	}

	// Renders one Idea using the established Dreams catalogue row.
	private RenderCatalogueItem(idea: IdeaRecord): string
	{
		const draft = this.store.GetDraft();
		const pendingReference = this.store.GetPendingAddReference();
		const isActive = draft?.ideaId === idea.id;
		const isConnected = pendingReference !== null && this.ContainsSignal(idea, pendingReference);
		const count = idea.relatedSignals.length + 1;
		const countLabel = count === 1
			? "1 Signal"
			: `${count} Signals`;
		const location = isConnected
			? `${countLabel} · Connected`
			: countLabel;
		const disabled = isConnected
			? " disabled"
			: "";
		const title = idea.title || "Untitled Idea";
		const markup = `<button class="catalogue-item button-control${isActive ? " selected" : ""}" type="button" data-idea-id="${EscapeHtml(idea.id)}" aria-current="${isActive ? "true" : "false"}"${disabled}><span class="catalogue-item-copy"><strong>${EscapeHtml(NormalizeDisplayText(title))}</strong><span class="catalogue-location">${location}</span></span></button>`;

		return markup;
	}

	// Determines whether one Idea matches the current catalogue query.
	private MatchesIdeaSearch(idea: IdeaRecord, search: string): boolean
	{
		let searchable = `${idea.title} ${idea.content}`;
		const references = [idea.originSignal, ...idea.relatedSignals];

		for (const reference of references)
		{
			const resolved = this.ResolveSignal(reference);

			if (resolved !== null)
			{
				const locator = this.CreateSignalLocator(resolved.signal);
				searchable += ` ${resolved.dream.title} ${resolved.dream.dialogue ?? resolved.dream.workId} ${resolved.signal.text} ${resolved.signal.description} ${locator}`;
			}
		}

		const normalized = this.NormalizeSearch(searchable);
		const matches = search.length === 0 || normalized.includes(search);

		return matches;
	}

	// Renders the active Idea editor.
	private RenderEditor(draft: IdeaDraft): string
	{
		const signals = this.RenderConnectedSignals(draft);
		const canSave = draft.originSignal !== null && draft.relatedSignals.length >= 2;
		const saveDisabled = canSave
			? ""
			: " disabled";
		const isSaved = this.store.HasIdea(draft.ideaId);
		const deleteMarkup = isSaved
			? `<button class="dream-icon-button button-control idea-delete-button" data-delete-idea type="button" title="Delete Idea" aria-label="Delete Idea">${TrashIcon}</button>`
			: "";
		const error = this.store.GetError();
		const errorMarkup = error === null
			? ""
			: `<p class="idea-error" role="alert">${EscapeHtml(error)}</p>`;
		const escapedTitle = EscapeHtml(NormalizeDisplayText(draft.title));
		const escapedContent = EscapeHtml(NormalizeDisplayText(draft.content));
		const findDisabled = draft.title.trim().length === 0 && draft.content.trim().length === 0
			? " disabled"
			: "";
		const status = isSaved
			? "Saved Idea"
			: "Draft · Not saved";
		const markup = `<section class="idea-panel idea-editor-panel"><div class="idea-workspace"><section class="idea-editor" aria-label="Idea draft"><section class="idea-interpretation"><label><span>Title</span><input data-idea-title value="${escapedTitle}" placeholder="Name this Idea"></label><label><span>Describe the Idea</span><textarea data-idea-content rows="6" placeholder="What is the Idea, and why does it matter?">${escapedContent}</textarea></label></section><section class="idea-signals-section" aria-labelledby="idea-signals-heading"><header><h3 id="idea-signals-heading">Signals</h3><div class="idea-signal-actions"><button class="dream-icon-button button-control" data-find-signals type="button" title="Find Signals" aria-label="Find Signals"${findDisabled}>${SearchIcon}</button><button class="dream-icon-button button-control" data-open-signal-browser type="button" title="Add Signal" aria-label="Add Signal">${AddIcon}</button></div></header>${signals}</section>${errorMarkup}<footer class="idea-editor-actions"><span class="idea-draft-status">${status}</span><div>${deleteMarkup}<button class="button-control idea-view-action" data-cancel-idea type="button">Close</button><button class="dream-icon-button button-control idea-save-button" data-save-idea type="button" title="Save Idea" aria-label="Save Idea"${saveDisabled}>${SaveIcon}</button></div></footer></section></div></section>`;

		return markup;
	}

	// Renders every Signal connected to the Idea in one visual list.
	private RenderConnectedSignals(draft: IdeaDraft): string
	{
		let items = "";

		if (draft.originSignal !== null)
		{
			const originSummary = this.RenderSignalSummary(draft.originSignal);
			items += `<section class="signal-item"><div class="signal-header"><button class="signal-row button-control" data-view-origin-signal type="button">${originSummary}</button></div></section>`;
		}

		let index = 0;

		for (const reference of draft.relatedSignals)
		{
			const summary = this.RenderSignalSummary(reference);
			items += `<section class="signal-item"><div class="signal-header"><button class="signal-row button-control" data-view-connected-signal="${index}" type="button">${summary}</button><button class="dream-icon-button button-control" data-remove-connected-signal="${index}" type="button" aria-label="Remove this Signal" title="Remove Signal">${CloseIcon}</button></div></section>`;
			index += 1;
		}

		const markup = items.length > 0
			? `<div class="signal-list">${items}</div>`
			: `<div class="signal-list"></div>`;

		return markup;
	}

	// Renders the searchable browser used to connect several existing Signals.
	private RenderSignalBrowser(draft: IdeaDraft): string
	{
		const search = EscapeHtml(this.store.GetSignalSearch());
		const results = this.RenderAvailableSignals(draft);
		const markup = `<section class="idea-panel idea-editor-panel"><header class="idea-editor-header"><h2>Add Signals</h2><button class="button-control idea-view-action" data-show-idea-editor type="button">Done</button></header><div class="idea-signal-browser"><label class="application-find">${SearchIcon}<input data-signal-search type="search" aria-label="Search Signals" placeholder="Search signals..." value="${search}"></label><div class="signal-list idea-signal-browser-results" data-signal-results>${results}</div></div></section>`;

		return markup;
	}

	// Renders model-assisted suggestions with their required explanations.
	private RenderSuggestionsBrowser(draft: IdeaDraft): string
	{
		const state = this.store.GetDiscoveryState();
		const suggestions = this.store.GetSuggestions();
		let results = "";

		if (state === "loading")
		{
			results = `<p class="dream-empty" role="status">Finding Signals...</p>`;
		}
		else if (state === "error")
		{
			results = `<p class="idea-error" role="alert">Unable to find Signals with the model. Manual search remains available.</p>`;
		}
		else if (suggestions.length === 0)
		{
			results = `<p class="dream-empty" role="status">No strong Signal connections found.</p>`;
		}
		else
		{
			for (const suggestion of suggestions)
			{
				results += this.RenderSuggestion(draft, suggestion);
			}
		}

		const markup = `<section class="idea-panel idea-editor-panel"><header class="idea-editor-header"><h2>Find Signals</h2><button class="button-control idea-view-action" data-show-idea-editor type="button">Done</button></header><div class="signal-list idea-signal-browser-results">${results}</div></section>`;

		return markup;
	}

	// Renders one existing suggested Signal with a concise model rationale.
	private RenderSuggestion(draft: IdeaDraft, suggestion: IdeaDiscoverySuggestion): string
	{
		const resolved = this.ResolveSignal(suggestion.reference);
		let markup = "";

		if (resolved !== null)
		{
			const dream = resolved.dream;
			const signal = resolved.signal;
			const isConnected = this.ContainsDraftSignal(draft, suggestion.reference);
			const state = isConnected
				? "Connected"
				: "Add";
			const disabled = isConnected
				? " disabled"
				: "";
			const locator = this.CreateSignalLocator(signal);
			const context = `${dream.title || "Untitled Dream"} · ${dream.dialogue ?? dream.workId} · ${locator}`;
			const dreamId = EscapeHtml(dream.id);
			const signalId = EscapeHtml(signal.id);
			const escapedState = EscapeHtml(state);
			const rationale = EscapeHtml(NormalizeDisplayText(suggestion.rationale));
			markup = `<section class="signal-item idea-suggestion"><div class="signal-header"><button class="signal-row button-control" data-view-available="${dreamId}" data-signal-id="${signalId}" type="button"><strong class="signal-heading">${EscapeHtml(NormalizeDisplayText(signal.text))}<span>${EscapeHtml(NormalizeDisplayText(context))}</span></strong></button><button class="dream-icon-button button-control" data-add-available="${dreamId}" data-signal-id="${signalId}" type="button" title="${escapedState}" aria-label="${escapedState}"${disabled}>${AddIcon}</button></div><p class="idea-suggestion-rationale">${rationale}</p></section>`;
		}

		return markup;
	}

	// Renders every matching Signal from the active work as one flat list.
	private RenderAvailableSignals(draft: IdeaDraft): string
	{
		const dreams = this.dreams.GetCatalogue();
		const search = this.NormalizeSearch(this.store.GetSignalSearch());
		let results = "";

		for (const dream of dreams)
		{
			if (dream.workId === draft.workId)
			{
				for (const signal of dream.signals)
				{
					if (this.MatchesSignalSearch(dream, signal, search))
					{
						results += this.RenderAvailableSignal(draft, dream, signal);
					}
				}
			}
		}

		if (results.length === 0)
		{
			results = `<p class="dream-empty">No matching Signals.</p>`;
		}

		return results;
	}

	// Renders one Signal-browser row with separate inspection and connection actions.
	private RenderAvailableSignal(draft: IdeaDraft, dream: Dream, signal: DreamSignal): string
	{
		const reference: IdeaSignalReference = {
			dreamId: dream.id,
			signalId: signal.id
		};
		const isConnected = this.ContainsDraftSignal(draft, reference);
		const state = isConnected
			? "Connected"
			: "Add";
		const disabled = isConnected
			? " disabled"
			: "";
		const locator = this.CreateSignalLocator(signal);
		const context = `${dream.title || "Untitled Dream"} · ${dream.dialogue ?? dream.workId} · ${locator}`;
		const dreamId = EscapeHtml(dream.id);
		const signalId = EscapeHtml(signal.id);
		const escapedState = EscapeHtml(state);
		const markup = `<section class="signal-item"><div class="signal-header"><button class="signal-row button-control" data-view-available="${dreamId}" data-signal-id="${signalId}" type="button"><strong class="signal-heading">${EscapeHtml(NormalizeDisplayText(signal.text))}<span>${EscapeHtml(NormalizeDisplayText(context))}</span></strong></button><button class="dream-icon-button button-control" data-add-available="${dreamId}" data-signal-id="${signalId}" type="button" title="${escapedState}" aria-label="${escapedState}"${disabled}>${AddIcon}</button></div></section>`;

		return markup;
	}

	// Determines whether one Signal matches the current browser query.
	private MatchesSignalSearch(dream: Dream, signal: DreamSignal, search: string): boolean
	{
		const locator = this.CreateSignalLocator(signal);
		const searchable = `${dream.title} ${dream.dialogue ?? dream.workId} ${signal.text} ${signal.description} ${locator}`;
		const normalized = this.NormalizeSearch(searchable);
		const matches = search.length === 0 || normalized.includes(search);

		return matches;
	}

	// Identifies whether one Signal is already connected to the active draft.
	private ContainsDraftSignal(draft: IdeaDraft, reference: IdeaSignalReference): boolean
	{
		const identity = this.CreateReferenceIdentity(reference);
		const originIdentity = draft.originSignal === null
			? null
			: this.CreateReferenceIdentity(draft.originSignal);
		let isIncluded = identity === originIdentity;

		for (const candidate of draft.relatedSignals)
		{
			const candidateIdentity = this.CreateReferenceIdentity(candidate);

			if (candidateIdentity === identity)
			{
				isIncluded = true;
			}
		}

		return isIncluded;
	}

	// Renders identifying Signal context without duplicating its observation.
	private RenderSignalSummary(reference: IdeaSignalReference): string
	{
		const resolved = this.ResolveSignal(reference);
		const title = resolved?.dream.title || "Untitled Dream";
		const dialogue = resolved?.dream.dialogue ?? resolved?.dream.workId ?? "Source";
		const signal = resolved?.signal;
		const locator = this.CreateSignalLocator(signal);
		const signalText = signal?.text ?? "Missing Signal";
		const markup = `<strong class="signal-heading">${EscapeHtml(NormalizeDisplayText(signalText))}<span>${EscapeHtml(NormalizeDisplayText(title))} &middot; ${EscapeHtml(NormalizeDisplayText(dialogue))} &middot; ${EscapeHtml(locator)}</span></strong>`;

		return markup;
	}

	// Returns the most precise displayed source location for one Signal.
	private CreateSignalLocator(signal: DreamSignal | undefined): string
	{
		const start = signal?.selection.locatorStart?.value ?? null;
		const end = signal?.selection.locatorEnd?.value ?? null;
		let locator = "Source";

		if (start !== null && end !== null && start !== end)
		{
			locator = `${start}-${end}`;
		}
		else if (start !== null)
		{
			locator = start;
		}
		else if (end !== null)
		{
			locator = end;
		}

		return locator;
	}

	// Determines whether one durable Idea already contains one Signal.
	private ContainsSignal(idea: IdeaRecord, reference: IdeaSignalReference): boolean
	{
		const identity = this.CreateReferenceIdentity(reference);
		const originIdentity = this.CreateReferenceIdentity(idea.originSignal);
		let isIncluded = identity === originIdentity;

		for (const candidate of idea.relatedSignals)
		{
			const candidateIdentity = this.CreateReferenceIdentity(candidate);

			if (candidateIdentity === identity)
			{
				isIncluded = true;
			}
		}

		return isIncluded;
	}

	// Creates the stable identity used to compare Signal references.
	private CreateReferenceIdentity(reference: IdeaSignalReference): string
	{
		const identity = `signal:${reference.dreamId}:${reference.signalId}`;

		return identity;
	}

	// Normalizes user-authored text for case-insensitive catalogue matching.
	private NormalizeSearch(value: string): string
	{
		const normalized = value.normalize("NFC").trim().toLocaleLowerCase();

		return normalized;
	}

	// Routes input changes to catalogue filtering, Signal filtering, or draft editing.
	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;

		if (target?.matches("[data-idea-search]") === true)
		{
			this.store.SetCatalogueSearch(target.value);
			const list = this.root.querySelector<HTMLElement>(".idea-catalogue-list");

			if (list !== null)
			{
				list.innerHTML = this.RenderCatalogueContent();
			}
		}
		else if (target?.matches("[data-signal-search]") === true)
		{
			this.controller.UpdateSignalSearch(target.value);
			const draft = this.store.GetDraft();
			const results = this.root.querySelector<HTMLElement>("[data-signal-results]");

			if (draft !== null && results !== null)
			{
				results.innerHTML = this.RenderAvailableSignals(draft);
			}
		}
		else
		{
			const title = this.root.querySelector<HTMLInputElement>("[data-idea-title]");
			const content = this.root.querySelector<HTMLTextAreaElement>("[data-idea-content]");

			if (title !== null && content !== null)
			{
				this.controller.Update(title.value, content.value);
			}
		}
	}

	// Routes delegated browser clicks into typed Idea workflows.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;

		if (target !== null)
		{
			const ideaId = target.closest<HTMLElement>("[data-idea-id]")?.dataset.ideaId;
			const availableView = target.closest<HTMLElement>("[data-view-available]");
			const availableAdd = target.closest<HTMLElement>("[data-add-available]");
			const connectedView = target.closest<HTMLElement>("[data-view-connected-signal]");
			const connectedRemoval = target.closest<HTMLElement>("[data-remove-connected-signal]");

			if (ideaId !== undefined)
			{
				const pendingReference = this.store.GetPendingAddReference();

				if (pendingReference === null)
				{
					this.controller.Edit(ideaId);
				}
				else
				{
					const addition = this.controller.AddPendingSignalToIdeaAsync(ideaId);
					void addition;
				}
			}
			if (target.closest("[data-new-idea]") !== null)
			{
				const pendingReference = this.store.GetPendingAddReference();
				const creation = pendingReference === null
					? this.controller.CreateAsync()
					: this.controller.CreateIdeaFromPendingSignalAsync();
				void creation;
			}
			if (target.closest("[data-cancel-add-to-idea]") !== null)
			{
				this.controller.CancelAddToIdea();
			}
			if (target.closest("[data-open-signal-browser]") !== null)
			{
				this.controller.OpenSignalBrowser();
			}
			if (target.closest("[data-find-signals]") !== null)
			{
				const discovery = this.controller.FindSignalsAsync();
				void discovery;
			}
			if (target.closest("[data-cancel-idea]") !== null)
			{
				this.controller.CancelEdit();
			}
			if (target.closest("[data-show-idea-editor]") !== null)
			{
				this.controller.ShowEditor();
			}
			if (target.closest("[data-view-origin-signal]") !== null)
			{
				const reference = this.store.GetDraft()?.originSignal;

				if (reference !== null && reference !== undefined)
				{
					const opening = this.controller.ViewSignalAsync(reference);
					void opening;
				}
			}
			if (connectedView?.dataset.viewConnectedSignal !== undefined)
			{
				const index = Number.parseInt(connectedView.dataset.viewConnectedSignal, 10);
				const reference = this.store.GetDraft()?.relatedSignals[index];

				if (reference !== undefined)
				{
					const opening = this.controller.ViewSignalAsync(reference);
					void opening;
				}
			}
			if (availableView !== null)
			{
				const dreamId = availableView.dataset.viewAvailable;
				const signalId = availableView.dataset.signalId;

				if (dreamId !== undefined && signalId !== undefined)
				{
					const opening = this.controller.ViewSignalAsync({ dreamId, signalId });
					void opening;
				}
			}
			if (availableAdd !== null && !availableAdd.hasAttribute("disabled"))
			{
				const dreamId = availableAdd.dataset.addAvailable;
				const signalId = availableAdd.dataset.signalId;

				if (dreamId !== undefined && signalId !== undefined)
				{
					this.controller.AddSignal({ dreamId, signalId });
				}
			}
			if (connectedRemoval?.dataset.removeConnectedSignal !== undefined)
			{
				const index = Number.parseInt(connectedRemoval.dataset.removeConnectedSignal, 10);
				this.controller.RemoveRelatedSignal(index);
			}
			if (target.closest("[data-save-idea]") !== null)
			{
				const save = this.controller.SaveAsync();
				void save;
			}
			if (target.closest("[data-delete-idea]") !== null)
			{
				const deletion = this.controller.DeleteAsync();
				void deletion;
			}
		}
	}
}
