async function Main(): Promise<void>
{
	throw new Error("Corpus update requires an explicit upstream revision and is not automated in the starter repository.");
}

Main().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.message : "Corpus update failed.";
	console.error(message);
	process.exitCode = 1;
});
