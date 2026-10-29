import { z } from "zod";
import { createReadCache } from "./read-cache";
import type { PrRef } from "./github";
export type GithubCommand = (
  args: string[],
  signal?: AbortSignal,
  input?: string,
) => Promise<string>;
const actorSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().nullable(),
});
const base = {
  id: z.string(),
  actor: actorSchema,
  createdAt: z.string().nullable(),
  url: z.string(),
};
export const activityItemSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("comment"),
    commentId: z.number().int().positive(),
    body: z.string(),
    truncated: z.boolean(),
  }),
  z.object({
    ...base,
    kind: z.literal("commit"),
    sha: z.string(),
    title: z.string(),
  }),
  z.object({
    ...base,
    kind: z.literal("review"),
    state: z.string(),
    body: z.string(),
    truncated: z.boolean(),
  }),
  z.object({
    ...base,
    kind: z.literal("event"),
    label: z.string(),
    detail: z.string().nullable(),
  }),
]);
export type ActivityItem = z.infer<typeof activityItemSchema>;
export const postedCommentSchema = activityItemSchema.options[0];
export type PostedComment = z.infer<typeof postedCommentSchema>;
export const activityPageSchema = z.object({
  items: z.array(activityItemSchema),
  page: z.number(),
  hasMore: z.boolean(),
  commentCount: z.number(),
  commitCount: z.number(),
  canComment: z.boolean(),
  fetchedAt: z.string(),
});
export type ActivityPage = z.infer<typeof activityPageSchema>;
const user = z.object({ login: z.string(), avatar_url: z.string().nullish() });
const rawEvent = z.object({
  event: z.string(),
  id: z.union([z.number(), z.string()]).optional(),
  node_id: z.string().optional(),
  actor: user.nullish(),
  user: user.nullish(),
  created_at: z.string().nullish(),
  submitted_at: z.string().nullish(),
  html_url: z.string().nullish(),
  body: z.string().nullish(),
  state: z.string().nullish(),
  sha: z.string().optional(),
  commit_id: z.string().nullish(),
  message: z.string().optional(),
  author: z
    .object({ name: z.string().optional(), date: z.string().optional() })
    .nullish(),
  committer: z.object({ date: z.string().optional() }).nullish(),
  label: z.object({ name: z.string() }).nullish(),
  assignee: user.nullish(),
  requested_reviewer: user.nullish(),
  milestone: z.object({ title: z.string() }).nullish(),
  rename: z.object({ from: z.string(), to: z.string() }).nullish(),
});
const rawComment = z.object({
  id: z.number().int().positive(),
  body: z.string(),
  user: user.nullable(),
  created_at: z.string(),
  html_url: z.string(),
});
const keyOf = (ref: PrRef) => `${ref.repo}#${ref.number}:`;
const urlOf = (ref: PrRef) =>
  `https://github.com/${ref.repo}/pull/${ref.number}`;
