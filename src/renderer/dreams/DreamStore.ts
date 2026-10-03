import type { Dream, DreamSignal, DreamResonance, ResonanceTarget, SourceSelection } from "../../shared/dreams/DreamTypes.js";
import { SessionStore } from "../core/session/SessionStore.js";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";
import type { TextSelection } from "../../shared/library/SelectionTypes.js";
import { DreamMarkdownDocument } from "../../shared/dreams/DreamMarkdownDocument.js";

interface DreamMarkdownDraft
{
	markdown: string;
	appliedMarkdown: string;
	baseline: Dream;
}

// A resonance anchored to a displayed passage, with enough context to return to its originating signal.
export interface ResonanceHit
{
	readonly dreamId: string;
	readonly dreamTitle: string;
	readonly signalId: string;
	readonly signalText: string;
	readonly note: string;
}

// Signal and resonance currently armed to receive an attached passage.
export interface ArmedResonanceAttach
{
	readonly signalId: string;
	readonly resonanceId: string;
}

// Identifies the source passage restricting the Dream catalogue.
export interface DreamPassageFilter
{
	// Owning document, preventing collisions between works.
	readonly workId: string;
	// First segment of the displayed passage.
	readonly segmentKey: string;
	// Work and locator label presented to the reader.
	readonly label: string;
}

// Lifecycle of the active Dream's most recent save attempt.
export type DreamSaveState = "idle" | "saving" | "error";

// Session-persisted snapshot of the active Dream editing session.
interface DreamSessionSnapshot
{
	// The active Dream at the time of the snapshot.
	dream: Dream;
	// Whether the active Dream had unsaved changes at the time of the snapshot.
	isDirty: boolean;
	markdownDraft?: DreamMarkdownDraft | null;
}

// Result of a named mutation to the active Dream.
export interface DreamChange
{
	// Immutable snapshot after the mutation.
	readonly dream: Dream;
	// Whether the mutation changed the dirty-state transition.
	readonly becameDirty: boolean;
}

// Sole renderer-side owner of Dream catalogue and active-Dream editing state.
export class DreamStore
{
	// Session storage key for the active Dream editing session.
	private static readonly SessionKey = "chora:dream-session";
	// Delay before an uncommitted mutation is persisted to session storage.
	private static readonly PersistenceDelayMilliseconds = 400;
	// All Dreams visible to the reader.
	private catalogue: Dream[] = [];
	// The Dream currently open for editing, or null when none is open.
	private activeDream: Dream | null = null;
	// Whether the active Dream has unsaved changes.
	private isDirty = false;
	// Increments on every mutation so a stale save result can be detected.
	private revision = 0;
	// Lifecycle of the active Dream's most recent save attempt.
	private saveState: DreamSaveState = "idle";
	// Pending session-persistence timer, or null when nothing is scheduled.
	private persistenceTimer: ReturnType<typeof setTimeout> | null = null;
	// Catalogue search query entered by the reader.
	private searchText = "";
	// Optional source-passage restriction, independent of keyword search.
	private passageFilter: DreamPassageFilter | null = null;
	// Signal and resonance currently armed to receive an attached passage, or null when none is armed.
	private armedResonanceAttach: ArmedResonanceAttach | null = null;
	private markdownDraft: DreamMarkdownDraft | null = null;

	// Returns a snapshot of the active source restriction.
	public GetPassageFilter(): DreamPassageFilter | null
	{
		const filter = structuredClone(this.passageFilter);
		return filter;
	}

	// Changes the source restriction without changing the active editor.
	public SetPassageFilter(filter: DreamPassageFilter | null): void
	{
		this.passageFilter = structuredClone(filter);
	}

	// Restores the active Dream editing session from a prior application run.
	public constructor(private readonly sessions: SessionStore)
	{
		const snapshot = this.sessions.Load<DreamSessionSnapshot>(DreamStore.SessionKey);

		if (snapshot !== null)
		{
			this.SetActiveDream(snapshot.dream);
			this.isDirty = snapshot.isDirty;
			this.markdownDraft = snapshot.markdownDraft ?? null;
		}
	}

