export type LogLevel = "debug" | "info" | "warning" | "error";

export interface ErrorRecord
{
	id: string;
	timestamp: string;
	level: LogLevel;
	source: string;
	message: string;
	details?: unknown;
	userMessage?: string;
}

export type ErrorRecordSink = (record: ErrorRecord) => void;

export class DiagnosticManager
{
	private readonly records: ErrorRecord[] = [];

	public constructor(private readonly sink?: ErrorRecordSink)
	{
	}

	public Debug(source: string, message: string, details?: unknown): void
	{
		this.Record("debug", source, message, undefined, details);
	}

	public Info(source: string, message: string, details?: unknown): void
	{
		this.Record("info", source, message, undefined, details);
	}

	public Warning(source: string, message: string, details?: unknown): void
	{
		this.Record("warning", source, message, undefined, details);
	}

	public Error(source: string, message: string, details?: unknown): void
	{
		this.Record("error", source, message, undefined, details);
	}

	public Report(source: string, error: unknown, userMessage: string): void
	{
		const message = error instanceof Error ? error.message : String(error);
		this.Record("error", source, message, userMessage, error);
	}

	public GetRecords(): readonly ErrorRecord[]
	{
		const records = [...this.records];

		return records;
	}

	private Record(level: LogLevel, source: string, message: string, userMessage?: string, details?: unknown): void
	{
		const record: ErrorRecord = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			level,
			source,
			message
		};
		if (userMessage !== undefined) record.userMessage = userMessage;
		if (details !== undefined) record.details = details;
		this.records.push(record);
		this.WriteConsole(record);
		this.sink?.(record);
	}

	private WriteConsole(record: ErrorRecord): void
	{
		const prefix = `[Chora][${record.level.toUpperCase()}][${record.source}]`;
		if (record.level === "error") console.error(prefix, record.message, record.details ?? "");
		if (record.level === "warning") console.warn(prefix, record.message, record.details ?? "");
		if (record.level === "info") console.info(prefix, record.message, record.details ?? "");
		if (record.level === "debug") console.debug(prefix, record.message, record.details ?? "");
	}
}
