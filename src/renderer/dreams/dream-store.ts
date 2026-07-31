import type { Dream } from "../../shared/dreams/dream-types.js";
import { SessionStore } from "../core/session/session-store.js";

export type DreamSaveState = "idle" | "saving" | "saved" | "error";

interface DreamSessionSnapshot
{
	dream: Dream;
	isDirty: boolean;
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
		return this.catalogue;
	}

	public GetActiveDream(): Dream | null
	{
		return this.activeDream;
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
		this.catalogue = [...catalogue];
	}

	public Open(dream: Dream, isDirty: boolean): void
	{
		this.CancelPersistence();
		this.activeDream = dream;
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

	public MarkChanged(): boolean
	{
		const wasDirty = this.isDirty;
		this.isDirty = true;
		this.revision += 1;
		this.saveState = "idle";
		this.SchedulePersistence();
		return !wasDirty;
	}

	public MarkSaved(dream: Dream, savedRevision: number): void
	{
		if (savedRevision === this.revision)
		{
			this.CancelPersistence();
			this.activeDream = dream;
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
