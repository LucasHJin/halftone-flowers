import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite` serves the demo, `vite build` builds the package into dist/, `vite build --mode demo` builds the demo into demo/dist/.
export default defineConfig(({ command, mode }) =>
  command === "build" && mode !== "demo"
    ? {
        plugins: [react()],
        build: {
          lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
          rolldownOptions: {
            external: [/^react(\/|$)/],
            // Marks the package as client code for React Server Components. Bundling drops the directive from sources, so add it to the output.
            output: { banner: '"use client";' },
          },
        },
      }
    : {
        root: "demo",
        // Relative asset paths, so the built demo works from any subpath, e.g. a GitHub Pages project site.
        base: "./",
        plugins: [react()],
        // Resolves `halftone-flowers` to src/index.ts (see tsconfig.json), so the demo imports it as an app would.
        resolve: { tsconfigPaths: true },
      },
);
