import type { IdeaDiscoverySuggestion, IdeaRecord, IdeaSignalReference } from "../../shared/ideas/IdeaTypes.js";

// Identifies the visible Ideas editor surface.
export type IdeaView = "editor" | "signals" | "suggestions";

// Represents the lifecycle of one model-assisted discovery request.
export type IdeaDiscoveryState = "idle" | "loading" | "complete" | "error";

// Contains non-authoritative renderer state for editing one Idea.
export interface IdeaDraft
{
	// Identifies an existing Idea or remains null until the main process creates it.
	readonly ideaId: string | null;
	// Identifies the work in which the draft is being edited.
	readonly workId: string;
	// Contains the current reader-authored title.
	readonly title: string;
	// Contains the current reader-authored explanation.
	readonly content: string;
	// Identifies the first connected Signal, or remains null for an empty new draft.
	readonly originSignal: IdeaSignalReference | null;
	// Identifies later Signals connected to the thought.
	readonly relatedSignals: readonly IdeaSignalReference[];
}

// Owns all renderer-side Idea state and returns immutable snapshots.
export class IdeaStore
{
	// Identifies the active work.
	private workId: string | null = null;
	// Contains durable Ideas returned by the main process.
	private ideas: readonly IdeaRecord[] = [];
	// Contains the current flat-catalogue search query.
	private catalogueSearch = "";
	// Identifies the visible Ideas editor surface.
	private view: IdeaView = "editor";
	// Contains the current work-wide Signal search query.
	private signalSearch = "";
	// Contains non-authoritative model suggestions awaiting reader acceptance.
	private suggestions: readonly IdeaDiscoverySuggestion[] = [];
	// Tracks the current discovery request state.
	private discoveryState: IdeaDiscoveryState = "idle";
	// Contains the non-authoritative Idea currently being edited.
	private draft: IdeaDraft | null = null;
	// Identifies a Signal waiting for the reader to choose an existing or new Idea.
	private pendingAddReference: IdeaSignalReference | null = null;
	// Contains the current Idea workflow error shown by the editor.
	private error: string | null = null;

	// Replaces all feature state for the active work.
	public SetWork(workId: string, ideas: readonly IdeaRecord[]): void
	{
		const changedWork = this.workId !== workId;
		this.workId = workId;
		this.ideas = structuredClone(ideas);
		this.pendingAddReference = null;
		this.error = null;

		if (changedWork)
		{
			this.catalogueSearch = "";
			this.signalSearch = "";
			this.suggestions = [];
			this.discoveryState = "idle";
			this.draft = null;
			this.view = "editor";
		}
	}

	// Returns the active work identity.
	public GetWorkId(): string | null
	{
		const workId = this.workId;

		return workId;
	}

	// Returns immutable durable Idea records.
	public GetIdeas(): readonly IdeaRecord[]
	{
		const ideas = structuredClone(this.ideas);

		return ideas;
	}

	// Finds one durable Idea by identity.
	public GetIdea(ideaId: string): IdeaRecord | null
	{
		let found: IdeaRecord | null = null;

		for (const idea of this.ideas)
		{
			if (idea.id === ideaId)
			{
				found = structuredClone(idea);
			}
		}

		return found;
	}

	// Determines whether the submitted identity belongs to a durable Idea.
	public HasIdea(ideaId: string | null): boolean
	{
		let hasIdea = false;

		if (ideaId !== null)
		{
			for (const idea of this.ideas)
			{
				if (idea.id === ideaId)
				{
					hasIdea = true;
				}
			}
		}

		return hasIdea;
	}

	// Returns the current flat-catalogue search query.
	public GetCatalogueSearch(): string
	{
		const search = this.catalogueSearch;

		return search;
	}

	// Records the flat-catalogue search query entered by the reader.
	public SetCatalogueSearch(search: string): void
	{
		this.catalogueSearch = search;
	}

	// Returns the visible Ideas editor surface.
	public GetView(): IdeaView
	{
		const view = this.view;

		return view;
	}

	// Returns the current non-authoritative draft.
	public GetDraft(): IdeaDraft | null
	{
		const draft = structuredClone(this.draft);

		return draft;
	}

	// Returns the current work-wide Signal search query.
	public GetSignalSearch(): string
	{
		const search = this.signalSearch;

		return search;
	}

	// Returns immutable model-assisted Signal suggestions.
	public GetSuggestions(): readonly IdeaDiscoverySuggestion[]
	{
		const suggestions = structuredClone(this.suggestions);

		return suggestions;
	}

	// Returns the current discovery request state.
	public GetDiscoveryState(): IdeaDiscoveryState
	{
		const state = this.discoveryState;

		return state;
	}

	// Returns the Signal waiting to be added through the Ideas catalogue.
	public GetPendingAddReference(): IdeaSignalReference | null
	{
		const reference = structuredClone(this.pendingAddReference);

		return reference;
	}

	// Returns the current user-facing workflow error.
	public GetError(): string | null
	{
		const error = this.error;

		return error;
	}

	// Replaces the active draft and reveals the editor surface.
	public SetDraft(draft: IdeaDraft | null): void
	{
		this.draft = structuredClone(draft);
		this.pendingAddReference = null;
		this.signalSearch = "";
		this.suggestions = [];
		this.discoveryState = "idle";
		this.error = null;
		this.view = "editor";
	}

