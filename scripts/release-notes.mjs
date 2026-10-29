import fs from "node:fs";
const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const changelog = fs.readFileSync(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
const tag = process.argv[2] ?? "--check";
if (tag !== "--check" && tag !== `v${pkg.version}`)
  throw new Error(`Tag ${tag} does not match package version ${pkg.version}`);
const heading = `## ${pkg.version}`;
const start = changelog
  .split("\n")
  .findIndex((line) => line === heading || line.startsWith(`${heading} - `));
if (start < 0) throw new Error(`Missing changelog entry for ${pkg.version}`);
const lines = changelog.split("\n").slice(start + 1);
const end = lines.findIndex((line) => line.startsWith("## "));
const notes = (end < 0 ? lines : lines.slice(0, end)).join("\n").trim();
if (!notes) throw new Error("Release notes are empty");
if (tag !== "--check") process.stdout.write(`${notes}\n`);
