import type { Dream } from "./DreamTypes.js";
import { SignalMarkdownDocument } from "./SignalMarkdownDocument.js";

// Serializes a complete Dream for human-readable clipboard export.
export class DreamMarkdownExport
{
	public static Serialize(dream: Dream): string
	{
		const start = dream.source.locatorStart?.value ?? dream.source.startSourceRef;
		const end = dream.source.locatorEnd?.value ?? dream.source.endSourceRef;
		const location = start === end ? start : `${start}–${end}`;
		const blocks = [
			`# ${dream.title || "Untitled Dream"}`,
			"## Source Passage",
			SignalMarkdownDocument.Quote(dream.source.selectedText),
			`Source: ${dream.dialogue ?? dream.workId} · ${location}`,
			"## Signals"
		];

		if (dream.signals.length === 0)
		{
			blocks.push("_No Signals._");
		}
		else
		{
			for (const signal of dream.signals) blocks.push(SignalMarkdownDocument.SerializeSection(dream, signal, 3));
		}

		blocks.push("## General Observations", dream.reflection.trim() || "_No general observations._");
		const markdown = `${blocks.join("\n\n")}\n`;
		return markdown;
	}
}