	// Returns the current catalogue search query.
	public GetSearchText(): string
	{
		return this.searchText;
	}

	// Records the catalogue search query entered by the reader.
	public SetSearchText(value: string): void
	{
		this.searchText = value;
	}

	// Returns an immutable snapshot of every Dream visible to the reader.
	public GetCatalogue(): readonly Dream[]
	{
		const catalogue = structuredClone(this.catalogue);

		return catalogue;
	}

	// Returns Dreams matching the given search query, ordered by their position in the source text.
	public GetVisibleCatalogue(searchText: string, document: LibraryText | null = null): Dream[]
	{
		const query = searchText.trim().toLocaleLowerCase();
		const matches: Dream[] = [];
		let candidates: readonly Dream[] = this.catalogue;

		if (this.passageFilter !== null)
		{
			candidates = [];
			if (document !== null && document.id === this.passageFilter.workId)
			{
				const passages = this.BuildPassageCatalogue(document);
				candidates = passages.get(this.passageFilter.segmentKey) ?? [];
			}
		}

		for (const dream of candidates)
		{
			const matchesWork = document === null || dream.workId === document.id;
			if (matchesWork && this.MatchesSearch(dream, query)) matches.push(structuredClone(dream));
		}

		matches.sort(this.CompareBySource.bind(this));

		return matches;
	}

	// Counts each Dream once per passage, independently of the active search or filter.
	public GetPassageCounts(document: LibraryText): ReadonlyMap<string, number>
	{
		const passages = this.BuildPassageCatalogue(document);
		const counts = new Map<string, number>();
		for (const [key, dreams] of passages)
		{
			counts.set(key, dreams.length);
		}
		return counts;
	}

	// Counts resonance targets once per passage, across every reader Dream, for the given document.
	public GetResonancePassageCounts(document: LibraryText): ReadonlyMap<string, number>
	{
		const hits = this.BuildResonancePassageCatalogue(document);
		const counts = new Map<string, number>();
		for (const [key, resonanceHits] of hits)
		{
			counts.set(key, resonanceHits.length);
		}
		return counts;
	}

	// Returns the resonance hits anchored to one displayed passage, or an empty list when none target it.
	public GetResonanceHitsAt(document: LibraryText, segmentKey: string): readonly ResonanceHit[]
	{
		const hits = this.BuildResonancePassageCatalogue(document);
		return hits.get(segmentKey) ?? [];
	}

	// Adds a resonance to one signal owned by the active Dream.
	public AddResonance(signalId: string, resonance: DreamResonance): DreamChange | null
	{
		let change: DreamChange | null = null;
		const signal = this.FindActiveSignal(signalId);

		if (signal !== undefined)
		{
			signal.resonances.push(structuredClone(resonance));
			change = this.RecordChange();
		}

		return change;
	}

	// Updates one resonance's note.
	public UpdateResonanceNote(signalId: string, resonanceId: string, note: string): DreamChange | null
	{
		let change: DreamChange | null = null;
		const resonance = this.FindActiveResonance(signalId, resonanceId);

		if (resonance !== undefined)
		{
			resonance.note = note;
			resonance.updatedAt = new Date().toISOString();
			change = this.RecordChange();
		}

		return change;
	}

	// Removes one resonance from a signal owned by the active Dream.
	public RemoveResonance(signalId: string, resonanceId: string): DreamChange | null
	{
		let change: DreamChange | null = null;
		const signal = this.FindActiveSignal(signalId);

		if (signal !== undefined)
		{
			const index = signal.resonances.findIndex((candidate) => candidate.id === resonanceId);
			if (index >= 0)
			{
				signal.resonances.splice(index, 1);
				change = this.RecordChange();
			}
		}

		return change;
	}

