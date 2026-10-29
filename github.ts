import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadCache } from "./read-cache";
import { createActivityClient } from "./github-activity";
import { createChecksClient } from "./github-checks";
import { z } from "zod";
import {
  repositorySchema,
  statusSchema,
  filterStart,
  defaultFilters,
  type InboxFilters,
} from "./filters";

const exec = promisify(execFile);
export const prRefSchema = z.object({
  repo: repositorySchema,
  number: z.number().int().positive().max(2_147_483_647),
});
export type PrRef = z.infer<typeof prRefSchema>;
export const prKey = ({ repo, number }: PrRef) =>
  `${repo.toLowerCase()}#${number}`;
export const prUrl = ({ repo, number }: PrRef) =>
  `https://github.com/${repo}/pull/${number}`;
export const reasonSchema = z.enum(["assigned", "review-requested"]);
export const inboxPrSchema = prRefSchema.extend({
  title: z.string(),
  url: z.url(),
  author: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  reasons: z.array(reasonSchema),
  status: statusSchema,
});
export type InboxPr = z.infer<typeof inboxPrSchema>;
export const inboxSchema = z.object({
  login: z.string(),
  fetchedAt: z.string(),
  truncated: z.boolean(),
  nextCursor: z.string().nullable(),
  prs: z.array(inboxPrSchema),
});
export type Inbox = z.infer<typeof inboxSchema>;
const searchRowSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  author: z.object({ login: z.string() }).nullable(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  repository: z.object({ nameWithOwner: z.string() }),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
});
const searchGroupSchema = z.object({
  issueCount: z.number(),
  nodes: z.array(searchRowSchema),
  pageInfo: z.object({
    endCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
  }),
});
const searchResultSchema = z.object({
  data: z.object({
    assigned: searchGroupSchema.optional(),
    reviews: searchGroupSchema.optional(),
  }),
});
const cursorStreamSchema = z.object({
  after: z.string().max(1_024).nullable(),
  done: z.boolean(),
  count: z.number().int().min(0).max(1_000),
});
const cursorSchema = z.object({
  key: z.string().length(24),
  startedAt: z.number().int().nonnegative(),
  groups: z
    .array(
      z.object({ assigned: cursorStreamSchema, reviews: cursorStreamSchema }),
    )
    .max(4),
});
const searchQuery = `query($assigned: String!, $reviews: String!, $assignedAfter: String, $reviewsAfter: String, $getAssigned: Boolean!, $getReviews: Boolean!) {
  assigned: search(query: $assigned, type: ISSUE, first: 20, after: $assignedAfter) @include(if: $getAssigned) { issueCount pageInfo { endCursor hasNextPage } nodes { ...pr } }
  reviews: search(query: $reviews, type: ISSUE, first: 20, after: $reviewsAfter) @include(if: $getReviews) { issueCount pageInfo { endCursor hasNextPage } nodes { ...pr } }
}
fragment pr on PullRequest { number title url isDraft updatedAt state author { login } repository { nameWithOwner } }`;
const personSchema = z.object({ login: z.string() }).nullable();
const commentSchema = z.object({
  body: z.string(),
  author: personSchema,
  url: z.string().optional(),
  createdAt: z.string().optional(),
});
export const detailPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  state: z.string(),
  isDraft: z.boolean(),
  headRefOid: z.string().regex(/^[a-f0-9]{40}$/i),
  baseRefName: z.string(),
  headRefName: z.string(),
  author: personSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  assignees: z.array(z.object({ login: z.string() })),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  reviewDecision: z.string().nullable(),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    }),
  ),
  comments: z.array(commentSchema),
  reviews: z.array(
    z.object({
      body: z.string(),
      state: z.string(),
      author: personSchema,
      submittedAt: z.string().nullable(),
    }),
  ),
  statusCheckRollup: z
    .array(
      z.object({
        name: z.string().optional(),
        context: z.string().optional(),
        status: z.string().optional(),
        conclusion: z.string().optional(),
        state: z.string().optional(),
      }),
    )
    .nullable(),
});
export const detailSchema = z.object({
  pr: detailPrSchema,
  fetchedAt: z.string(),
  truncated: z.boolean(),
  bodyTruncated: z.boolean().default(false),
});
export type Detail = z.infer<typeof detailSchema>;
const githubFileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
});
export const diffPageSchema = z.object({
  headSha: z.string(),
  page: z.number(),
  hasMore: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      previousPath: z.string().nullable(),
      status: z.string(),
      additions: z.number(),
      deletions: z.number(),
      patch: z.string().nullable(),
      tooLarge: z.boolean(),
    }),
  ),
});
export type DiffPage = z.infer<typeof diffPageSchema>;
export const prActionSchema = z.enum([
  "merge",
  "squash",
  "rebase",
  "draft",
  "ready",
  "close",
  "reopen",
]);
export type PrAction = z.infer<typeof prActionSchema>;
export const controlsSchema = z.object({
  canUpdate: z.boolean(),
  canMerge: z.boolean(),
  mergeMethods: z.array(z.enum(["merge", "squash", "rebase"])),
  mergeable: z.string(),
  mergeState: z.string(),
});
export type PrControls = z.infer<typeof controlsSchema>;

