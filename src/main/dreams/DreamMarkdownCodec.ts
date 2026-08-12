import matter from "gray-matter";
import type { Dream, SourceSelection } from "../../shared/dreams/DreamTypes.js";

type LegacyDream = Partial<Dream> & {
	seeing?: string;
	relations?: string;
	threads?: string;
	linkedMemoryIds?: string[];
	source?: SourceSelection;
};

function BuildLegacyReflection(record: LegacyDream): string
{
	const parts: string[] = [];

	if (record.reflection?.trim()) parts.push(record.reflection);
	else if (record.seeing?.trim()) parts.push(record.seeing);
	if (record.relations?.trim()) parts.push(`[Previous Relations]\n${record.relations}`);
	if (record.threads?.trim()) parts.push(`[Previous Threads to Follow]\n${record.threads}`);

	return parts.join("\n\n");
}

export function MigrateDream(record: LegacyDream): Dream | null
{
	const source = record.source;
	let dream: Dream | null = null;

	if (source !== undefined && record.id !== undefined && record.workId !== undefined)
	{
		const migratedSource: SourceSelection = {
			...source,
			sourceRefs: source.sourceRefs ?? [source.start.segmentKey, source.end.segmentKey],
			startSourceRef: source.startSourceRef ?? source.start.segmentKey,
			endSourceRef: source.endSourceRef ?? source.end.segmentKey
		};
		dream = {
			id: record.id,
			workId: record.workId,
			dialogue: record.dialogue ?? null,
			title: record.title?.trim() ?? "",
			source: migratedSource,
			signals: (record.signals ?? []).map((signal) => ({ ...signal, description: signal.description ?? "" })),
			reflection: BuildLegacyReflection(record),
			linkedDreamIds: Array.from(new Set(record.linkedDreamIds ?? record.linkedMemoryIds ?? [])),
			createdAt: record.createdAt ?? new Date().toISOString(),
			updatedAt: record.updatedAt ?? new Date().toISOString()
		};
	}

	return dream;
}

function ReadSections(content: string): { title: string; exegesis: string }
{
	const current = /^#\s+(.+?)\s*\r?\n\r?\n## Exegesis\r?\n\r?\n([\s\S]*?)\s*$/u.exec(content);
	const titleless = /^## Exegesis\r?\n\r?\n([\s\S]*?)\s*$/u.exec(content);
	const legacy = /^#\s+(.+?)\s*\r?\n\r?\n## Reflection\r?\n\r?\n([\s\S]*?)\r?\n\r?\n## Questions\r?\n\r?\n([\s\S]*?)\s*$/u.exec(content);
	let sections = { title: "", exegesis: content.trim() };

	if (current !== null) sections = { title: current[1] ?? "", exegesis: current[2] ?? "" };
	else if (titleless !== null) sections = { title: "", exegesis: titleless[1] ?? "" };
	else if (legacy !== null)
	{
		const reflection = legacy[2] ?? "";
		const questions = legacy[3]?.trim() ?? "";
		sections = { title: legacy[1] ?? "", exegesis: questions.length === 0 ? reflection : `${reflection}\n\n[Previous Questions]\n${questions}` };
	}

	return sections;
}

export function ParseDreamMarkdown(content: string): Dream | null
{
	const parsed = matter(content);
	const data = parsed.data as LegacyDream;
	const sections = ReadSections(parsed.content);
	const dream = MigrateDream({ ...data, title: sections.title || data.title || "", reflection: sections.exegesis });
	return dream;
}

export function SerializeDreamMarkdown(dream: Dream): string
{
	const title = dream.title.trim();
	const heading = title.length === 0 ? "" : `# ${title}\n\n`;
	const body = `${heading}## Exegesis\n\n${dream.reflection}\n`;
	const frontMatter = {
		id: dream.id,
		workId: dream.workId,
		dialogue: dream.dialogue,
		source: dream.source,
		signals: dream.signals,
		linkedDreamIds: dream.linkedDreamIds,
		createdAt: dream.createdAt,
		updatedAt: dream.updatedAt
	};
	const markdown = matter.stringify(body, frontMatter);
	return markdown;
}
