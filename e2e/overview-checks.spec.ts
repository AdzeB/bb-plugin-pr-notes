import { expect, test, type Page, type APIRequestContext } from "./test";
const ref = { repo: "hardbeat920/monocode", number: 1 };
const path = "/plugins/pr-notes/inbox/hardbeat920/monocode/1";
const sha = "2bae484252d4855e64c5006b68d0a977af57a412";
const actor = { login: "octocat", avatarUrl: null };
const posted = {
  kind: "comment",
  id: "comment:999",
  commentId: 999,
  actor,
  createdAt: new Date().toISOString(),
  url: "https://github.com/hardbeat920/monocode/pull/1#issuecomment-999",
  body: "",
  truncated: false,
};
async function rpc(request: APIRequestContext, method: string, input: unknown) {
  return (
    await request.post(`/api/v1/plugins/pr-notes/rpc/${method}`, {
      data: input,
    })
  ).json();
}
async function fixture(page: Page, request: APIRequestContext) {
  const detail = await rpc(request, "detail", ref);
  detail.result.pr.body =
    "## What changed\n\n- `GetApiPayloadBackfillBatchAsync` reads the `raw_payload` column.\n- `ci.yml` runs the new checks.\n\n```typescript\nconst retries = 3;\n```";
  await page.route("**/plugins/pr-notes/rpc/detail", (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({
      json: {
        ok: true,
        result: {
          login: "octocat",
          fetchedAt: new Date().toISOString(),
          truncated: false,
          nextCursor: null,
          prs: [
            {
              ...ref,
              title: detail.result.pr.title,
              status: "open",
              url: detail.result.pr.url,
              author: "octocat",
              isDraft: false,
              updatedAt: new Date().toISOString(),
              reasons: ["review-requested"],
            },
          ],
        },
      },
    }),
  );
  return detail;
}
const activity = () => ({
  items: [
    {
      kind: "commit",
      id: "commit:1",
      actor,
      createdAt: new Date().toISOString(),
      url: "https://github.com/hardbeat920/monocode/commit/" + sha,
      sha,
      title: "Keep backfill retries safe",
    },
    {
      ...posted,
      id: "comment:10",
      commentId: 10,
      actor: { login: "github-actions[bot]", avatarUrl: null },
      body: "## Test Results\n\n**24 passed** ✅ · `dotnet test`",
      url: "https://github.com/hardbeat920/monocode/pull/1#issuecomment-10",
    },
    {
      kind: "review",
      id: "review:1",
      actor,
      createdAt: new Date().toISOString(),
      url: "https://github.com/hardbeat920/monocode/pull/1",
      state: "APPROVED",
      body: "Looks good.",
      truncated: false,
    },
  ],
  page: 1,
  hasMore: false,
  commentCount: 1,
  commitCount: 1,
  canComment: true,
  fetchedAt: new Date().toISOString(),
});

test("real activity and checks load; blank comments never reach GitHub", async ({
  request,
}) => {
  const timeline = await rpc(request, "activity", { ...ref, page: 1 });
  expect(timeline.ok).toBe(true);
  expect(
    timeline.result.items.some(
      (item: { kind: string }) => item.kind === "commit",
    ),
  ).toBe(true);
  expect(
    timeline.result.items.some(
      (item: { kind: string }) => item.kind === "comment",
    ),
  ).toBe(true);
  const checks = await rpc(request, "checks", {
    ...ref,
    headSha: sha,
    page: 1,
  });
  expect(checks.ok).toBe(true);
  expect(checks.result.headSha).toBe(sha);
  expect(
    checks.result.checks.every((check: { bucket: string }) =>
      ["failed", "cancelled", "pending", "passed", "skipped"].includes(
        check.bucket,
      ),
    ),
  ).toBe(true);
  const check = checks.result.checks.find(
    (item: { checkRunId: number | null; annotationCount: number }) =>
      item.checkRunId && item.annotationCount,
  );
  if (check) {
    expect(
      (
        await rpc(request, "checkAnnotations", {
          ...ref,
          headSha: sha,
          checkRunId: check.checkRunId,
          page: 1,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await rpc(request, "checkAnnotations", {
          ...ref,
          headSha: "0".repeat(40),
          checkRunId: check.checkRunId,
          page: 1,
        })
      ).ok,
    ).toBe(false);
  }
  for (const body of ["", "   "])
    expect(
      (
        await rpc(request, "comment", {
          ...ref,
          body,
          requestId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);
});

test("Overview shows clickable file chips and activity, with no duplicate changes or checks sections", async ({
  page,
  request,
}) => {
  await fixture(page, request);
  await page.route("**/plugins/pr-notes/rpc/activity", (route) =>
    route.fulfill({ json: { ok: true, result: activity() } }),
  );
  await page.goto(path);
  const overview = page.getByRole("tabpanel", {
    name: "Overview",
    exact: true,
  });
  await expect(
    overview.locator("code[data-pr-chip]").filter({ hasText: "raw_payload" }),
  ).toBeVisible();
  const chip = overview.getByRole("button", {
    name: "View changes in ci.yml",
    exact: true,
  });
  await expect(chip).toHaveAttribute("data-pr-file-kind", "yml");
  await expect(overview.locator('[data-pr-activity="commit"]')).toContainText(
    "Keep backfill retries safe",
  );
  await expect(
    overview.getByRole("heading", { name: "Test Results", exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByRole("heading", { name: "Changed files", exact: true }),
  ).toHaveCount(0);
  await expect(
    overview.getByRole("heading", { name: "Checks", exact: true }),
  ).toHaveCount(0);
  await chip.click();
  await expect(
    page.getByRole("tab", { name: "Code", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-Code")).toContainText(
    ".github/workflows/ci.yml",
  );
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path: process.env.BB_PR_OVERVIEW_SCREENSHOT ?? "test-results/overview.png",
  });
});

test("comments preserve failed drafts, reuse retry IDs, and append confirmed posts", async ({
  page,
  request,
}) => {
  await fixture(page, request);
  const timeline = activity();
  await page.route("**/plugins/pr-notes/rpc/activity", (route) =>
    route.fulfill({ json: { ok: true, result: timeline } }),
  );
  const submissions: { body: string; requestId: string }[] = [];
  let fail = true;
  await page.route("**/plugins/pr-notes/rpc/comment", async (route) => {
    const input = route.request().postDataJSON();
    submissions.push(input);
    if (fail)
      return route.fulfill({
        json: {
          ok: false,
          error: {
            code: "handler_error",
            message: "Simulated comment failure",
          },
        },
      });
    const comment = { ...posted, body: input.body };
    await new Promise((resolve) => setTimeout(resolve, 150));
    return route.fulfill({ json: { ok: true, result: comment } });
  });
  await page.goto(path);
  const editor = page.getByRole("textbox", {
    name: "Leave a comment",
    exact: true,
  });
  const send = page.getByRole("button", { name: "Comment", exact: true });
  await expect(send).toBeDisabled();
  const body = "Please keep `raw_payload` intact.\n\nThanks!";
  await editor.fill(body);
  await send.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Simulated comment failure" }),
  ).toBeVisible();
  await expect(editor).toHaveValue(body);
  fail = false;
  await editor.press("Control+Enter");
  await editor.press("Control+Enter");
  await expect(editor).toHaveValue("");
  expect(submissions).toHaveLength(2);
  expect(submissions[0]?.requestId).toBe(submissions[1]?.requestId);
  expect(submissions[1]?.body).toBe(body);
  await expect(
    page
      .locator('[data-pr-activity="comment"]')
      .filter({ hasText: "Please keep" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Comment posted" }),
  ).toBeVisible();
});

test("repository picker opens beside the filters without growing the menu", async ({
  page,
  request,
}) => {
  await fixture(page, request);
  await page.goto(path);
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Filter inbox", exact: true });
  const before = await menu.boundingBox();
  await page
    .getByRole("button", { name: "Choose repositories", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose repositories",
    exact: true,
  });
  await expect(picker).toBeVisible();
  const after = await menu.boundingBox();
  const bounds = await picker.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(bounds!.x).toBeGreaterThanOrEqual(after!.x + after!.width);
  const search = picker.getByRole("textbox", {
    name: "Search repositories",
    exact: true,
  });
  await search.fill("monocode");
  await search.press("ArrowLeft");
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(menu).toBeVisible();
});

test("Checks groups jobs and shows failure annotations with commit links", async ({
  page,
  request,
}) => {
  await fixture(page, request);
  await page.route("**/plugins/pr-notes/rpc/activity", (route) =>
    route.fulfill({ json: { ok: true, result: activity() } }),
  );
  const checks = ["failed", "cancelled", "pending", "passed", "skipped"].map(
    (bucket, index) => ({
      id: `run:${index + 1}`,
      checkRunId: index + 1,
      name: [
        "build-and-test",
        "SonarCloud",
        "deploy",
        "format",
        "optional-job",
      ][index],
      workflow: "PR Validation",
      state: ["failure", "cancelled", "in_progress", "success", "skipped"][
        index
      ],
      bucket,
      url: "https://github.com/hardbeat920/monocode/actions/runs/1",
      startedAt: "2026-10-29T10:00:00Z",
      completedAt: bucket === "pending" ? null : "2026-10-29T10:01:30Z",
      title: index === 0 ? "Process completed with exit code 1." : null,
      summary: null,
      annotationCount: index === 0 ? 1 : 0,
    }),
  );
  let calls = 0;
  await page.route("**/plugins/pr-notes/rpc/checks", (route) => {
    ++calls;
    return route.fulfill({
      json: {
        ok: true,
        result: {
          headSha: sha,
          checks,
          total: 5,
          page: 1,
          hasMore: false,
          fetchedAt: new Date().toISOString(),
        },
      },
    });
  });
  await page.route("**/plugins/pr-notes/rpc/checkAnnotations", (route) =>
    route.fulfill({
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
    }),
  );
  await page.goto(path);
  expect(calls).toBe(0);
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  for (const bucket of ["failed", "cancelled", "pending", "passed", "skipped"])
    await expect(page.locator(`[data-pr-check="${bucket}"]`)).toHaveCount(1);
  await page
    .getByRole("button", { name: "build-and-test PR Validation", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: ".github/workflows/ci.yml:18",
      exact: true,
    }),
  ).toHaveAttribute("href", new RegExp(sha));
  await page.getByRole("button", { name: /Needs attention/ }).click();
  await expect(page.locator('[data-pr-check="passed"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  expect(calls).toBe(1);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path: process.env.BB_PR_CHECKS_SCREENSHOT ?? "test-results/checks.png",
  });
});
