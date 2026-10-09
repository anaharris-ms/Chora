import { describe, expect, it } from "vitest";
import { IdeaMarkdownCodec } from "../../src/main/ideas/IdeaMarkdownCodec.js";

describe("IdeaMarkdownCodec", function IdeaMarkdownCodecTests()
{
	it("migrates ordered Signal references into an origin and related Signals", function MigratesFlatReferences()
	{
		const codec = new IdeaMarkdownCodec();
		const markdown = `---
id: idea-1
workId: republic
references:
  - dreamId: dream-1
    signalId: origin
  - dreamId: dream-2
    signalId: related-1
  - dreamId: dream-3
    signalId: related-2
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-01-01T00:00:00.000Z"
---
# Migrated Idea

An interpretation.
`;
		const record = codec.Parse(markdown);

		expect(record.originSignal).toEqual({ dreamId: "dream-1", signalId: "origin" });
		expect(record.relatedSignals).toEqual([
			{ dreamId: "dream-2", signalId: "related-1" },
			{ dreamId: "dream-3", signalId: "related-2" }
		]);
	});

	it("rejects legacy Dream and passage references explicitly", function RejectsLegacyReferences()
	{
		const codec = new IdeaMarkdownCodec();
		const markdown = `---
id: idea-1
workId: republic
references:
  - kind: dream
    dreamId: dream-1
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---
# Legacy Idea
`;

		function ParseLegacyIdea(): void
		{
			codec.Parse(markdown);
		}

		expect(ParseLegacyIdea).toThrow("Ideas must reference Signals");
	});
});
