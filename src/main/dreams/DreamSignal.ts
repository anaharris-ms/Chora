import type { DreamSignal as DreamSignalRecord } from "../../shared/dreams/DreamTypes.js";

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

	// Hydrates one signal while normalizing reader-authored text fields.
	public constructor(record: DreamSignalRecord)
	{
		this.ValidateIdentifier(record.id, "Dream signal identifier");
		this.id = record.id;
		this.sourceRef = record.sourceRef.trim();
		this.selection = structuredClone(record.selection);
		this.text = record.text;
		this.description = record.description ?? "";
	}

	// Updates the reader's reflection on this signal.
	public UpdateDescription(description: string): void
	{
		this.description = description;
	}

	// Produces an immutable persistence and IPC record.
	public ToRecord(): DreamSignalRecord
	{
		const record: DreamSignalRecord = {
			id: this.id,
			sourceRef: this.sourceRef,
			selection: structuredClone(this.selection),
			text: this.text,
			description: this.description
		};

		return record;
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