	// Attaches a passage target to one resonance, ignoring an exact duplicate.
	public AttachResonanceTarget(signalId: string, resonanceId: string, target: ResonanceTarget): DreamChange | null
	{
		let change: DreamChange | null = null;
		const resonance = this.FindActiveResonance(signalId, resonanceId);

		if (resonance !== undefined)
		{
			const hasTarget = resonance.targets.some((existing) => existing.id === target.id);
			if (!hasTarget)
			{
				resonance.targets.push(structuredClone(target));
				resonance.updatedAt = new Date().toISOString();
				change = this.RecordChange();
			}
		}

		return change;
	}

	// Removes one attached target from a resonance, retaining the resonance itself.
	public RemoveResonanceTarget(signalId: string, resonanceId: string, targetId: string): DreamChange | null
	{
		let change: DreamChange | null = null;
		const resonance = this.FindActiveResonance(signalId, resonanceId);

		if (resonance !== undefined)
		{
			const index = resonance.targets.findIndex((target) => target.id === targetId);
			if (index >= 0)
			{
				resonance.targets.splice(index, 1);
				resonance.updatedAt = new Date().toISOString();
				change = this.RecordChange();
			}
		}

		return change;
	}

	// Arms one resonance to receive the reader's next attached passage selection.
	public ArmResonanceAttach(signalId: string, resonanceId: string): void
	{
		this.armedResonanceAttach = { signalId, resonanceId };
	}

	// Returns the resonance currently armed to receive an attached passage, or null when none is armed.
	public GetArmedResonanceAttach(): ArmedResonanceAttach | null
	{
		return this.armedResonanceAttach === null ? null : { ...this.armedResonanceAttach };
	}

	// Clears any armed resonance-attach request.
	public ClearArmedResonanceAttach(): void
	{
		this.armedResonanceAttach = null;
	}

	// Finds a signal owned by the active Dream, or undefined when it is not present.
	private FindActiveSignal(signalId: string): DreamSignal | undefined
	{
		const signal = this.activeDream?.signals.find((candidate) => candidate.id === signalId);

		return signal;
	}

	// Finds a resonance owned by a signal of the active Dream, or undefined when it is not present.
	private FindActiveResonance(signalId: string, resonanceId: string): DreamResonance | undefined
	{
		const signal = this.FindActiveSignal(signalId);
		const resonance = signal?.resonances.find((candidate) => candidate.id === resonanceId);

		return resonance;
	}

	// Resolves segment positions and passage-grouping keys once per document, shared by every passage-coverage query.
	private BuildPassageIndex(document: LibraryText): { positions: Map<string, number>; passageKeys: string[] }
	{
		const positions = new Map<string, number>();
		const passageKeys: string[] = [];
		let previousLocator = "";
		let passageKey = "";
		for (const [index, segment] of document.segments.entries())
		{
			positions.set(segment.key, index);
			const locator = segment.locator;
			const identity = locator === null ? "" : `${locator.scheme}:${locator.value}`;
			if (identity !== previousLocator)
			{
				passageKey = identity.length === 0 ? "" : segment.key;
				previousLocator = identity;
			}
			passageKeys.push(passageKey);
		}
		return { positions, passageKeys };
	}

	// Returns the passage keys covered by a start/end segment range, or an empty set when the range cannot be resolved.
	private ComputeCoveredPassageKeys(document: LibraryText, positions: Map<string, number>, passageKeys: string[], start: TextSelection["start"], end: TextSelection["end"]): Set<string>
	{
		const covered = new Set<string>();
		const startIndex = positions.get(start.segmentKey);
		const endIndex = positions.get(end.segmentKey);
		if (startIndex !== undefined && endIndex !== undefined && startIndex <= endIndex)
		{
			for (let index = startIndex; index <= endIndex; index += 1)
			{
				const segment = document.segments[index];
				const key = passageKeys[index];
				if (segment !== undefined && key !== undefined && key.length > 0)
				{
					const from = index === startIndex ? start.offset : 0;
					const to = index === endIndex ? end.offset : segment.text.length;
					if (from < to && from >= 0 && to <= segment.text.length)
					{
						covered.add(key);
					}
				}
			}
		}
		return covered;
	}

