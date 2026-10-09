import type { Dream, DreamSignal } from "./DreamTypes.js";
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
		const blocks = [
			`${heading} Signal`,
			this.Quote(signal.text),
			`Source: ${dream.dialogue ?? dream.workId} · ${this.FormatSelection(signal.selection, signal.sourceRef)}`,
			`${sectionHeading} Observation`,
			signal.description.trim() || "_No observation._"
		];

		const markdown = blocks.join("\n\n");
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
