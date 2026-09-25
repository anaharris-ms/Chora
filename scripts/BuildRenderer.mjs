import { build } from "vite";

const isDebugBuild = process.env.CHORA_DEBUG_BUILD === "true";

await build({
	base: "./",
	mode: isDebugBuild ? "development" : "production",
	build: {
		outDir: ".vite/renderer",
		emptyOutDir: true,
		sourcemap: true,
		minify: isDebugBuild ? false : "esbuild",
		rollupOptions: {
			input: "src/renderer/index.html"
		}
	}
});