const labels: Record<string, string> = {
  merged: "merged this pull request",
  closed: "closed this pull request",
  reopened: "reopened this pull request",
  ready_for_review: "marked ready for review",
  convert_to_draft: "converted to draft",
  head_ref_force_pushed: "force-pushed the branch",
  head_ref_deleted: "deleted the branch",
  head_ref_restored: "restored the branch",
  labeled: "added a label",
  unlabeled: "removed a label",
  assigned: "assigned this pull request",
  unassigned: "removed an assignee",
  review_requested: "requested a review",
  review_request_removed: "removed a review request",
  renamed: "renamed this pull request",
};
export function createActivityClient(gh: GithubCommand) {
  const pages = createReadCache<ActivityPage>(5 * 60_000, 40);
  const summaries = createReadCache<{
    comments: number;
    commits: number;
    canComment: boolean;
  }>(5 * 60_000, 40);
  const clear = (ref: PrRef) => {
    pages.remove(keyOf(ref));
    summaries.remove(keyOf(ref));
  };
  async function summary(ref: PrRef, refresh: boolean) {
    return summaries.read(
      keyOf(ref),
      async () => {
        const [owner, repo] = ref.repo.split("/");
        const raw = await gh([
          "api",
          "--hostname",
          "github.com",
          "graphql",
          "-f",
          "query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){isArchived viewerPermission pullRequest(number:$number){locked comments{totalCount} commits{totalCount}}}}",
          "-f",
          `owner=${owner}`,
          "-f",
          `repo=${repo}`,
          "-F",
          `number=${ref.number}`,
        ]);
        const pr = z
          .object({
            data: z.object({
              repository: z.object({
                isArchived: z.boolean(),
                viewerPermission: z.string().nullable(),
                pullRequest: z.object({
                  locked: z.boolean(),
                  comments: z.object({ totalCount: z.number() }),
                  commits: z.object({ totalCount: z.number() }),
                }),
              }),
            }),
          })
          .parse(JSON.parse(raw)).data.repository;
        return {
          comments: pr.pullRequest.comments.totalCount,
          commits: pr.pullRequest.commits.totalCount,
          canComment:
            !pr.isArchived &&
            (!pr.pullRequest.locked ||
              ["WRITE", "MAINTAIN", "ADMIN", "TRIAGE"].includes(
                pr.viewerPermission ?? "",
              )),
        };
      },
      refresh,
    );
  }
  const activity = (ref: PrRef, page: number, refresh = false) =>
    pages.read(
      `${keyOf(ref)}${page}`,
      async () => {
        const [raw, counts] = await Promise.all([
          gh([
            "api",
            "--hostname",
            "github.com",
            `repos/${ref.repo}/issues/${ref.number}/timeline?per_page=30&page=${page}`,
          ]),
          summary(ref, refresh),
        ]);
        const events = z.array(rawEvent).parse(JSON.parse(raw));
        const items: ActivityItem[] = events.map((event, index) => {
          const who = event.actor ?? event.user;
          const actor = {
            login: who?.login ?? event.author?.name ?? "GitHub",
            avatarUrl: who?.avatar_url ?? null,
          };
          const item = {
            id:
              event.event === "commented"
                ? `comment:${event.id}`
                : `${event.event}:${event.id ?? event.node_id ?? `${page}:${index}`}`,
            actor,
            createdAt:
              event.created_at ??
              event.submitted_at ??
              event.committer?.date ??
              event.author?.date ??
              null,
            url: event.html_url ?? urlOf(ref),
          };
          if (event.event === "commented" && typeof event.id === "number")
            return {
              ...item,
              kind: "comment",
              commentId: event.id,
              body: (event.body ?? "").slice(0, 20_000),
              truncated: (event.body?.length ?? 0) > 20_000,
            };
          if (event.event === "committed")
            return {
              ...item,
              kind: "commit",
              sha: event.sha ?? event.commit_id ?? "",
              title: (event.message ?? "Commit").split("\n")[0]!.slice(0, 500),
            };
          if (event.event === "reviewed")
            return {
              ...item,
              kind: "review",
              state: event.state ?? "COMMENTED",
              body: (event.body ?? "").slice(0, 20_000),
              truncated: (event.body?.length ?? 0) > 20_000,
            };
          return {
            ...item,
            kind: "event",
            label: labels[event.event] ?? event.event.replaceAll("_", " "),
            detail:
              event.label?.name ??
              event.assignee?.login ??
              event.requested_reviewer?.login ??
              event.milestone?.title ??
              (event.rename
                ? `${event.rename.from} → ${event.rename.to}`
                : null),
          };
        });
        return {
          items,
          page,
          hasMore: events.length === 30,
          commentCount: counts.comments,
          commitCount: counts.commits,
          canComment: counts.canComment,
          fetchedAt: new Date().toISOString(),
        };
      },
      refresh,
    );
  async function postComment(ref: PrRef, body: string): Promise<PostedComment> {
    const raw = await gh(
      [
        "api",
        "--hostname",
        "github.com",
        `repos/${ref.repo}/issues/${ref.number}/comments`,
        "--method",
        "POST",
        "--input",
        "-",
      ],
      undefined,
      JSON.stringify({ body }),
    );
    const comment = rawComment.parse(JSON.parse(raw));
    clear(ref);
    return {
      kind: "comment",
      id: `comment:${comment.id}`,
      commentId: comment.id,
      body: comment.body.slice(0, 20_000),
      truncated: comment.body.length > 20_000,
      createdAt: comment.created_at,
      url: comment.html_url,
      actor: {
        login: comment.user?.login ?? "deleted-user",
        avatarUrl: comment.user?.avatar_url ?? null,
      },
    };
  }
  return { activity, postComment, clear };
}