	// Resolves persisted source anchors in document order and groups their nonempty overlap by passage.
	private BuildPassageCatalogue(document: LibraryText): Map<string, Dream[]>
	{
		const { positions, passageKeys } = this.BuildPassageIndex(document);
		const passages = new Map<string, Dream[]>();

		for (const dream of this.catalogue)
		{
			const source = dream.source;
			if (dream.workId === document.id && source.documentId === document.id)
			{
				const covered = this.ComputeCoveredPassageKeys(document, positions, passageKeys, source.start, source.end);
				for (const key of covered)
				{
					const dreams = passages.get(key) ?? [];
					dreams.push(dream);
					passages.set(key, dreams);
				}
			}
		}
		return passages;
	}

	// Resolves every resonance target in document order and groups its nonempty overlap by passage.
	private BuildResonancePassageCatalogue(document: LibraryText): Map<string, ResonanceHit[]>
	{
		const { positions, passageKeys } = this.BuildPassageIndex(document);
		const hits = new Map<string, ResonanceHit[]>();

		for (const dream of this.catalogue)
		{
			for (const signal of dream.signals)
			{
				for (const resonance of signal.resonances)
				{
					for (const target of resonance.targets)
					{
						if (target.workId === document.id && target.selection.documentId === document.id)
						{
							const covered = this.ComputeCoveredPassageKeys(document, positions, passageKeys, target.selection.start, target.selection.end);
							for (const key of covered)
							{
								const list = hits.get(key) ?? [];
								list.push({ dreamId: dream.id, dreamTitle: dream.title, signalId: signal.id, signalText: signal.text, note: resonance.note });
								hits.set(key, list);
							}
						}
					}
				}
			}
		}
		return hits;
	}

	// Returns an immutable snapshot of the active Dream, or null when none is open.
	public GetActiveDream(): Dream | null
	{
		const dream = this.activeDream === null ? null : structuredClone(this.activeDream);

		return dream;
	}

	// Returns whether the active Dream has unsaved changes.
	public GetIsDirty(): boolean
	{
		const dirty = this.isDirty || (this.markdownDraft !== null && this.markdownDraft.markdown !== this.markdownDraft.appliedMarkdown);
		return dirty;
	}

	public GetMarkdownDraft(): string | null
	{
		const markdown = this.markdownDraft?.markdown ?? null;
		return markdown;
	}

	public BeginMarkdownEditing(): void
	{
		if (this.activeDream !== null && this.markdownDraft === null)
		{
			const markdown = DreamMarkdownDocument.Serialize(this.activeDream);
			this.markdownDraft = { markdown, appliedMarkdown: markdown, baseline: structuredClone(this.activeDream) };
			this.Persist();
		}
	}

	public UpdateMarkdownDraft(markdown: string): void
	{
		if (this.markdownDraft !== null)
		{
			this.markdownDraft.markdown = markdown;
			this.revision += 1;
			this.saveState = "idle";
			this.Persist();
		}
	}

	public GetMarkdownError(): string | null
	{
		let message: string | null = null;
		try
		{
			this.ScanMarkdownDraft();
		}
		catch (error)
		{
			message = error instanceof Error ? error.message : "Invalid Dream Markdown.";
		}
		return message;
	}

	public ApplyMarkdownDraft(): boolean
	{
		let changed = false;
		const scanned = this.ScanMarkdownDraft();
		if (scanned !== null && this.markdownDraft !== null)
		{
			if (JSON.stringify(scanned) !== JSON.stringify(this.activeDream))
			{
				this.SetActiveDream(scanned);
				this.isDirty = true;
				this.revision += 1;
				changed = true;
			}
			this.markdownDraft.baseline = structuredClone(scanned);
			this.markdownDraft.appliedMarkdown = this.markdownDraft.markdown;
			this.Persist();
		}
		return changed;
	}

	public EndMarkdownEditing(): void
	{
		this.markdownDraft = null;
		this.saveState = "idle";
		this.Persist();
	}