export function githubClient(lifecycle: AbortSignal) {
  async function gh(args: string[], signal?: AbortSignal, input?: string) {
    try {
      const task = exec("gh", args, {
        env: {
          ...process.env,
          GH_HOST: "github.com",
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
        },
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
        signal: signal ? AbortSignal.any([lifecycle, signal]) : lifecycle,
      });
      if (input !== undefined) {
        task.child.stdin?.on("error", () => {});
        task.child.stdin?.end(input);
      }
      const result = await task;
      return result.stdout;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if ("code" in error && error.code === "ENOENT")
        throw new Error(
          "GitHub CLI is missing. Install gh and run gh auth login on the BB server.",
        );
      if ("killed" in error && error.killed)
        throw new Error(
          "GitHub request timed out or exceeded its output limit. Try again or open this PR on GitHub.",
        );
      const message =
        "stderr" in error && typeof error.stderr === "string"
          ? error.stderr.trim().slice(0, 500)
          : error.message.slice(0, 500);
      throw new Error(
        `GitHub request failed. Check the connection and GitHub access on the BB server, then try again. ${message}`,
      );
    }
  }
  const activityClient = createActivityClient(gh);
  const checksClient = createChecksClient(gh);
  const cache = new Map<string, Inbox>();
  const inFlight = new Map<string, Promise<Inbox>>();
  async function inbox(
    refresh = false,
    filters: InboxFilters = defaultFilters(),
    cursor?: string,
  ): Promise<Inbox> {
    const filterKey = createHash("sha256")
      .update(
        JSON.stringify({
          ...filters,
          statuses: [...new Set(filters.statuses)].sort(),
          excludedRepos: [...filters.excludedRepos].sort(),
          repositories: [...filters.repositories].sort(),
        }),
      )
      .digest("hex")
      .slice(0, 24);
    const key = `${filterKey}:${cursor ?? "first"}`;
    const cached = cache.get(key);
    if (
      !refresh &&
      cached &&
      Date.now() - Date.parse(cached.fetchedAt) < 5 * 60_000
    )
      return cached;
    const current = inFlight.get(key);
    if (current) return current;
    const pending = (async () => {
      const login = (
        await gh(["api", "--hostname", "github.com", "user", "--jq", ".login"])
      ).trim();
      const statusQueries = {
        open: "is:open draft:false",
        draft: "is:open draft:true",
        closed: "is:closed is:unmerged",
        merged: "is:merged",
      };
      const statuses = [...new Set(filters.statuses)].sort();
      const variants =
        statuses.length === 0 || statuses.length === 4
          ? [""]
          : statuses.map((status) => statusQueries[status]);
      const previous = cursor
        ? cursorSchema.parse(
            JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
          )
        : null;
      if (
        previous &&
        (previous.key !== filterKey ||
          previous.groups.length !== variants.length)
      )
        throw new Error(
          "These filters changed. Refresh the inbox to start a new page.",
        );
      const freshStream = (done: boolean) => ({ after: null, done, count: 0 });
      const groups =
        previous?.groups ??
        variants.map(() => ({
          assigned: freshStream(filters.scope === "reviews"),
          reviews: freshStream(filters.scope === "assigned"),
        }));
      const startedAt = previous?.startedAt ?? Date.now();
      const start = filterStart(filters, startedAt);
      const suffix = [
        start ? `updated:>=${new Date(start).toISOString()}` : "",
        ...filters.excludedRepos.map((repo) => `-repo:${repo}`),
        ...filters.repositories.map((repo) => `repo:${repo}`),
        ...filters.query
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((term) => JSON.stringify(term)),
      ]
        .filter(Boolean)
        .join(" ");
      const results = await Promise.all(
        variants.map((status, index) => {
          const group = groups[index]!;
          const base = `is:pr sort:updated-desc ${status} ${suffix}`;
          return gh([
            "api",
            "--hostname",
            "github.com",
            "graphql",
            "-f",
            `query=${searchQuery}`,
            "-f",
            `assigned=${base} assignee:${login}`,
            "-f",
            `reviews=${base} review-requested:${login}`,
            "-F",
            `getAssigned=${!group.assigned.done}`,
            "-F",
            `getReviews=${!group.reviews.done}`,
            ...(group.assigned.after
              ? ["-f", `assignedAfter=${group.assigned.after}`]
              : []),
            ...(group.reviews.after
              ? ["-f", `reviewsAfter=${group.reviews.after}`]
              : []),
          ]);
        }),
      );
      const prs = new Map<string, InboxPr>();
      let truncated = false;
      for (const [index, result] of results.entries()) {
        const { data } = searchResultSchema.parse(JSON.parse(result));
        for (const [reason, streamKey] of [
          ["assigned", "assigned"],
          ["review-requested", "reviews"],
        ] as const) {
          const group = data[streamKey];
          if (!group) continue;
          const stream = groups[index]![streamKey];
          stream.count += group.nodes.length;
          stream.after = group.pageInfo.endCursor;
          stream.done = !group.pageInfo.hasNextPage || stream.count >= 1_000;
          if (stream.count >= 1_000 && group.pageInfo.hasNextPage)
            truncated = true;
          for (const row of group.nodes) {
            const ref = prRefSchema.parse({
              repo: row.repository.nameWithOwner,
              number: row.number,
            });
            const old = prs.get(prKey(ref));
            if (old && !old.reasons.includes(reason)) old.reasons.push(reason);
            else if (!old)
              prs.set(prKey(ref), {
                ...ref,
                title: row.title,
                url: prUrl(ref),
                author: row.author?.login ?? "deleted-user",
                isDraft: row.isDraft,
                updatedAt: row.updatedAt,
                status:
                  row.state === "MERGED"
                    ? "merged"
                    : row.state === "CLOSED"
                      ? "closed"
                      : row.isDraft
                        ? "draft"
                        : "open",
                reasons: [reason],
              });
          }
        }
      }
      const hasMore = groups.some(
        (group) => !group.assigned.done || !group.reviews.done,
      );
      const nextCursor = hasMore
        ? Buffer.from(
            JSON.stringify({ key: filterKey, startedAt, groups }),
          ).toString("base64url")
        : null;
      const next = {
        login,
        fetchedAt: new Date().toISOString(),
        truncated,
        nextCursor,
        prs: [...prs.values()].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      };
      if (cache.size >= 10) cache.delete(cache.keys().next().value ?? "");
      cache.set(key, next);
      return next;
    })();
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(key);
    }
  }
  async function fetchDetail(
    ref: PrRef,
    signal?: AbortSignal,
  ): Promise<Detail> {
    const raw = await gh(
      [
        "pr",
        "view",
        prUrl(ref),
        "--json",
        "number,title,body,url,state,isDraft,headRefOid,baseRefName,headRefName,author,createdAt,updatedAt,assignees,additions,deletions,changedFiles,files,comments,reviews,statusCheckRollup,reviewDecision",
      ],
      signal,
    );
    const pr = detailPrSchema.parse(JSON.parse(raw));
    const truncated =
      pr.body.length > 20_000 ||
      pr.files.length > 100 ||
      pr.files.length < pr.changedFiles ||
      pr.comments.length > 30 ||
      pr.reviews.length > 20 ||
      pr.comments.some((c) => c.body.length > 2_000) ||
      pr.reviews.some((r) => r.body.length > 2_000) ||
      (pr.statusCheckRollup?.length ?? 0) > 100;
    return {
      fetchedAt: new Date().toISOString(),
      truncated,
      bodyTruncated: pr.body.length > 20_000,
      pr: {
        ...pr,
        body: pr.body.slice(0, 20_000),
        files: pr.files.slice(0, 100),
        comments: pr.comments.slice(-30).map((comment) => ({
          ...comment,
          body: comment.body.slice(0, 2_000),
        })),
        reviews: pr.reviews
          .slice(-20)
          .map((review) => ({ ...review, body: review.body.slice(0, 2_000) })),
        statusCheckRollup: pr.statusCheckRollup?.slice(0, 100) ?? null,
      },
    };
  }
  async function diff(ref: PrRef, signal?: AbortSignal) {
    const raw = await gh(["pr", "diff", prUrl(ref), "--color=never"], signal);
    return { text: raw.slice(0, 80_000), truncated: raw.length > 80_000 };
  }
  async function fetchCode(ref: PrRef, page: number): Promise<DiffPage> {
    const readHead = async () =>
      z
        .object({ headRefOid: z.string().regex(/^[a-f0-9]{40}$/i) })
        .parse(
          JSON.parse(
            await gh(["pr", "view", prUrl(ref), "--json", "headRefOid"]),
          ),
        ).headRefOid;
    const before = await readHead();
    const raw = z
      .array(githubFileSchema)
      .parse(
        JSON.parse(
          await gh([
            "api",
            "--hostname",
            "github.com",
            `repos/${ref.repo}/pulls/${ref.number}/files?per_page=25&page=${page}`,
          ]),
        ),
      );
    const after = await readHead();
    if (after !== before)
      throw new Error(
        "This PR changed while its diff was loading. Refresh to read the latest revision.",
      );
    let remaining = 1_000_000;
    const files = raw.map((file) => {
      const tooLarge = (file.patch?.length ?? 0) > Math.min(200_000, remaining);
      const patch = tooLarge ? null : (file.patch ?? null);
      remaining -= patch?.length ?? 0;
      return {
        path: file.filename,
        previousPath: file.previous_filename ?? null,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch,
        tooLarge,
      };
    });
    return {
      headSha: before,
      page,
      hasMore: raw.length === 25 && page < 120,
      files,
    };
  }
  async function fetchControls(ref: PrRef): Promise<PrControls> {
    const [owner, repo] = ref.repo.split("/");
    const raw = await gh([
      "api",
      "--hostname",
      "github.com",
      "graphql",
      "-f",
      "query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed pullRequest(number:$number){viewerCanUpdate mergeable mergeStateStatus}}}",
      "-f",
      `owner=${owner}`,
      "-f",
      `repo=${repo}`,
      "-F",
      `number=${ref.number}`,
    ]);
    const repository = z
      .object({
        data: z.object({
          repository: z.object({
            viewerPermission: z.string().nullable(),
            mergeCommitAllowed: z.boolean(),
            squashMergeAllowed: z.boolean(),
            rebaseMergeAllowed: z.boolean(),
            pullRequest: z.object({
              viewerCanUpdate: z.boolean(),
              mergeable: z.string(),
              mergeStateStatus: z.string(),
            }),
          }),
        }),
      })
      .parse(JSON.parse(raw)).data.repository;
    const mergeMethods: PrControls["mergeMethods"] = [];
    if (repository.mergeCommitAllowed) mergeMethods.push("merge");
    if (repository.squashMergeAllowed) mergeMethods.push("squash");
    if (repository.rebaseMergeAllowed) mergeMethods.push("rebase");
    return {
      canUpdate: repository.pullRequest.viewerCanUpdate,
      canMerge: ["ADMIN", "MAINTAIN", "WRITE"].includes(
        repository.viewerPermission ?? "",
      ),
      mergeMethods,
      mergeable: repository.pullRequest.mergeable,
      mergeState: repository.pullRequest.mergeStateStatus,
    };
  }
  const detailCache = createReadCache<Detail>(5 * 60_000, 40);
  const codeCache = createReadCache<DiffPage>(5 * 60_000, 40);
  const controlsCache = createReadCache<PrControls>(5 * 60_000, 40);
  const detail = (ref: PrRef, signal?: AbortSignal, refresh = false) =>
    detailCache.read(prKey(ref), () => fetchDetail(ref, signal), refresh);
  const code = (ref: PrRef, page: number, refresh = false) =>
    codeCache.read(
      `${prKey(ref)}:${page}`,
      () => fetchCode(ref, page),
      refresh,
    );
  const controls = (ref: PrRef, refresh = false) =>
    controlsCache.read(prKey(ref), () => fetchControls(ref), refresh);
  const mutating = new Set<string>();
  async function action(ref: PrRef, action: PrAction, expectedHeadSha: string) {
    const key = prKey(ref);
    if (mutating.has(key))
      throw new Error(
        "An action is already running for this PR. Wait for it to finish.",
      );
    mutating.add(key);
    try {
      const current = z
        .object({
          id: z.string(),
          headRefOid: z.string(),
          state: z.enum(["OPEN", "CLOSED", "MERGED"]),
          isDraft: z.boolean(),
        })
        .parse(
          JSON.parse(
            await gh([
              "pr",
              "view",
              prUrl(ref),
              "--json",
              "id,headRefOid,state,isDraft",
            ]),
          ),
        );
      if (current.headRefOid !== expectedHeadSha)
        throw new Error(
          "The PR has new commits. Refresh and review the latest revision before continuing.",
        );
      if (action === "merge" || action === "squash" || action === "rebase") {
        if (current.state === "MERGED")
          return { message: "This pull request is already merged." };
        if (current.state !== "OPEN" || current.isDraft)
          throw new Error(
            "Reopen the pull request and mark it ready for review before merging.",
          );
        const result = z
          .object({ merged: z.boolean(), message: z.string() })
          .parse(
            JSON.parse(
              await gh([
                "api",
                "--hostname",
                "github.com",
                `repos/${ref.repo}/pulls/${ref.number}/merge`,
                "--method",
                "PUT",
                "-f",
                `sha=${expectedHeadSha}`,
                "-f",
                `merge_method=${action}`,
              ]),
            ),
          );
        if (!result.merged)
          throw new Error(
            `${result.message} Refresh the PR and check its required reviews and checks before trying again.`,
          );
      } else {
        if (current.state === "MERGED")
          throw new Error(
            "This pull request is merged. Open a new pull request to make further changes.",
          );
        if (action === "close" || action === "reopen") {
          const state = action === "close" ? "closed" : "open";
          if (current.state.toLowerCase() !== state)
            await gh([
              "api",
              "--hostname",
              "github.com",
              `repos/${ref.repo}/pulls/${ref.number}`,
              "--method",
              "PATCH",
              "-f",
              `state=${state}`,
            ]);
        } else {
          if (current.state !== "OPEN")
            throw new Error("Reopen the PR before changing its draft status.");
          if (current.isDraft !== (action === "draft")) {
            const mutation =
              action === "draft"
                ? "convertPullRequestToDraft"
                : "markPullRequestReadyForReview";
            await gh([
              "api",
              "--hostname",
              "github.com",
              "graphql",
              "-f",
              `query=mutation($id:ID!){${mutation}(input:{pullRequestId:$id}){pullRequest{id}}}`,
              "-f",
              `id=${current.id}`,
            ]);
          }
        }
      }
      cache.clear();
      activityClient.clear(ref);
      detailCache.remove(key);
      codeCache.remove(key);
      controlsCache.remove(key);
      return {
        message:
          action === "merge" || action === "squash" || action === "rebase"
            ? "Pull request merged."
            : action === "draft"
              ? "Converted to draft."
              : action === "ready"
                ? "Marked ready for review."
                : action === "close"
                  ? "Pull request closed."
                  : "Pull request reopened.",
      };
    } finally {
      mutating.delete(key);
    }
  }
  return {
    inbox,
    detail,
    diff,
    code,
    controls,
    action,
    ...activityClient,
    ...checksClient,
  };
}
