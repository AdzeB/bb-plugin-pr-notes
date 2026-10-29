import { expect, test, type Page, type APIRequestContext } from "./test";

const ref = { repo: "hardbeat920/monocode", number: 1 };
const path = "/plugins/pr-notes/inbox/hardbeat920/monocode/1";
const base = "/plugins/pr-notes/inbox";
const row = (number: number, status = "open") => ({
  ...ref,
  number,
  status,
  title: `Review item ${number}`,
  url: `https://github.com/hardbeat920/monocode/pull/${number}`,
  author: "octocat",
  isDraft: status === "draft",
  updatedAt: new Date().toISOString(),
  reasons: ["review-requested"],
});
const result = (prs: unknown[], nextCursor: string | null = null) => ({
  ok: true,
  result: {
    login: "octocat",
    fetchedAt: new Date().toISOString(),
    truncated: false,
    prs,
    nextCursor,
  },
});
async function rpc(request: APIRequestContext, method: string, input: unknown) {
  const response = await request.post(
    `/api/v1/plugins/pr-notes/rpc/${method}`,
    { data: input },
  );
  return response.json();
}
async function fixtureInbox(page: Page) {
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({ json: result([row(1)]) }),
  );
}

test("real inbox pages are bounded, filter before fetching, and reject mismatched cursors", async ({
  request,
}) => {
  const first = await rpc(request, "inbox", { refresh: true });
  expect(first.ok).toBe(true);
  expect(first.result.prs.length).toBeLessThanOrEqual(40);
  if (first.result.nextCursor) {
    const second = await rpc(request, "inbox", {
      cursor: first.result.nextCursor,
    });
    expect(second.ok).toBe(true);
    expect(second.result.prs.length).toBeLessThanOrEqual(40);
    const invalid = await rpc(request, "inbox", {
      cursor: first.result.nextCursor,
      filters: { statuses: ["merged"] },
    });
    expect(invalid.ok).toBe(false);
  }
  const filtered = await rpc(request, "inbox", {
    filters: { statuses: ["open"], time: "7d" },
  });
  expect(filtered.ok).toBe(true);
  expect(
    filtered.result.prs.every((pr: { status: string }) => pr.status === "open"),
  ).toBe(true);
});

test("real code patches are paged and pinned to the current head", async ({
  request,
}) => {
  const code = await rpc(request, "code", { ...ref, page: 1 });
  expect(code.ok).toBe(true);
  expect(code.result.headSha).toMatch(/^[a-f0-9]{40}$/);
  expect(code.result.files.length).toBeLessThanOrEqual(25);
  expect(
    code.result.files.some((file: { patch: string | null }) =>
      file.patch?.includes("@@"),
    ),
  ).toBe(true);
  expect((await rpc(request, "code", { ...ref, page: 0 })).ok).toBe(false);
});

test("filters persist, apply together, and can be cleared", async ({
  page,
}) => {
  const seen: Record<string, unknown>[] = [];
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) => {
    seen.push(route.request().postDataJSON());
    return route.fulfill({
      json: result([row(1), row(2, "draft"), row(3, "merged")]),
    });
  });
  await page.goto(base);
  await expect(page.locator("[data-pr-row]")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Draft", exact: true }).check();
  await page.getByRole("radio", { name: "Last 7 days", exact: true }).check();
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  await expect.poll(() => JSON.stringify(seen.at(-1))).toContain('"7d"');
  await page.reload();
  await page.getByRole("button", { name: /^Filter pull requests/ }).click();
  await expect(
    page.getByRole("checkbox", { name: "Draft", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Last 7 days", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Choose repositories", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search repositories", exact: true })
    .fill("monocode");
  await page
    .getByRole("checkbox", { name: "hardbeat920/monocode", exact: true })
    .check();
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator("[data-pr-row]")).toHaveCount(3);
});

test("infinite scrolling loads another page, retries errors, and deduplicates rows", async ({
  page,
}) => {
  let calls = 0;
  let fail = true;
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) => {
    ++calls;
    if (route.request().postDataJSON().cursor) {
      if (fail)
        return route.fulfill({
          json: {
            ok: false,
            error: {
              code: "handler_error",
              message: "Page unavailable. Retry.",
            },
          },
        });
      return route.fulfill({
        json: result([
          row(20),
          ...Array.from({ length: 5 }, (_, index) => row(index + 21)),
        ]),
      });
    }
    return route.fulfill({
      json: result(
        Array.from({ length: 20 }, (_, index) => row(index + 1)),
        "page-two",
      ),
    });
  });
  await page.goto(base);
  await expect(page.locator("[data-pr-row]")).toHaveCount(20);
  expect(calls).toBe(1);
  await page.locator("[data-pr-list]").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Page unavailable" }),
  ).toBeVisible();
  await expect(page.locator("[data-pr-row]")).toHaveCount(20);
  fail = false;
  await page
    .getByRole("button", { name: "Retry loading more", exact: true })
    .click();
  await expect(page.locator("[data-pr-row]")).toHaveCount(25);
  await expect(
    page.getByText("You’ve reached the end", { exact: true }),
  ).toBeVisible();
});

