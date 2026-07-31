import { build } from "vite";

await build({
	base: "./",
	build: {
		outDir: ".vite/renderer",
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			input: "src/renderer/index.html"
		}
	}
});
