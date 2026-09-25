import { app } from "electron";
import path from "node:path";

export function ResolveResourcePath(...segments: string[]): string
{
	const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
	const resolvedPath = path.join(basePath, ...segments);
	return resolvedPath;
}

// The generated corpus lives under corpus/generated in the repo and is packaged
// as a top-level "generated" resource, so the prefix differs between the two.
export function ResolveCorpusPath(...segments: string[]): string
{
	const corpusSegments = app.isPackaged ? ["generated", ...segments] : ["corpus", "generated", ...segments];
	const resolvedPath = ResolveResourcePath(...corpusSegments);
	return resolvedPath;
}
