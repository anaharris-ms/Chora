import type { DreamSignal as DreamSignalRecord, DreamResonance as DreamResonanceRecord, ResonanceTarget as ResonanceTargetRecord } from "../../shared/dreams/DreamTypes.js";

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
	private description: string;
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

	// Updates the reader's reflection on this signal.
	public UpdateDescription(description: string): void
	{
		this.description = description;
	}

	// Adds a unique reader-authored resonance to this signal.
	public AddResonance(resonance: DreamResonanceRecord): void
	{
		this.ValidateIdentifier(resonance.id, "Resonance identifier");
		this.ValidateNote(resonance.note);

		const hasResonance = this.resonances.some((existing) => existing.id === resonance.id);
		if (hasResonance) throw new Error(`Resonance already exists: ${resonance.id}`);

		this.resonances.push(this.NormalizeResonance(resonance));
	}

	// Updates one owned resonance's note.
	public UpdateResonanceNote(resonanceId: string, note: string): void
	{
		this.ValidateNote(note);
		const resonance = this.FindResonance(resonanceId);

		if (resonance !== undefined)
		{
			resonance.note = note.trim();
			resonance.updatedAt = new Date().toISOString();
		}
	}

	// Removes a resonance when it belongs to this signal.
	public RemoveResonance(resonanceId: string): void
	{
		const index = this.resonances.findIndex((candidate) => candidate.id === resonanceId);

		if (index >= 0) this.resonances.splice(index, 1);
	}

	// Attaches a passage target to a resonance, ignoring an exact duplicate.
	public AttachResonanceTarget(resonanceId: string, target: ResonanceTargetRecord): void
	{
		this.ValidateIdentifier(target.id, "Resonance target identifier");
		const resonance = this.FindResonance(resonanceId);

		if (resonance !== undefined)
		{
			const hasTarget = resonance.targets.some((existing) => existing.id === target.id);
			if (!hasTarget)
			{
				resonance.targets.push(structuredClone(target));
				resonance.updatedAt = new Date().toISOString();
			}
		}
	}

	// Removes one attached target from a resonance, retaining the resonance itself.
	public RemoveResonanceTarget(resonanceId: string, targetId: string): void
	{
		const resonance = this.FindResonance(resonanceId);

		if (resonance !== undefined)
		{
			const index = resonance.targets.findIndex((target) => target.id === targetId);
			if (index >= 0)
			{
				resonance.targets.splice(index, 1);
				resonance.updatedAt = new Date().toISOString();
			}
		}
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

	// Finds a resonance owned by this signal, or undefined when it is not present.
	private FindResonance(resonanceId: string): DreamResonanceRecord | undefined
	{
		const resonance = this.resonances.find((candidate) => candidate.id === resonanceId);

		return resonance;
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

	// Rejects a resonance note that carries no reader observation.
	private ValidateNote(note: string): void
	{
		const isValid = note.trim().length > 0;

		if (!isValid)
		{
			throw new Error("Resonance note must not be empty");
		}
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