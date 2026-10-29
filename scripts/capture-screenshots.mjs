import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const server = process.env.BB_SERVER_URL ?? "http://127.0.0.1:38886";
const ref = { repo: "hardbeat920/monocode", number: 1 };
const routePath = "/plugins/pr-notes/inbox/hardbeat920/monocode/1";
const output = path.resolve("docs/screenshots");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BB_PR_CHROMIUM
    ? { executablePath: process.env.BB_PR_CHROMIUM }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1350 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const response = await page.request.post(
    `${server}/api/v1/plugins/pr-notes/rpc/detail`,
    { data: ref },
  );
  const detail = await response.json();
  if (!detail.ok) throw new Error(detail.error.message);
  detail.result.bodyTruncated = false;
  detail.result.pr.body = [
    "## What changed",
    "",
    "- `src/lib/platform.ts` keeps platform checks in one place.",
    "- `ci.yml` validates Linux alongside macOS.",
    "- Window controls and keyboard shortcuts follow the selected platform.",
    "",
    "```typescript",
    "const modifier = platform === 'macos' ? '⌘' : 'Ctrl';",
    "```",
    "",
    "## Review notes",
    "",
    "- Keep platform-specific changes scoped.",
    "- Confirm that existing macOS behavior stays intact.",
  ].join("\n");
  const now = new Date().toISOString();
  const sha = detail.result.pr.headRefOid;
  const author = detail.result.pr.author?.login ?? "contributor";
  const items = [
    {
      kind: "commit",
      id: "commit:sample",
      actor: { login: author, avatarUrl: null },
      createdAt: now,
      url: `https://github.com/${ref.repo}/commit/${sha}`,
      sha,
      title: "Scope platform behavior and update CI",
    },
    {
      kind: "comment",
      id: "comment:sample",
      commentId: 1,
      actor: { login: "github-actions[bot]", avatarUrl: null },
      createdAt: now,
      url: detail.result.pr.url,
      body: "## CI results\n\nBuild and formatting checks completed. ✅",
      truncated: false,
    },
  ];
  const activity = {
    items,
    page: 1,
    hasMore: false,
    commentCount: 1,
    commitCount: 1,
    canComment: true,
    fetchedAt: now,
  };
  const checks = ["failed", "cancelled", "passed", "passed", "skipped"].map(
    (bucket, index) => ({
      id: `run:${index + 1}`,
      checkRunId: index + 1,
      name: [
        "build-and-test",
        "Code analysis",
        "format",
        "typecheck",
        "optional-job",
      ][index],
      workflow: "PR Validation",
      state: ["failure", "cancelled", "success", "success", "skipped"][index],
      bucket,
      url: detail.result.pr.url + "/checks",
      startedAt: "2026-10-29T10:00:00Z",
      completedAt: "2026-10-29T10:01:30Z",
      title: index === 0 ? "Process completed with exit code 1." : null,
      summary: null,
      annotationCount: index === 0 ? 1 : 0,
    }),
  );
  await page.route("**/api/v1/plugins/pr-notes/rpc/**", (route) => {
    const method = route.request().url().split("/").at(-1);
    if (method === "comment" || method === "action") return route.abort();
    if (method === "detail") return route.fulfill({ json: detail });
    if (method === "inbox")
      return route.fulfill({
        json: {
          ok: true,
          result: {
            login: "octocat",
            fetchedAt: now,
            truncated: false,
            nextCursor: null,
            prs: [
              {
                ...ref,
                title: detail.result.pr.title,
                status: "merged",
                url: detail.result.pr.url,
                author,
                isDraft: false,
                updatedAt: now,
                reasons: ["review-requested"],
              },
            ],
          },
        },
      });
    if (method === "activity")
      return route.fulfill({ json: { ok: true, result: activity } });
    if (method === "checks")
      return route.fulfill({
        json: {
          ok: true,
          result: {
            headSha: sha,
            checks,
            total: checks.length,
            page: 1,
            hasMore: false,
            fetchedAt: now,
          },
        },
      });
    if (method === "checkAnnotations")
      return route.fulfill({
        json: {
          ok: true,
          result: {
            page: 1,
            hasMore: false,
            items: [
              {
                path: ".github/workflows/ci.yml",
                startLine: 18,
                endLine: 18,
                level: "failure",
                title: "Build failed",
                message: "Process completed with exit code 1.",
                rawDetails: null,
              },
            ],
          },
        },
      });
    if (method === "chats")
      return route.fulfill({
        json: { ok: true, result: { chats: [], truncated: false } },
      });
    return route.continue();
  });
  await page.route("**/api/v1/threads", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        "[data-sonner-toaster] { visibility: hidden !important; pointer-events: none !important; }";
      document.head.append(style);
    });
  });
  await page.goto(`${server}${routePath}`);
  const surface = page.locator('[data-pr-inbox="root"]');
  await page
    .getByRole("button", { name: "View changes in ci.yml", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Leave a comment", exact: true })
    .waitFor();
  await page.locator("[data-pr-row]").waitFor();
  await page
    .getByText("Checking access…", { exact: true })
    .waitFor({ state: "hidden" });
  const capture = async (name) => {
    await surface.evaluate((element) => {
      for (let node = element; node; node = node.parentElement)
        node.scrollTop = 0;
      for (const node of element.querySelectorAll(
        'section[aria-label^="Pull request"], [role="tabpanel"]',
      ))
        node.scrollTop = 0;
    });
    const clip = await surface.boundingBox();
    if (!clip) throw new Error("The plugin surface is not visible");
    await page.screenshot({ path: path.join(output, name), clip });
  };
  await capture("overview.png");
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  await page
    .getByRole("button", { name: "build-and-test PR Validation", exact: true })
    .click();
  await page
    .getByRole("link", { name: ".github/workflows/ci.yml:18", exact: true })
    .waitFor();
  await capture("checks.png");
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Changed files", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  await capture("code.png");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "What would you like to know about this PR?",
    exact: true,
  });
  await editor.fill(
    "Review the platform changes and point out anything that could affect macOS.",
  );
  await page
    .getByText("Loading environments", { exact: true })
    .waitFor({ state: "hidden" });
  await capture("chat.png");
  console.log(
    "Captured four plugin screenshots at device-pixel ratio 2. All mutations were blocked.",
  );
} finally {
  await browser.close();
}
