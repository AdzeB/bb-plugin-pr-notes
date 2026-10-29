import { expect, test } from "./test";
const ref = { repo: "hardbeat920/monocode", number: 1 };
const base = "/plugins/pr-notes/inbox";
const url = `${base}/hardbeat920/monocode/1`;
const row = (number: number) => ({
  ...ref,
  number,
  title: `PR ${number}`,
  status: "open",
  url: `https://github.com/${ref.repo}/pull/${number}`,
  author: "octocat",
  isDraft: false,
  updatedAt: new Date().toISOString(),
  reasons: ["review-requested"],
});

test("PR navigation reuses cached reads and explicit refresh fetches again", async ({
  page,
  request,
}) => {
  const detail = await (
    await request.post("/api/v1/plugins/pr-notes/rpc/detail", { data: ref })
  ).json();
  const code = await (
    await request.post("/api/v1/plugins/pr-notes/rpc/code", { data: ref })
  ).json();
  const counts = {
    inbox: 0,
    detail: 0,
    controls: 0,
    code: 0,
    note: 0,
    chats: 0,
  };
  const refreshes: unknown[] = [];
  await page.route("**/plugins/pr-notes/rpc/**", (route) => {
    const method = route.request().url().split("/").at(-1);
    const input = route.request().postDataJSON();
    if (method === "inbox") {
      ++counts.inbox;
      return route.fulfill({
        json: {
          ok: true,
          result: {
            login: "octocat",
            fetchedAt: new Date().toISOString(),
            truncated: false,
            nextCursor: null,
            prs: [row(1), row(2)],
          },
        },
      });
    }
    if (method === "detail") {
      ++counts.detail;
      refreshes.push(input.refresh);
      return route.fulfill({
        json: {
          ...detail,
          result: {
            ...detail.result,
            pr: {
              ...detail.result.pr,
              number: input.number,
              title: `PR ${input.number}`,
            },
          },
        },
      });
    }
    if (method === "code") {
      ++counts.code;
      return route.fulfill({ json: code });
    }
    if (method === "controls") {
      ++counts.controls;
      return route.fulfill({
        json: {
          ok: true,
          result: {
            canUpdate: false,
            canMerge: false,
            mergeMethods: [],
            mergeable: "UNKNOWN",
            mergeState: "UNKNOWN",
          },
        },
      });
    }
    if (method === "note") {
      ++counts.note;
      return route.fulfill({
        json: { ok: true, result: { body: "", version: 0, updatedAt: null } },
      });
    }
    if (method === "chats") {
      ++counts.chats;
      return route.fulfill({
        json: { ok: true, result: { chats: [], truncated: false } },
      });
    }
    return route.continue();
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "PR 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Changed files", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ask about this PR", exact: true }),
  ).toBeVisible();
  await page.locator('[data-pr-row="hardbeat920/monocode#2"]').click();
  await expect(
    page.getByRole("heading", { name: "PR 2", exact: true }),
  ).toBeVisible();
  await page.locator('[data-pr-row="hardbeat920/monocode#1"]').click();
  await expect(
    page.getByRole("heading", { name: "PR 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "What would you like to know about this PR?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Changed files", exact: true }),
  ).toBeVisible();
  expect(counts).toEqual({
    inbox: 1,
    detail: 2,
    controls: 2,
    code: 1,
    note: 2,
    chats: 1,
  });
  await page
    .getByRole("button", { name: "Refresh PR details", exact: true })
    .click();
  await expect.poll(() => counts.detail).toBe(3);
  await expect.poll(() => counts.code).toBe(2);
  expect(refreshes.at(-1)).toBe(true);
});

test("header is removed and opening a PR only shows its URL input when requested", async ({
  page,
}) => {
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({
      json: {
        ok: true,
        result: {
          login: "octocat",
          fetchedAt: new Date().toISOString(),
          truncated: false,
          nextCursor: null,
          prs: [row(1)],
        },
      },
    }),
  );
  await page.goto(base);
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  const root = await page.locator('[data-pr-inbox="root"]').boundingBox();
  const list = await page
    .getByRole("complementary", { name: "Pull requests", exact: true })
    .boundingBox();
  expect(list!.y).toBe(root!.y);
  await expect(
    page.getByRole("textbox", { name: "Pull request URL", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open a pull request", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Open pull request",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("textbox", { name: "Pull request URL", exact: true })
    .fill("invalid");
  await panel.getByRole("button", { name: "Open", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("GitHub");
  await panel
    .getByRole("textbox", { name: "Pull request URL", exact: true })
    .fill("https://github.com/hardbeat920/monocode/pull/1");
  await panel.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/hardbeat920/monocode/1$"));
  await expect(panel).toBeHidden();
});

test("repository choices stay collapsed and can be searched or entered directly", async ({
  page,
}) => {
  await page.route("**/plugins/pr-notes/rpc/inbox", (route) =>
    route.fulfill({
      json: {
        ok: true,
        result: {
          login: "octocat",
          fetchedAt: new Date().toISOString(),
          truncated: false,
          nextCursor: null,
          prs: [row(1)],
        },
      },
    }),
  );
  await page.goto(base);
  await expect(page.locator("[data-pr-row]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Filter pull requests", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search repositories", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Choose repositories", exact: true })
    .click();
  const search = page.getByRole("textbox", {
    name: "Search repositories",
    exact: true,
  });
  await search.fill("monocode");
  await expect(
    page.getByRole("checkbox", { name: "hardbeat920/monocode", exact: true }),
  ).toBeVisible();
  await search.fill("octocat/hello-world");
  await page
    .getByRole("button", { name: "Use octocat/hello-world", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose repositories", exact: true }),
  ).toContainText("1 selected");
});
