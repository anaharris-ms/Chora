import type { Dream, DreamSignal, SourceSelection } from "../../shared/dreams/DreamTypes.js";
import { SessionStore } from "../core/session/SessionStore.js";

export type DreamSaveState = "idle" | "saving" | "saved" | "error";

interface DreamSessionSnapshot
{
	dream: Dream;
	isDirty: boolean;
}

// Result of a named mutation to the active Dream.
export interface DreamChange
{
	// Immutable snapshot after the mutation.
	readonly dream: Dream;
	// Whether the mutation changed the dirty-state transition.
	readonly becameDirty: boolean;
}

export class DreamStore
{
	private static readonly SessionKey = "chora:dream-session";
	private static readonly PersistenceDelayMilliseconds = 400;
	private catalogue: Dream[] = [];
	private activeDream: Dream | null = null;
	private isDirty = false;
	private revision = 0;
	private saveState: DreamSaveState = "idle";
	private persistenceTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly sessions: SessionStore)
	{
		const snapshot = this.sessions.Load<DreamSessionSnapshot>(DreamStore.SessionKey);
		if (snapshot !== null)
		{
			this.activeDream = snapshot.dream;
			this.isDirty = snapshot.isDirty;
		}
	}

	public GetCatalogue(): readonly Dream[]
	{
		const catalogue = structuredClone(this.catalogue);

		return catalogue;
	}

	public GetActiveDream(): Dream | null
	{
		const dream = this.activeDream === null ? null : structuredClone(this.activeDream);

		return dream;
	}

	public GetIsDirty(): boolean
	{
		return this.isDirty;
	}

	public GetSaveState(): DreamSaveState
	{
		return this.saveState;
	}

	public GetRevision(): number
	{
		return this.revision;
	}

	public SetCatalogue(catalogue: Dream[]): void
	{
		this.catalogue = structuredClone(catalogue);
	}

	public Open(dream: Dream, isDirty: boolean): void
	{
		this.CancelPersistence();
		this.activeDream = structuredClone(dream);
		this.isDirty = isDirty;
		this.revision = 0;
		this.saveState = "idle";
		this.Persist();
	}

	public Close(): void
	{
		this.CancelPersistence();
		this.activeDream = null;
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

	public MarkSaved(dream: Dream, savedRevision: number): void
	{
		if (savedRevision === this.revision)
		{
			this.CancelPersistence();
			this.activeDream = structuredClone(dream);
			this.isDirty = false;
			this.saveState = "saved";
			this.Persist();
		}
	}

	public SetSaveState(saveState: DreamSaveState): void
	{
		this.saveState = saveState;
	}

	public Dispose(): void
	{
		this.FlushPersistence();
	}

	private SchedulePersistence(): void
	{
		this.CancelPersistence();
		this.persistenceTimer = setTimeout(() =>
		{
			this.persistenceTimer = null;
			this.Persist();
		}, DreamStore.PersistenceDelayMilliseconds);
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

	private FlushPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			this.CancelPersistence();
			this.Persist();
		}
	}

	private CancelPersistence(): void
	{
		if (this.persistenceTimer !== null)
		{
			clearTimeout(this.persistenceTimer);
			this.persistenceTimer = null;
		}
	}

	private Persist(): void
	{
		if (this.activeDream !== null)
		{
			this.sessions.Save(DreamStore.SessionKey, { dream: this.activeDream, isDirty: this.isDirty });
		}
	}
}
