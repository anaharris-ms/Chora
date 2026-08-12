import type { Dream as DreamRecord, DreamSignal as DreamSignalRecord, SourceSelection } from "../../shared/dreams/DreamTypes.js";
import { DreamSignal } from "./DreamSignal.js";

// Owns one reader-authored Dream and its normalized signals and links.
export class Dream
{
	// Stable identity of this Dream.
	private readonly id: string;
	// Canonical owning Library work identifier.
	private readonly workId: string;
	// Optional human-readable name of the originating work.
	private readonly dialogue: string | null;
	// Reader-authored title.
	private title: string;
	// Owned source selection for this Dream.
	private source: SourceSelection;
	// Signals owned by this Dream.
	private readonly signals: DreamSignal[];
	// Reader-authored exegesis.
	private reflection: string;
	// Other Dreams linked by stable identifier.
	private linkedDreamIds: string[];
	// Initial persistence timestamp.
	private readonly createdAt: string;
	// Most recent persistence timestamp.
	private updatedAt: string;

	// Hydrates one Dream and normalizes persisted or IPC-supplied record fields.
	public constructor(record: DreamRecord)
	{
		this.ValidateIdentifier(record.id, "Dream identifier");
		this.ValidateIdentifier(record.workId, "Dream work identifier");
		this.id = record.id;
		this.workId = record.workId;
		this.dialogue = record.dialogue;
		this.title = record.title.trim();
		this.source = this.NormalizeSource(record.source);
		this.signals = this.CreateSignals(record.signals);
		this.reflection = record.reflection;
		this.linkedDreamIds = this.NormalizeLinks(record.linkedDreamIds);
		this.createdAt = record.createdAt;
		this.updatedAt = record.updatedAt;
	}

	// Returns the stable identity owned by this Dream.
	public GetId(): string
	{
		return this.id;
	}

	// Returns the owning work identifier.
	public GetWorkId(): string
	{
		return this.workId;
	}

	// Updates the Dream title.
	public UpdateTitle(title: string): void
	{
		this.title = title.trim();
	}

	// Updates the Dream exegesis.
	public UpdateReflection(reflection: string): void
	{
		this.reflection = reflection;
	}

	// Replaces the source selection with a normalized source owned by this Dream.
	public ReplaceSource(source: SourceSelection): void
	{
		this.source = this.NormalizeSource(source);
	}

	// Adds a unique signal to this Dream.
	public AddSignal(signal: DreamSignalRecord): void
	{
		const candidate = new DreamSignal(signal);
		const signalId = candidate.ToRecord().id;
		const hasSignal = this.signals.some(function HasSignal(existing: DreamSignal): boolean
		{
			const record = existing.ToRecord();
			const isMatch = record.id === signalId;

			return isMatch;
		});

		if (hasSignal)
		{
			throw new Error(`Dream signal already exists: ${signalId}`);
		}

		this.signals.push(candidate);
	}

	// Removes a signal when it belongs to this Dream.
	public RemoveSignal(signalId: string): void
	{
		const index = this.signals.findIndex(function FindSignal(signal: DreamSignal): boolean
		{
			const record = signal.ToRecord();
			const isMatch = record.id === signalId;

			return isMatch;
		});

		if (index >= 0)
		{
			this.signals.splice(index, 1);
		}
	}

	// Updates one owned signal's description.
	public UpdateSignalDescription(signalId: string, description: string): void
	{
		const signal = this.signals.find(function FindSignal(candidate: DreamSignal): boolean
		{
			const record = candidate.ToRecord();
			const isMatch = record.id === signalId;

			return isMatch;
		});

		if (signal !== undefined)
		{
			signal.UpdateDescription(description);
		}
	}

	// Replaces links after removing duplicates and the Dream's own identity.
	public SetLinkedDreamIds(linkedDreamIds: readonly string[]): void
	{
		this.linkedDreamIds = this.NormalizeLinks(linkedDreamIds);
	}

	// Sets the persistence timestamp owned by this aggregate.
	public MarkSaved(updatedAt: string): void
	{
		this.updatedAt = updatedAt;
	}

	// Produces an immutable IPC and persistence record.
	public ToRecord(): DreamRecord
	{
		const signals: DreamSignalRecord[] = [];

		for (const signal of this.signals)
		{
			const record = signal.ToRecord();
			signals.push(record);
		}

		const record: DreamRecord = {
			id: this.id,
			workId: this.workId,
			dialogue: this.dialogue,
			title: this.title,
			source: structuredClone(this.source),
			signals,
			reflection: this.reflection,
			linkedDreamIds: [...this.linkedDreamIds],
			createdAt: this.createdAt,
			updatedAt: this.updatedAt
		};

		return record;
	}

	// Normalizes source reference fields required by the current persistence schema.
	private NormalizeSource(source: SourceSelection): SourceSelection
	{
		const sourceRefs = source.sourceRefs.length > 0 ? [...source.sourceRefs] : [source.start.segmentKey, source.end.segmentKey];
		const normalized: SourceSelection = {
			...structuredClone(source),
			sourceRefs,
			startSourceRef: source.startSourceRef || source.start.segmentKey,
			endSourceRef: source.endSourceRef || source.end.segmentKey
		};

		return normalized;
	}

	// Hydrates unique signals owned by this Dream.
	private CreateSignals(records: readonly DreamSignalRecord[]): DreamSignal[]
	{
		const signals: DreamSignal[] = [];
		const seenIds = new Set<string>();

		for (const record of records)
		{
			const signal = new DreamSignal(record);
			const signalRecord = signal.ToRecord();
			const hasSeen = seenIds.has(signalRecord.id);

			if (!hasSeen)
			{
				seenIds.add(signalRecord.id);
				signals.push(signal);
			}
		}

		return signals;
	}

	// Removes duplicate links and the Dream's own identity.
	private NormalizeLinks(linkedDreamIds: readonly string[]): string[]
	{
		const links = new Set<string>();

		for (const linkedDreamId of linkedDreamIds)
		{
			const normalizedId = linkedDreamId.trim();
			const isSelf = normalizedId === this.id;

			if (normalizedId.length > 0 && !isSelf)
			{
				links.add(normalizedId);
			}
		}

		const normalizedLinks = [...links];

		return normalizedLinks;
	}

	// Rejects identifiers that cannot safely participate in Dream ownership.
	private ValidateIdentifier(value: string, label: string): void
	{
		const pattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
		const isValid = pattern.test(value);

		if (!isValid)
		{
			throw new Error(`${label} is invalid`);
		}
	}
}