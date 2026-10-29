import { expect, test } from "./test";
const ref = { repo: "hardbeat920/monocode", number: 1 };
const path = "/plugins/pr-notes/inbox/hardbeat920/monocode/1";
const capabilities = {
  canUpdate: true,
  canMerge: true,
  mergeMethods: ["merge", "squash", "rebase"],
  mergeable: "MERGEABLE",
  mergeState: "CLEAN",
};

test("real PR controls read access and reject stale or invalid writes", async ({
  request,
}) => {
  const controls = await request.post("/api/v1/plugins/pr-notes/rpc/controls", {
    data: ref,
  });
  expect((await controls.json()).ok).toBe(true);
  const stale = await request.post("/api/v1/plugins/pr-notes/rpc/action", {
    data: { ...ref, action: "merge", expectedHeadSha: "0".repeat(40) },
  });
  const result = await stale.json();
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain("new commits");
  const invalid = await request.post("/api/v1/plugins/pr-notes/rpc/action", {
    data: {
      ...ref,
      action: "merge;touch /tmp/unsafe",
      expectedHeadSha: "0".repeat(40),
    },
  });
  expect((await invalid.json()).ok).toBe(false);
});

test("compact list truncates titles and the filter menu floats above it", async ({
  page,
}) => {
  const title =
    "A complete and very long pull request title that should remain available on hover even when the compact row is too narrow";
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
              title,
              status: "open",
              url: "https://github.com/hardbeat920/monocode/pull/1",
              author: "octocat",
              isDraft: false,
              updatedAt: new Date().toISOString(),
              reasons: ["assigned"],
            },
          ],
        },
      },
    }),
  );
  await page.goto("/plugins/pr-notes/inbox");
  const row = page.locator("[data-pr-row]");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute(
    "title",
    `${title}\nhardbeat920/monocode#1`,
  );
  const list = page.getByRole("complementary", {
    name: "Pull requests",
    exact: true,
  });
  expect((await list.boundingBox())!.width).toBeLessThanOrEqual(256);
  const before = await page.locator("[data-pr-list]").boundingBox();
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Filter inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Assigned to me", exact: true }),
  ).toBeVisible();
  const after = await page.locator("[data-pr-list]").boundingBox();
  expect(after!.height).toBe(before!.height);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Filter inbox", exact: true }),
  ).toBeHidden();
});

test("PR actions require confirmation, preserve the head SHA, and have no Ask button", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/v1/plugins/pr-notes/rpc/detail", {
    data: ref,
  });
  const detail = await response.json();
  detail.result.pr.state = "OPEN";
  detail.result.pr.isDraft = false;
  await page.route("**/plugins/pr-notes/rpc/detail", (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route("**/plugins/pr-notes/rpc/controls", (route) =>
    route.fulfill({ json: { ok: true, result: capabilities } }),
  );
  const writes: Record<string, unknown>[] = [];
  await page.route("**/plugins/pr-notes/rpc/action", (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        ok: true,
        result: { message: "Test action recorded without changing GitHub." },
      },
    });
  });
  await page.goto(path);
  const merge = page.getByRole("button", {
    name: "Merge pull request",
    exact: true,
  });
  await expect(merge).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Ask", exact: true }),
  ).toHaveCount(0);
  await merge.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(detail.result.pr.headRefOid.slice(0, 12));
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(0);
  for (const [button, action] of [
    ["Convert to draft", "draft"],
    ["Close pull request", "close"],
    ["Merge pull request", "merge"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: button, exact: true }).click();
    await expect.poll(() => writes.at(-1)?.action).toBe(action);
    expect(writes.at(-1)).toMatchObject({
      ...ref,
      expectedHeadSha: detail.result.pr.headRefOid,
    });
    await expect(dialog).toBeHidden();
  }
  await page.getByLabel("Merge method", { exact: true }).selectOption("squash");
  await page
    .getByRole("button", { name: "Squash and merge", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Squash and merge", exact: true })
    .click();
  await expect.poll(() => writes.at(-1)?.action).toBe("squash");
});