	private ScanMarkdownDraft(): Dream | null
	{
		let result: Dream | null = null;
		if (this.markdownDraft !== null)
		{
			if (this.activeDream !== null && this.markdownDraft.markdown === this.markdownDraft.appliedMarkdown && JSON.stringify(this.activeDream) !== JSON.stringify(this.markdownDraft.baseline))
			{
				const markdown = DreamMarkdownDocument.Serialize(this.activeDream);
				this.markdownDraft = { markdown, appliedMarkdown: markdown, baseline: structuredClone(this.activeDream) };
				this.Persist();
			}
			if (JSON.stringify(this.activeDream) !== JSON.stringify(this.markdownDraft.baseline))
			{
				throw new Error("The Dream changed in another view. Copy your Markdown draft before cancelling and reopening the editor.");
			}
			result = DreamMarkdownDocument.Scan(this.markdownDraft.markdown, this.markdownDraft.baseline);
		}
		return result;
	}

	// Returns the lifecycle of the active Dream's most recent save attempt.
	public GetSaveState(): DreamSaveState
	{
		return this.saveState;
	}

	// Returns the current mutation revision of the active Dream.
	public GetRevision(): number
	{
		return this.revision;
	}

	// Replaces the visible Dream catalogue with a freshly loaded snapshot.
	public SetCatalogue(catalogue: Dream[]): void
	{
		this.catalogue = structuredClone(catalogue);
	}

	// Opens a Dream for editing and records whether it starts with unsaved changes.
	public Open(dream: Dream, isDirty: boolean): void
	{
		if (this.markdownDraft !== null) throw new Error("Save or cancel Markdown editing before opening another Dream.");
		this.CancelPersistence();
		this.SetActiveDream(structuredClone(dream));
		this.isDirty = isDirty;
		this.revision = 0;
		this.saveState = "idle";
		this.Persist();
	}

	// Closes the active Dream editing session.
	public Close(): void
	{
		this.CancelPersistence();
		this.markdownDraft = null;
		this.SetActiveDream(null);
		this.isDirty = false;
		this.revision = 0;
		this.saveState = "idle";
		this.sessions.Remove(DreamStore.SessionKey);
	}

	// Updates the active Dream title and records one authoritative state change.
	public UpdateTitle(title: string): DreamChange | null
	{
		let change: DreamChange | null = null;

		if (this.activeDream !== null)
		{
			this.activeDream.title = title;
			change = this.RecordChange();
		}

		return change;
	}

	// Updates the active Dream reflection and records one authoritative state change.
	public UpdateReflection(reflection: string): DreamChange | null
	{
		let change: DreamChange | null = null;

		if (this.activeDream !== null)
		{
			this.activeDream.reflection = reflection;
			change = this.RecordChange();
		}

		return change;
	}

	// Replaces the active Dream signals after the controller has calculated source order.
	public ReplaceSignals(signals: DreamSignal[]): DreamChange | null
	{
		let change: DreamChange | null = null;

		if (this.activeDream !== null)
		{
			this.activeDream.signals = structuredClone(signals);
			change = this.RecordChange();
		}

		return change;
	}

	// Updates one existing signal description and records the change when it exists.
	public UpdateSignalDescription(signalId: string, description: string): DreamChange | null
	{
		let change: DreamChange | null = null;
		let signal: DreamSignal | undefined;

		for (const candidate of this.activeDream?.signals ?? [])
		{
			if (candidate.id === signalId)
			{
				signal = candidate;
				break;
			}
		}

		if (signal !== undefined)
		{
			signal.description = description;
			change = this.RecordChange();
		}

		return change;
	}

	// Replaces the source selection owned by the active Dream.
	public ReplaceSource(source: SourceSelection): DreamChange | null
	{
		let change: DreamChange | null = null;

		if (this.activeDream !== null)
		{
			this.activeDream.source = structuredClone(source);
			change = this.RecordChange();
		}

		return change;
	}