	// Reveals the active Idea editor while preserving its draft.
	public ShowEditor(): void
	{
		this.view = "editor";
	}

	// Reveals the Signal browser while preserving the active draft.
	public ShowSignalBrowser(): void
	{
		if (this.draft !== null)
		{
			this.view = "signals";
			this.signalSearch = "";
		}
	}

	// Reveals model-assisted suggestions while preserving the active draft.
	public ShowSuggestions(): void
	{
		if (this.draft !== null)
		{
			this.view = "suggestions";
		}
	}

	// Replaces the work-wide Signal search query.
	public SetSignalSearch(search: string): void
	{
		if (this.view === "signals")
		{
			this.signalSearch = search;
		}
	}

	// Begins a discovery request and clears prior results.
	public SetDiscoveryLoading(): void
	{
		this.view = "suggestions";
		this.discoveryState = "loading";
		this.suggestions = [];
	}

	// Replaces model suggestions with authoritative existing-Signal references.
	public SetSuggestions(suggestions: readonly IdeaDiscoverySuggestion[]): void
	{
		this.suggestions = structuredClone(suggestions);
		this.discoveryState = "complete";
	}

	// Marks model-assisted discovery unavailable without affecting manual search.
	public SetDiscoveryError(): void
	{
		this.suggestions = [];
		this.discoveryState = "error";
	}

	// Replaces reader-editable text on the active draft.
	public UpdateDraft(title: string, content: string): void
	{
		if (this.draft !== null)
		{
			this.draft = {
				...this.draft,
				title,
				content
			};
		}
	}

	// Connects one distinct Signal, using the first Signal as the internal origin.
	public AddSignal(reference: IdeaSignalReference): void
	{
		if (this.draft !== null)
		{
			const identity = this.CreateReferenceIdentity(reference);
			const originIdentity = this.draft.originSignal === null
				? null
				: this.CreateReferenceIdentity(this.draft.originSignal);
			const relatedSignals: IdeaSignalReference[] = [];
			let isKnown = identity === originIdentity;

			for (const candidate of this.draft.relatedSignals)
			{
				const candidateIdentity = this.CreateReferenceIdentity(candidate);
				const clonedCandidate = structuredClone(candidate);
				relatedSignals.push(clonedCandidate);

				if (candidateIdentity === identity)
				{
					isKnown = true;
				}
			}

			if (this.draft.originSignal === null)
			{
				this.draft = {
					...this.draft,
					originSignal: structuredClone(reference)
				};
			}
			else if (!isKnown)
			{
				relatedSignals.push(structuredClone(reference));
				this.draft = {
					...this.draft,
					relatedSignals
				};
			}
		}
	}

	// Removes one later connected Signal by its displayed position.
	public RemoveRelatedSignal(index: number): void
	{
		if (this.draft !== null)
		{
			const relatedSignals: IdeaSignalReference[] = [];
			let candidateIndex = 0;

			for (const reference of this.draft.relatedSignals)
			{
				if (candidateIndex !== index)
				{
					relatedSignals.push(reference);
				}

				candidateIndex += 1;
			}

			this.draft = {
				...this.draft,
				relatedSignals
			};
		}
	}

	// Begins the workflow for attaching one Signal through the normal Ideas catalogue.
	public BeginAddToIdea(reference: IdeaSignalReference): void
	{
		this.pendingAddReference = structuredClone(reference);
		this.error = null;
	}

	// Cancels the pending Add to Idea workflow.
	public CancelPendingAdd(): void
	{
		this.pendingAddReference = null;
	}

	// Replaces one durable Idea with the authoritative saved record.
	public ReplaceSaved(saved: IdeaRecord): void
	{
		const ideas: IdeaRecord[] = [];

		for (const idea of this.ideas)
		{
			if (idea.id !== saved.id)
			{
				ideas.push(idea);
			}
		}

		ideas.push(structuredClone(saved));
		this.ideas = ideas;

		if (this.draft !== null && this.draft.ideaId === saved.id)
		{
			this.draft = this.CreateDraft(saved);
		}

		this.error = null;
	}

	// Removes one durable Idea and its active draft.
	public RemoveIdea(ideaId: string): void
	{
		const ideas: IdeaRecord[] = [];

		for (const idea of this.ideas)
		{
			if (idea.id !== ideaId)
			{
				ideas.push(idea);
			}
		}

		this.ideas = ideas;

		if (this.draft !== null && this.draft.ideaId === ideaId)
		{
			this.draft = null;
			this.view = "editor";
		}
	}

	// Records a user-facing Idea persistence or attachment error.
	public SetError(message: string): void
	{
		this.error = message;
	}

	// Converts one authoritative Idea record into a renderer-owned draft.
	public CreateDraft(record: IdeaRecord): IdeaDraft
	{
		const draft: IdeaDraft = {
			ideaId: record.id,
			workId: record.workId,
			title: record.title,
			content: record.content,
			originSignal: structuredClone(record.originSignal),
			relatedSignals: structuredClone(record.relatedSignals)
		};

		return draft;
	}

	// Creates the stable identity used to compare Signal references.
	private CreateReferenceIdentity(reference: IdeaSignalReference): string
	{
		const identity = `signal:${reference.dreamId}:${reference.signalId}`;

		return identity;
	}
}
