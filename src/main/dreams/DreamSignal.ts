import type { DreamSignal as DreamSignalRecord, DreamResonance as DreamResonanceRecord } from "../../shared/dreams/DreamTypes.js";

// Owns the normalized signal attached to a Dream.
export class DreamSignal
{
	// Stable identity for this signal.
	private readonly id: string;
	// Source locator used to identify the signal in a text.
	private readonly sourceRef: string;
	// Selection captured when the signal was created.
	private readonly selection: DreamSignalRecord["selection"];
	// Exact source text captured for the signal.
	private readonly text: string;
	// Reader-authored account of the signal.
	private readonly description: string;
	// Reader-authored connections arising from this signal.
	private readonly resonances: DreamResonanceRecord[];

	// Hydrates one signal while normalizing reader-authored text fields.
	public constructor(record: DreamSignalRecord)
	{
		this.ValidateIdentifier(record.id, "Dream signal identifier");
		this.id = record.id;
		this.sourceRef = record.sourceRef.trim();
		this.selection = structuredClone(record.selection);
		this.text = record.text;
		this.description = record.description ?? "";
		this.resonances = this.NormalizeResonances(record.resonances ?? []);
	}

	// Produces an immutable persistence and IPC record.
	public ToRecord(): DreamSignalRecord
	{
		const record: DreamSignalRecord = {
			id: this.id,
			sourceRef: this.sourceRef,
			selection: structuredClone(this.selection),
			text: this.text,
			description: this.description,
			resonances: structuredClone(this.resonances)
		};

		return record;
	}

	// Hydrates unique resonances owned by this signal.
	private NormalizeResonances(records: readonly DreamResonanceRecord[]): DreamResonanceRecord[]
	{
		const resonances: DreamResonanceRecord[] = [];
		const seenIds = new Set<string>();

		for (const record of records)
		{
			const hasSeen = seenIds.has(record.id);
			if (!hasSeen)
			{
				seenIds.add(record.id);
				resonances.push(this.NormalizeResonance(record));
			}
		}

		return resonances;
	}

	// Normalizes one resonance record, defaulting fields absent from older persisted files.
	private NormalizeResonance(record: DreamResonanceRecord): DreamResonanceRecord
	{
		const normalized: DreamResonanceRecord = {
			id: record.id,
			note: record.note.trim(),
			targets: structuredClone(record.targets ?? []),
			candidates: structuredClone(record.candidates ?? []),
			createdAt: record.createdAt ?? new Date().toISOString(),
			updatedAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString()
		};

		return normalized;
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