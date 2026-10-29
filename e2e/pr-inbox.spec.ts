import { expect, test, type APIRequestContext } from "./test";

const ref = { repo: "hardbeat920/monocode", number: 1 };
const route = "/plugins/pr-notes/inbox/hardbeat920/monocode/1";
async function rpc(request: APIRequestContext, method: string, input: unknown) {
  const response = await request.post(
    `/api/v1/plugins/pr-notes/rpc/${method}`,
    { data: input },
  );
  return { response, body: await response.json() };
}

test("GitHub context is real, bounded, and pinned to a head SHA", async ({
  request,
}) => {
  const { body } = await rpc(request, "detail", ref);
  expect(body.ok).toBe(true);
  expect(body.result.pr.url).toBe(
    "https://github.com/hardbeat920/monocode/pull/1",
  );
  expect(body.result.pr.headRefOid).toMatch(/^[a-f0-9]{40}$/);
  expect(body.result.pr.files.length).toBeLessThanOrEqual(100);
});

test("RPC rejects command injection and invalid note values", async ({
  request,
}) => {
  for (const input of [
    { repo: "x/y;touch /tmp/unsafe", number: 1 },
    { ...ref, number: -1 },
  ]) {
    expect((await rpc(request, "detail", input)).body.ok).toBe(false);
  }
  expect(
    (
      await rpc(request, "saveNote", {
        ...ref,
        body: "x".repeat(60_001),
        expectedVersion: 0,
      })
    ).body.ok,
  ).toBe(false);
});

test("private notes persist and reject competing edits", async ({
  request,
}) => {
  const before = (await rpc(request, "note", ref)).body.result;
  const value = `PR Notes E2E ${Date.now()}\n**Private** <script>throw new Error('unsafe')</script>`;
  let version = before.version;
  try {
    const saved = (
      await rpc(request, "saveNote", {
        ...ref,
        body: value,
        expectedVersion: version,
      })
    ).body.result;
    expect(saved.kind).toBe("saved");
    version = saved.note.version;
    expect((await rpc(request, "note", ref)).body.result.body).toBe(value);
    const conflict = (
      await rpc(request, "saveNote", {
        ...ref,
        body: "stale edit",
        expectedVersion: before.version,
      })
    ).body.result;
    expect(conflict.kind).toBe("conflict");
    expect(conflict.note.body).toBe(value);
  } finally {
    await rpc(request, "saveNote", {
      ...ref,
      body: before.body,
      expectedVersion: version,
    });
  }
});

test("inbox loads, notes keep drafts, refresh stays safe, and narrow layouts work", async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
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
              title: "Linux support and UI polish",
              url: "https://github.com/hardbeat920/monocode/pull/1",
              author: "contributor",
              isDraft: false,
              status: "open",
              updatedAt: new Date().toISOString(),
              reasons: ["review-requested", "assigned"],
            },
          ],
        },
      },
    }),
  );
  await page.goto(route);
  await expect(
    page
      .getByRole("heading", { name: "Linux support and UI polish" })
      .or(page.getByRole("heading", { name: /linux/i })),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Review requested", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Private PR notes" });
  await expect(editor).toBeVisible();
  await editor.fill("Unsaved browser draft <script>alert('x')</script>");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(editor).toHaveValue(
    "Unsaved browser draft <script>alert('x')</script>",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(editor).toHaveValue(
    "Unsaved browser draft <script>alert('x')</script>",
  );
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await expect(
    page.getByText("Ask about this PR", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: /linux/i })).toBeVisible();
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path: process.env.BB_PR_SCREENSHOT ?? "test-results/inbox.png",
  });
  await page.setViewportSize({ width: 650, height: 920 });
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(exceptions).toEqual([]);
});

test("native chat submission carries PR context and preserves a draft when creation fails", async ({
  page,
}) => {
  let submission: Record<string, unknown> | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/threads")
    ) {
      submission = request.postDataJSON();
      await route.fulfill({
        status: 503,
        json: { error: "E2E simulated create failure" },
      });
    } else await route.continue();
  });
  await page.goto(route);
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "What would you like to know about this PR?",
  });
  await editor.fill("Explain this PR without changing files.");
  const send = page.getByRole("button", {
    name: "Submit (Enter)",
    exact: true,
  });
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => submission).not.toBeNull();
  expect(submission).toMatchObject({
    projectId: "proj_personal",
    originPluginId: "pr-notes",
  });
  expect(JSON.stringify(submission)).toContain("headRefOid");
  expect(JSON.stringify(submission)).toContain("privateNotes");
  expect(JSON.stringify(submission)).toContain(
    "Explain this PR without changing files.",
  );
  expect(JSON.stringify(submission)).toContain("executionInputSources");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /E2E|503|failed/i })
      .first(),
  ).toBeVisible();
  await expect(editor).toContainText("Explain this PR without changing files.");
});

test("a failed inbox refresh has a recoverable error", async ({ page }) => {
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({
      json: {
        ok: false,
        error: {
          code: "handler_error",
          message: "GitHub login expired. Run gh auth login on the BB server.",
        },
      },
    }),
  );
  await page.goto("/plugins/pr-notes/inbox");
  await expect(
    page.getByRole("alert").filter({ hasText: "GitHub" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh inbox", exact: true }),
  ).toBeEnabled();
});
