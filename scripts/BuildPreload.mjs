import { build } from "vite";

const isDebugBuild = process.env.CHORA_DEBUG_BUILD === "true";

await build({
	mode: isDebugBuild ? "development" : "production",
	build: {
		emptyOutDir: false,
		lib: {
			entry: "src/preload/preload.ts",
			formats: ["cjs"],
			fileName: () => "preload.js"
		},
		outDir: ".vite/build/src/preload",
		rollupOptions: {
			external: ["electron"],
			output: {
				entryFileNames: "preload.js"
			}
		},
		sourcemap: true,
		minify: isDebugBuild ? false : "esbuild"
	}
});
