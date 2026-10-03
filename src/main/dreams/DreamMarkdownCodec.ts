import matter from "gray-matter";
import type { Dream } from "../../shared/dreams/DreamTypes.js";

// Frontmatter shape parsed from a Dream Markdown file.
type ParsedDreamData = Partial<Dream>;

// Builds a Dream from parsed Markdown data, or null when required fields are missing.
function BuildDream(record: ParsedDreamData): Dream | null
{
	const source = record.source;
	let dream: Dream | null = null;

	if (source !== undefined && record.id !== undefined && record.workId !== undefined)
	{
		dream = {
			id: record.id,
			workId: record.workId,
			dialogue: record.dialogue ?? null,
			title: record.title?.trim() ?? "",
			source,
			signals: (record.signals ?? []).map((signal) => ({ ...signal, description: signal.description ?? "" })),
			reflection: record.reflection ?? "",
			linkedDreamIds: Array.from(new Set(record.linkedDreamIds ?? [])),
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
	let sections = { title: "", exegesis: content.trim() };

	if (current !== null) sections = { title: current[1] ?? "", exegesis: current[2] ?? "" };
	else if (titleless !== null) sections = { title: "", exegesis: titleless[1] ?? "" };

	return sections;
}

export function ParseDreamMarkdown(content: string): Dream | null
{
	const parsed = matter(content);
	const data = parsed.data as ParsedDreamData;
	const sections = ReadSections(parsed.content);
	const dream = BuildDream({ ...data, title: sections.title || data.title || "", reflection: sections.exegesis });
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
