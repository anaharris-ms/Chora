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
	private readonly title: string;
	// Owned source selection for this Dream.
	private readonly source: SourceSelection;
	// Signals owned by this Dream.
	private readonly signals: DreamSignal[];
	// Reader-authored exegesis.
	private readonly reflection: string;
	// Other Dreams linked by stable identifier.
	private readonly linkedDreamIds: string[];
	// Initial persistence timestamp.
	private readonly createdAt: string;
	// Most recent persistence timestamp.
	private readonly updatedAt: string;

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