import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Identifies one parsed CSS rule.
interface CssRule
{
	// Contains the rule selector text.
	readonly selectors: string;
	// Contains declarations belonging to the rule.
	readonly declarations: string;
}

// Parses flat CSS rules needed to enforce Ideas surface geometry.
function ParseRules(css: string): readonly CssRule[]
{
	const rules: CssRule[] = [];
	const pattern = /([^{}]+)\{([^{}]*)\}/g;
	let match = pattern.exec(css);

	while (match !== null)
	{
		const selectors = match[1]?.trim() ?? "";
		const declarations = match[2]?.trim() ?? "";

		if (selectors.length > 0)
		{
			rules.push({ selectors, declarations });
		}

		match = pattern.exec(css);
	}

	return rules;
}

describe("Idea styles", function IdeaStyleTests()
{
	it("keeps every Ideas surface square-cornered", function KeepsIdeaCornersSquare()
	{
		const stylesDirectory = resolve(process.cwd(), "src", "renderer", "styles");
		const stylesheetNames = readdirSync(stylesDirectory).filter(function IsStylesheet(name)
		{
			const isStylesheet = name.endsWith(".css");

			return isStylesheet;
		});
		const roundedIdeaRules: string[] = [];

		for (const stylesheetName of stylesheetNames)
		{
			const stylesheetPath = join(stylesDirectory, stylesheetName);
			const css = readFileSync(stylesheetPath, "utf8");
			const rules = ParseRules(css);

			for (const rule of rules)
			{
				const ownsIdeaSurface = rule.selectors.includes(".idea-");
				const radiusMatch = /border-radius\s*:\s*([^;]+)/.exec(rule.declarations);
				const radius = radiusMatch?.[1].trim() ?? null;

				if (ownsIdeaSurface && radius !== null && radius !== "0")
				{
					roundedIdeaRules.push(`${stylesheetName} · ${rule.selectors}: ${radius}`);
				}
			}
		}

		expect(roundedIdeaRules).toEqual([]);
	});
});
