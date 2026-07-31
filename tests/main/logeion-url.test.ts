import { describe, expect, it } from "vitest";
import { CreateLogeionUrl } from "../../src/main/library/logeion-url.js";

describe("Logeion URL", () =>
{
	it("creates a Logeion URL for a selected Greek word", () =>
	{
		const lookupUrl = CreateLogeionUrl("κατέβην");
		const decodedUrl = decodeURIComponent(lookupUrl ?? "");

		expect(decodedUrl).toBe("https://logeion.uchicago.edu/κατέβην");
	});

	it("removes punctuation from a selected word", () =>
	{
		const lookupUrl = CreateLogeionUrl("κατέβην.");
		const decodedUrl = decodeURIComponent(lookupUrl ?? "");

		expect(decodedUrl).toBe("https://logeion.uchicago.edu/κατέβην");
	});
});