test("empty inbox and no-match states offer an obvious recovery", async ({
  page,
}) => {
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({ json: result([]) }),
  );
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "No pull requests yet", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search pull requests", exact: true })
    .fill("missing");
  await expect(
    page.getByRole("heading", {
      name: "No pull requests match “missing”",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No pull requests yet", exact: true }),
  ).toBeVisible();
});

test("unified and split code views render real changes", async ({ page }) => {
  await fixtureInbox(page);
  await page.goto(path);
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Changed files", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Changed files", exact: true })
      .getByRole("button")
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Side by side", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#panel-Code")).toContainText("Head ");
  const errors = page.getByRole("alert");
  await expect(errors).toHaveCount(0);
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path: process.env.BB_PR_CODE_SCREENSHOT ?? "test-results/code.png",
  });
});

test("new chat input stays at the bottom on wide and narrow screens", async ({
  page,
}) => {
  await fixtureInbox(page);
  await page.goto(path);
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "What would you like to know about this PR?",
    exact: true,
  });
  await editor.fill("Review the error handling.");
  await expect(
    page.getByText("Loading environments", { exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 650]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    if (
      await page
        .getByRole("dialog", { name: "Sidebar", exact: true })
        .isVisible()
    )
      await page.keyboard.press("Escape");
    await expect(editor).toBeVisible();
    const panel = await page.locator("#panel-Chat").boundingBox();
    const input = await editor.boundingBox();
    expect(panel).not.toBeNull();
    expect(input).not.toBeNull();
    expect(input!.y + input!.height).toBeGreaterThan(
      panel!.y + panel!.height - 180,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: /linux/i })).toBeVisible();
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  await expect(editor).toBeVisible();
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path: process.env.BB_PR_CHAT_SCREENSHOT ?? "test-results/chat.png",
  });
});

test("description renders headings, code chips, and highlighted fences safely", async ({
  page,
  request,
}) => {
  await fixtureInbox(page);
  const detail = await rpc(request, "detail", ref);
  detail.result.pr.title = "Make retry behavior easier to review";
  detail.result.pr.body = [
    "## What changed",
    "",
    "- Keep the current request in `retryRequest()` until it succeeds.",
    "- Show **clear feedback** when the connection drops.",
    "",
    "## Why",
    "",
    "A failed request should keep its draft and show a [useful recovery](https://github.com/hardbeat920/monocode).",
    "",
    "```typescript",
    "const attempts = 3;",
    "async function retryRequest() {",
    "  return await fetch('/api/review');",
    "}",
    "```",
    "",
    "## Review notes",
    "",
    "- [x] Existing behavior stays intact.",
    "- [ ] Verify the connection recovery.",
    "<script>window.prDescriptionExecuted = true</script>",
  ].join("\n");
  await page.route("**/plugins/pr-notes/rpc/detail", (route) =>
    route.fulfill({ json: detail }),
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(path);
  await expect(
    page
      .locator(".pr-main-description")
      .getByRole("heading", { name: "What changed", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".pr-main-description code")
      .filter({ hasText: "retryRequest()" })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".pr-main-description")).toContainText(
    "const attempts = 3;",
  );
  expect(await page.evaluate(() => "prDescriptionExecuted" in window)).toBe(
    false,
  );
  await page.locator('[data-pr-inbox="root"]').screenshot({
    path:
      process.env.BB_PR_DESCRIPTION_SCREENSHOT ??
      "test-results/description.png",
  });
});
