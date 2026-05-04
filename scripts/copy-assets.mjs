// Copies non-TypeScript assets (prompts, workflow definitions) from src/ to
// dist/ so the compiled CLI can find them at the same relative paths.
import { cpSync } from "node:fs";

cpSync("src/workflows", "dist/workflows", {
  recursive: true,
  filter: (src) => !src.endsWith(".ts"),
});
