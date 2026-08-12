import { build } from "vite";

await build({
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
		sourcemap: true
	}
});
