import type { Dream } from "./DreamTypes.js";
import { fromMarkdown } from "mdast-util-from-markdown";

interface DreamMarkdownSection
{
	readonly key: string;
	readonly content: string;
}

export class DreamMarkdownDocument
{
	public static Serialize(dream: Dream): string
	{
		const sections = this.Sections(dream);
		const blocks: string[] = [];
		for (const section of sections)
		{
			if (section.content.includes("<!-- chora:")) throw new Error("Dream text contains a reserved Markdown section marker.");
			blocks.push(`<!-- chora:${section.key} -->\n${section.content}`);
		}
		blocks.push("<!-- chora:end -->");
		const markdown = blocks.join("\n\n");
		return markdown;
	}

	public static Scan(markdown: string, original: Dream): Dream
	{
		const expected = this.Sections(original);
		const normalized = markdown.replace(/\r\n/g, "\n");
		const markers = Array.from(normalized.matchAll(/^<!-- chora:([^\n]+) -->$/gm));
		const markerCount = normalized.split("<!-- chora:").length - 1;
		const parsed = fromMarkdown(normalized);
		const structuralOffsets = new Set<number | undefined>();
		for (const node of parsed.children)
		{
			if (node.type === "html" && /^<!-- chora:[^\n]+ -->$/u.test(node.value)) structuralOffsets.add(node.position?.start.offset);
		}
		for (const marker of markers)
		{
			if (!structuralOffsets.has(marker.index)) throw new Error("Section markers must remain outside code blocks, quotations, lists, and HTML blocks. Close unfinished blocks before saving.");
		}
		if (markers.length !== expected.length + 1 || markerCount !== markers.length || markers[0]?.index !== 0 || markers.at(-1)?.[1] !== "end")
		{
			throw new Error("Keep every chora section marker exactly once and in its original order. Missing or damaged sections must be restored before saving.");
		}
		const last = markers.at(-1)!;
		if (normalized.slice(last.index! + last[0].length).trim() !== "") throw new Error("Content after the final section marker is not allowed.");
		const contents = new Map<string, string>();
		for (let index = 0; index < expected.length; index += 1)
		{
			const section = expected[index]!;
			const marker = markers[index]!;
			const next = markers[index + 1]!;
			if (marker[1] !== section.key) throw new Error(`Restore the missing, renamed, or reordered section: ${section.key}.`);
			const content = normalized.slice(marker.index! + marker[0].length, next.index).trim();
			const editable = section.key === "title" || section.key === "observations" || section.key.startsWith("description:") || section.key.startsWith("note:");
			if (!editable && content !== section.content.trim()) throw new Error(`Restore the protected heading, source text, or attachment in section: ${section.key}.`);
			if (editable && section.key !== "title")
			{
				const fragment = fromMarkdown(content);
				for (const node of fragment.children)
				{
					if (node.type === "heading")
					{
						const heading = content.slice(node.position?.start.offset, node.position?.end.offset).replace(/^#+\s*/u, "").replace(/\s*#+$/u, "").trim();
						if (node.depth === 1 || /^(Source Passage|Signals|General Observations|Resonance|Signal:.*)$/iu.test(heading))
						{
							throw new Error("Do not add duplicate Dream titles or protected section headings inside editable text.");
						}
					}
				}
			}
			contents.set(section.key, content);
		}
		const result = structuredClone(original);
		const title = contents.get("title")!;
		if (!/^# \S[^\n]*$/u.test(title)) throw new Error("The Dream title must be a single level-one heading.");
		if (title !== expected[0]!.content.trim()) result.title = title.slice(2).trim();
		for (const signal of result.signals)
		{
			const description = contents.get(`description:${signal.id}`)!;
			if (description !== signal.description.trim()) signal.description = description;
			for (const resonance of signal.resonances)
			{
				const note = contents.get(`note:${signal.id}:${resonance.id}`)!;
				if (note.length === 0) throw new Error(`Resonance ${resonance.id} must have a note.`);
				if (note !== resonance.note.trim())
				{
					resonance.note = note;
					resonance.updatedAt = new Date().toISOString();
				}
			}
		}
		const observations = contents.get("observations")!;
		if (observations !== result.reflection.trim()) result.reflection = observations;
		return result;
	}

	private static Sections(dream: Dream): DreamMarkdownSection[]
	{
		const source = this.Quote(dream.source.selectedText);
		const start = dream.source.locatorStart?.value ?? dream.source.startSourceRef;
		const end = dream.source.locatorEnd?.value ?? dream.source.endSourceRef;
		const location = start === end ? start : `${start}-${end}`;
		const sections: DreamMarkdownSection[] = [
			{ key: "title", content: `# ${dream.title || "Untitled Dream"}` },
			{ key: "source", content: `## Source Passage\n\n${dream.dialogue ?? dream.workId} - ${location}\n\n${source}\n\n## Signals` }
		];
		for (const signal of dream.signals)
		{
			const quotation = this.Quote(signal.text);
			sections.push({ key: `signal:${signal.id}`, content: `### Signal: ${signal.sourceRef}\n\n${quotation}` });
			sections.push({ key: `description:${signal.id}`, content: signal.description });
			for (const resonance of signal.resonances)
			{
				sections.push({ key: `resonance:${signal.id}:${resonance.id}`, content: "#### Resonance" });
				sections.push({ key: `note:${signal.id}:${resonance.id}`, content: resonance.note });
				for (const target of resonance.targets)
				{
					const passage = this.Quote(target.selection.selectedText);
					const locator = target.selection.locatorStart?.value ?? target.selection.start.segmentKey;
					sections.push({ key: `target:${signal.id}:${resonance.id}:${target.id}`, content: `##### ${target.workId}: ${locator}\n\n${passage}` });
				}
			}
		}
		sections.push({ key: "observations-heading", content: "## General Observations" });
		sections.push({ key: "observations", content: dream.reflection });
		return sections;
	}

	private static Quote(text: string): string
	{
		const lines = text.split(/\r?\n/u);
		const quoted: string[] = [];
		for (const line of lines) quoted.push(`> ${line}`);
		const result = quoted.join("\n");
		return result;
	}
}