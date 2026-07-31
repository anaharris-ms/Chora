import { describe, expect, it } from "vitest";
import { ResolveChatContext } from "../../src/main/chat/chat-context-service.js";
import type { TextChatContext } from "../../src/shared/chat/chat-types.js";
import type { LibraryText } from "../../src/shared/library/library-types.js";

const work = {
	id: "republic",
	segments: [
		{ key: "s1", locator: { scheme: "Stephanus", value: "326e" }, speaker: null, text: "Before the focus.", blockKind: "narration" },
		{ key: "s2", locator: { scheme: "Stephanus", value: "327a" }, speaker: "Socrates", text: "The focus passage.", blockKind: "speech" },
		{ key: "s3", locator: { scheme: "Stephanus", value: "327b" }, speaker: null, text: "After the focus.", blockKind: "narration" }
	]
} as LibraryText;

describe("chat context resolution", function ChatContextResolutionTests()
{
	it("adds one canonical segment before and after while preserving the focus", function AddsSurroundingContext()
	{
		const context: TextChatContext = {
			mode: "TEXT",
			documentId: "republic",
			sourcePassage: "The focus passage.",
			contextBefore: "",
			contextAfter: "",
			locator: { scheme: "Stephanus", value: "327a" },
			start: { segmentKey: "s2", offset: 0 },
			end: { segmentKey: "s2", offset: 18 }
		};
		const resolved = ResolveChatContext(work, context);

		expect(resolved).toMatchObject({
			mode: "TEXT",
			sourcePassage: "The focus passage.",
			contextBefore: "Before the focus.",
			contextAfter: "After the focus.",
			locator: { scheme: "Stephanus", value: "327a" }
		});
	});

	it("rejects source text that does not match the canonical corpus", function RejectsDriftedSource()
	{
		const context: TextChatContext = {
			mode: "TEXT",
			documentId: "republic",
			sourcePassage: "Changed text.",
			contextBefore: "",
			contextAfter: "",
			locator: null,
			start: { segmentKey: "s2", offset: 0 },
			end: { segmentKey: "s2", offset: 18 }
		};

		expect(() => ResolveChatContext(work, context)).toThrow("Selection reconstruction mismatch");
	});
});
