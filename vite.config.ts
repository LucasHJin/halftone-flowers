import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite` serves the demo, `vite build` builds the package into dist/, and `vite build --mode demo` builds the demo site into demo/dist/.
export default defineConfig(({ command, mode }) =>
  command === "build" && mode !== "demo"
    ? {
        plugins: [react()],
        build: {
          lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
          rolldownOptions: {
            external: [/^react(\/|$)/],
            // Marks the package as client code for React Server Components (Next.js). Bundling drops the directive from source files, so it goes on the output.
            output: { banner: '"use client";' },
          },
        },
      }
    : {
        root: "demo",
        // Relative asset paths, so the built demo works from any subpath, such as a GitHub Pages project site.
        base: "./",
        plugins: [react()],
        // Points `halftone-flowers` at src/index.ts (see tsconfig.json), so the demo imports the package the way an app would.
        resolve: { tsconfigPaths: true },
      },
);
