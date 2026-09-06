import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: true,
  splitting: false,
  // Ship the YAML parser inside the executable: no consumer runtime install.
  noExternal: ["yaml"],
  sourcemap: true,
  banner: {
    // YAML's bundled CommonJS implementation imports Node built-ins.
    js: '#!/usr/bin/env node\nimport { createRequire as createBundledRequire } from "node:module";\nconst require = createBundledRequire(import.meta.url);',
  },
});
