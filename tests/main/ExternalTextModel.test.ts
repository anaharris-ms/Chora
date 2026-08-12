import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildExternalText } from "../../src/main/library/ExternalTextModel.js";

describe("external document service", () =>
{
	it("builds an English text document", () =>
	{
		const filePath = path.resolve("sample-files", "english.txt");
		const work = BuildExternalText(filePath, "Hello\r\nworld");

		expect(work.id).toBe("external-text");
		expect(work.title).toBe("english.txt");
		expect(work.provenance.sourceKind).toBe("external");
		expect(work.provenance.externalFilePath).toBe(filePath);
		expect(work.segments[0]?.text).toBe("Hello\nworld");
	});

	it("builds a Greek text document", () =>
	{
		const filePath = path.resolve("sample-files", "greek.txt");
		const work = BuildExternalText(filePath, "Μῆνιν ἄειδε\nθεὰ");

		expect(work.title).toBe("greek.txt");
		expect(work.language).toBe("und");
		expect(work.provenance.sourceFile).toBe("greek.txt");
		expect(work.segments[0]?.text).toBe("Μῆνιν ἄειδε\nθεὰ");
	});

	it("builds an empty text document", () =>
	{
		const filePath = path.resolve("sample-files", "empty.txt");
		const work = BuildExternalText(filePath, "");

		expect(work.title).toBe("empty.txt");
		expect(work.segments).toHaveLength(1);
		expect(work.segments[0]?.text).toBe("");
	});

	it("preserves unusual unicode characters", () =>
	{
		const filePath = path.resolve("sample-files", "unicode.txt");
		const content = "Caf\u00e9, 👩‍🚀, 𐍈, and A\u0301";
		const work = BuildExternalText(filePath, content);

		expect(work.segments[0]?.text).toBe(content);
		expect(work.provenance.externalFilePath).toBe(filePath);
	});
});
