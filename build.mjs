import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const srcDir = path.join(root, "src");
const emitted = [];

async function build() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(srcDir, "content", "main.ts")],
    bundle: true,
    outfile: path.join(distDir, "content.js"),
    format: "iife",
    platform: "browser",
    target: "es2019",
    minify: false,
    loader: { ".css": "text" },
  });
  if (result.errors.length > 0) {
    throw new Error(`esbuild reported errors: ${result.errors.map((e) => e.text).join("; ")}`);
  }
  emitted.push("dist/content.js");

  copyFileSync(path.join(root, "manifest.json"), path.join(distDir, "manifest.json"));
  emitted.push("dist/manifest.json");

  const stylesSource = path.join(srcDir, "ui", "styles.css");
  if (existsSync(stylesSource)) {
    const uiDir = path.join(distDir, "ui");
    mkdirSync(uiDir, { recursive: true });
    copyFileSync(stylesSource, path.join(uiDir, "styles.css"));
    emitted.push("dist/ui/styles.css");
  }

  const profilesSource = path.join(root, "profiles");
  if (existsSync(profilesSource)) {
    const profileFiles = readdirSync(profilesSource)
      .filter((name) => name.endsWith(".json"))
      .sort();
    if (profileFiles.length > 0) {
      const profilesDist = path.join(distDir, "profiles");
      mkdirSync(profilesDist, { recursive: true });
      for (const name of profileFiles) {
        copyFileSync(path.join(profilesSource, name), path.join(profilesDist, name));
        emitted.push(`dist/profiles/${name}`);
      }
      writeFileSync(path.join(profilesDist, "index.json"), JSON.stringify(profileFiles, null, 2));
      emitted.push("dist/profiles/index.json");
    }
  }

  console.log("Build complete. Output files:");
  for (const file of emitted) {
    console.log(`  ${file}`);
  }
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