	// Commits a successful save when no further mutation has occurred since it began.
	public MarkSaved(dream: Dream, savedRevision: number): void
	{
		if (savedRevision === this.revision && this.activeDream?.id === dream.id)
		{
			this.CancelPersistence();
			this.SetActiveDream(structuredClone(dream));
			if (this.markdownDraft !== null) this.markdownDraft.baseline = structuredClone(dream);
			this.isDirty = false;
			this.saveState = "idle";
			this.Persist();
		}
	}

	// Records the lifecycle of the active Dream's most recent save attempt.
	public SetSaveState(saveState: DreamSaveState): void
	{
		this.saveState = saveState;
	}

	// Flushes any pending session persistence before the store is torn down.
	public Dispose(): void
	{
		this.FlushPersistence();
	}

	// Sole assignment point for the active Dream, so every write path is traceable to one place.
	private SetActiveDream(dream: Dream | null): void
	{
		this.activeDream = dream;
	}

	// Returns whether the given Dream matches the reader's normalized search query.
	private MatchesSearch(dream: Dream, query: string): boolean
	{
		const searchable = `${dream.title} ${dream.dialogue ?? ""} ${dream.source.selectedText}`.toLocaleLowerCase();
		const matches = query.length === 0 || searchable.includes(query);

		return matches;
	}

	// Orders Dreams by owning work, source locator, source position, then title.
	private CompareBySource(first: Dream, second: Dream): number
	{
		let comparison = first.workId.localeCompare(second.workId);

		if (comparison === 0) comparison = this.CompareLocators(first.source.locatorStart?.value ?? "", second.source.locatorStart?.value ?? "");
		if (comparison === 0) comparison = first.source.start.segmentKey.localeCompare(second.source.start.segmentKey);
		if (comparison === 0) comparison = first.source.start.offset - second.source.start.offset;
		if (comparison === 0) comparison = first.title.localeCompare(second.title);

		return comparison;
	}

	// Orders Stephanus-style locators (e.g. "327a") numerically, falling back to natural string order.
	private CompareLocators(first: string, second: string): number
	{
		const firstMatch = /^(\d+)([a-e])$/iu.exec(first);
		const secondMatch = /^(\d+)([a-e])$/iu.exec(second);
		let comparison = 0;

		if (firstMatch !== null && secondMatch !== null)
		{
			comparison = Number.parseInt(firstMatch[1] ?? "0", 10) - Number.parseInt(secondMatch[1] ?? "0", 10);
			if (comparison === 0) comparison = (firstMatch[2] ?? "").localeCompare(secondMatch[2] ?? "");
		}
		else
		{
			comparison = first.localeCompare(second, undefined, { numeric: true });
		}

		return comparison;
	}

	// Schedules a delayed session-persistence write, replacing any pending one.
	private SchedulePersistence(): void
	{
		this.CancelPersistence();
		this.persistenceTimer = setTimeout(this.HandlePersistenceTimer.bind(this), DreamStore.PersistenceDelayMilliseconds);
	}

	// Writes the session snapshot once a pending persistence timer elapses.
	private HandlePersistenceTimer(): void
	{
		this.persistenceTimer = null;
		this.Persist();
	}

	// Advances authoritative mutation metadata and returns an immutable result.
	private RecordChange(): DreamChange
	{
		const wasDirty = this.isDirty;
		this.isDirty = true;
		this.revision += 1;
		this.saveState = "idle";
		this.SchedulePersistence();
		const dream = structuredClone(this.activeDream as Dream);
		const change: DreamChange = { dream, becameDirty: !wasDirty };

		return change;
	}

	// Writes any pending session-persistence snapshot immediately.
	private FlushPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			this.CancelPersistence();
			this.Persist();
		}
	}

	// Cancels a pending session-persistence timer, if one is scheduled.
	private CancelPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			clearTimeout(this.persistenceTimer);
			this.persistenceTimer = null;
		}
	}

	// Writes the active Dream editing session to session storage.
	private Persist(): void
	{
		if (this.activeDream !== null)
		{
			this.sessions.Save(DreamStore.SessionKey, { dream: this.activeDream, isDirty: this.isDirty, markdownDraft: this.markdownDraft });
		}
	}
}
