import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

async function HashFile(filePath: string): Promise<string>
{
	const contents = await fs.readFile(filePath);
	const hash = crypto.createHash("sha256");
	hash.update(contents);
	return hash.digest("hex");
}

async function Main(): Promise<void>
{
	const manifestPath = path.join("corpus", "generated", "manifest.json");
	const manifestText = await fs.readFile(manifestPath, "utf8");
	const manifest = JSON.parse(manifestText) as {
		works?: Array<{
			id: string;
			fileName: string;
		}>;
	};
	const works = manifest.works ?? [];
	const checksumPath = path.join("corpus", "checksums.json");
	const checksumText = await fs.readFile(checksumPath, "utf8");
	const checksumManifest = JSON.parse(checksumText) as Record<string, string>;

	for (const work of works)
	{
		const workPath = path.join("corpus", "generated", "works", work.fileName);
		const workText = await fs.readFile(workPath, "utf8");

		if (workText.includes("[S00001]"))
		{
			throw new Error(`Artificial source identifier detected in ${work.fileName}.`);
		}
	}

	for (const [relativePath, expectedHash] of Object.entries(checksumManifest))
	{
		const actualHash = await HashFile(relativePath);

		if (actualHash !== expectedHash.toLowerCase())
		{
			throw new Error(`Checksum mismatch for ${relativePath}.`);
		}
	}

	console.log("Corpus verification completed.");
}

Main().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.message : "Corpus verification failed.";
	console.error(message);
	process.exitCode = 1;
});
