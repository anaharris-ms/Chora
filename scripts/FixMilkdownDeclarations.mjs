import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Milkdown 7.22 publishes extensionless declaration imports that NodeNext cannot resolve.
// Only installed declaration specifiers are repaired; runtime packages remain untouched.
const root = fileURLToPath(new URL("../node_modules/@milkdown/", import.meta.url));

// Tests whether a declaration target exists without changing it.
async function ExistsAsync(path)
{
	let exists = true;
	try
	{
		await access(path);
	}
	catch
	{
		exists = false;
	}
	return exists;
}

// Resolves extensionless relative specifiers in installed TypeScript declarations.
async function RepairAsync(directory)
{
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries)
	{
		const path = join(directory, entry.name);
		if (entry.isDirectory()) await RepairAsync(path);
		else if (entry.name.endsWith(".d.ts"))
		{
			const original = await readFile(path, "utf8");
			let content = original;
			const matches = original.matchAll(/(['"])(\.{1,2}\/[^'"\r\n]+)\1/g);
			for (const match of matches)
			{
				const specifier = match[2];
				if (!/\.(?:js|mjs|cjs|json)$/.test(specifier))
				{
					const target = resolve(dirname(path), specifier);
					let replacement = specifier;
					if (await ExistsAsync(`${target}.d.ts`)) replacement += ".js";
					else if (await ExistsAsync(join(target, "index.d.ts"))) replacement += "/index.js";
					content = content.replaceAll(match[0], `${match[1]}${replacement}${match[1]}`);
				}
			}
			if (content !== original) await writeFile(path, content);
		}
	}
}

await RepairAsync(root);