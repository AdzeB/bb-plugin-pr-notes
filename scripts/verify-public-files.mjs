import fs from "node:fs";
import path from "node:path";
const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
for (const file of [
  "README.md",
  "PLUGIN_OVERVIEW.md",
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
]) {
  if (!fs.existsSync(new URL(file, root))) throw new Error(`Missing ${file}`);
}
if (
  pkg.repository?.url !== "git+https://github.com/AdzeB/bb-plugin-pr-notes.git"
)
  throw new Error("Unexpected public repository");
const overview = fs.readFileSync(new URL("PLUGIN_OVERVIEW.md", root), "utf8");
if (
  overview.length > 4000 ||
  /^# /m.test(overview) ||
  /<[^>]+>|!\[|^\|/m.test(overview)
)
  throw new Error("Overview contains unsupported content");
const forbidden =
  /\/Users\/[A-Za-z0-9._-]+\/|\bthr_[a-z0-9]{8,}\b|BB_(?:API_)?TOKEN\s*=|gh[pousr]_[A-Za-z0-9]{20,}/;
const excluded = new Set([
  "node_modules",
  "dist",
  ".git",
  "test-results",
  "playwright-report",
]);
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(filename);
    else if (
      /\.(?:ts|tsx|mjs|json|md|yml|yaml|css|svg)$/.test(entry.name) &&
      forbidden.test(fs.readFileSync(filename, "utf8"))
    )
      throw new Error(
        `Private data in ${path.relative(root.pathname, filename)}`,
      );
  }
}
scan(root.pathname);
for (const name of ["overview.png", "checks.png", "code.png", "chat.png"]) {
  const file = new URL(`docs/screenshots/${name}`, root);
  const png = fs.readFileSync(file);
  if (
    png.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    png.length > 2 * 1024 * 1024 ||
    png.readUInt32BE(16) < 1200
  )
    throw new Error(`Invalid marketplace screenshot: ${name}`);
}
console.log("Public files and screenshot dimensions passed.");
