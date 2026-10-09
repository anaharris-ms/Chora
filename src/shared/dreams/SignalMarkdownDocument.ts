import type { Dream, DreamSignal, ResonanceTarget } from "./DreamTypes.js";
import type { TextSelection } from "../library/SelectionTypes.js";

// Serializes one complete Signal for clipboard export.
export class SignalMarkdownDocument
{
	public static Serialize(dream: Dream, signal: DreamSignal): string
	{
		const markdown = `${this.SerializeSection(dream, signal, 1)}\n`;
		return markdown;
	}

	public static SerializeSection(dream: Dream, signal: DreamSignal, headingDepth: number): string
	{
		const heading = "#".repeat(headingDepth);
		const sectionHeading = "#".repeat(headingDepth + 1);
		const attachmentHeading = "#".repeat(headingDepth + 2);
		const blocks = [
			`${heading} Signal`,
			this.Quote(signal.text),
			`Source: ${dream.dialogue ?? dream.workId} · ${this.FormatSelection(signal.selection, signal.sourceRef)}`,
			`${sectionHeading} Observation`,
			signal.description.trim() || "_No observation._",
			`${sectionHeading} Resonances`
		];

		if (signal.resonances.length === 0)
		{
			blocks.push("_No resonances._");
		}
		else
		{
			for (const resonance of signal.resonances)
			{
				blocks.push(`${attachmentHeading} Resonance`, resonance.note.trim());
				for (const target of resonance.targets) blocks.push(this.SerializeTarget(target, headingDepth + 3));
			}
		}

		const markdown = blocks.join("\n\n");
		return markdown;
	}

	private static SerializeTarget(target: ResonanceTarget, headingDepth: number): string
	{
		const heading = `${"#".repeat(headingDepth)} Attached Passage: ${target.workId} · ${this.FormatSelection(target.selection, target.selection.start.segmentKey)}`;
		const passage = this.Quote(target.selection.selectedText);
		const markdown = `${heading}\n\n${passage}`;
		return markdown;
	}

	private static FormatSelection(selection: TextSelection, fallback: string): string
	{
		const start = selection.locatorStart?.value ?? fallback;
		const end = selection.locatorEnd?.value ?? start;
		const location = start === end ? start : `${start}–${end}`;
		return location;
	}

	public static Quote(text: string): string
	{
		const lines = text.split(/\r?\n/u);
		const quoted: string[] = [];
		for (const line of lines) quoted.push(`> ${line}`);
		const markdown = quoted.join("\n");
		return markdown;
	}
}
