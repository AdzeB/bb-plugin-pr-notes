import { z } from "zod";
import { createReadCache } from "./read-cache";
import type { PrRef } from "./github";
import type { GithubCommand } from "./github-activity";
export const checkBucketSchema = z.enum([
  "failed",
  "cancelled",
  "pending",
  "passed",
  "skipped",
]);
export type CheckBucket = z.infer<typeof checkBucketSchema>;
export const checkSchema = z.object({
  id: z.string(),
  checkRunId: z.number().nullable(),
  name: z.string(),
  workflow: z.string(),
  state: z.string(),
  bucket: checkBucketSchema,
  url: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  annotationCount: z.number(),
});
export type PrCheck = z.infer<typeof checkSchema>;
export const checksPageSchema = z.object({
  headSha: z.string(),
  checks: z.array(checkSchema),
  total: z.number(),
  page: z.number(),
  hasMore: z.boolean(),
  fetchedAt: z.string(),
});
export type ChecksPage = z.infer<typeof checksPageSchema>;
export const annotationsSchema = z.object({
  items: z.array(
    z.object({
      path: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      level: z.string(),
      title: z.string().nullable(),
      message: z.string(),
      rawDetails: z.string().nullable(),
    }),
  ),
  hasMore: z.boolean(),
  page: z.number(),
});
export type CheckAnnotations = z.infer<typeof annotationsSchema>;
const rawRun = z.object({
  id: z.number(),
  name: z.string(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  details_url: z.string().nullable(),
  app: z.object({ name: z.string() }).nullable(),
  check_suite: z.object({ id: z.number() }).nullable(),
  output: z.object({
    title: z.string().nullable(),
    summary: z.string().nullable(),
    annotations_count: z.number(),
  }),
});
const rawStatus = z.object({
  id: z.number(),
  context: z.string(),
  state: z.string(),
  target_url: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export function checkBucket(state: string): CheckBucket {
  switch (state.toLowerCase()) {
    case "success":
      return "passed";
    case "skipped":
    case "neutral":
      return "skipped";
    case "cancelled":
      return "cancelled";
    case "failure":
    case "error":
    case "timed_out":
    case "action_required":
    case "stale":
      return "failed";
    default:
      return "pending";
  }
}
export function createChecksClient(gh: GithubCommand) {
  const pages = createReadCache<ChecksPage>(5 * 60_000, 40);
  const annotations = createReadCache<CheckAnnotations>(5 * 60_000, 40);
  const checks = (ref: PrRef, headSha: string, page: number, refresh = false) =>
    pages.read(
      `${ref.repo}:${headSha}:${page}`,
      async () => {
        const [rawChecks, rawStatuses, rawWorkflows] = await Promise.all([
          gh([
            "api",
            "--hostname",
            "github.com",
            `repos/${ref.repo}/commits/${headSha}/check-runs?per_page=50&page=${page}`,
          ]),
          gh([
            "api",
            "--hostname",
            "github.com",
            `repos/${ref.repo}/commits/${headSha}/status?per_page=50&page=${page}`,
          ]),
          gh([
            "api",
            "--hostname",
            "github.com",
            `repos/${ref.repo}/actions/runs?head_sha=${headSha}&per_page=100`,
          ]),
        ]);
        const runs = z
          .object({ total_count: z.number(), check_runs: z.array(rawRun) })
          .parse(JSON.parse(rawChecks));
        const statuses = z
          .object({ total_count: z.number(), statuses: z.array(rawStatus) })
          .parse(JSON.parse(rawStatuses));
        const workflows = z
          .object({
            workflow_runs: z.array(
              z.object({
                name: z.string().nullable(),
                check_suite_id: z.number(),
                head_sha: z.string(),
              }),
            ),
          })
          .parse(JSON.parse(rawWorkflows));
        const bySuite = new Map(
          workflows.workflow_runs
            .filter((run) => run.head_sha === headSha)
            .map((run) => [run.check_suite_id, run.name]),
        );
        const checks: PrCheck[] = runs.check_runs
          .filter((run) => run.head_sha === headSha)
          .map((run) => ({
            id: `run:${run.id}`,
            checkRunId: run.id,
            name: run.name,
            workflow:
              (run.check_suite ? bySuite.get(run.check_suite.id) : null) ??
              run.app?.name ??
              "Check",
            state: run.conclusion ?? run.status,
            bucket: checkBucket(run.conclusion ?? run.status),
            url: run.details_url,
            startedAt: run.started_at,
            completedAt: run.completed_at,
            title: run.output.title?.slice(0, 1_000) ?? null,
            summary: run.output.summary?.slice(0, 20_000) ?? null,
            annotationCount: run.output.annotations_count,
          }));
        for (const status of statuses.statuses)
          checks.push({
            id: `status:${status.id}`,
            checkRunId: null,
            name: status.context,
            workflow: "Commit status",
            state: status.state,
            bucket: checkBucket(status.state),
            url: status.target_url,
            startedAt: status.created_at,
            completedAt: status.state === "pending" ? null : status.updated_at,
            title: status.description,
            summary: null,
            annotationCount: 0,
          });
        return {
          headSha,
          checks,
          total: runs.total_count + statuses.total_count,
          page,
          hasMore: page * 50 < Math.max(runs.total_count, statuses.total_count),
          fetchedAt: new Date().toISOString(),
        };
      },
      refresh,
    );
  const checkAnnotations = (
    ref: PrRef,
    headSha: string,
    checkRunId: number,
    page: number,
  ) =>
    annotations.read(
      `${ref.repo}:${headSha}:${checkRunId}:${page}`,
      async () => {
        const run = z
          .object({ head_sha: z.string() })
          .parse(
            JSON.parse(
              await gh([
                "api",
                "--hostname",
                "github.com",
                `repos/${ref.repo}/check-runs/${checkRunId}`,
              ]),
            ),
          );
        if (run.head_sha !== headSha)
          throw new Error(
            "These annotations belong to another revision. Refresh the PR checks.",
          );
        const raw = await gh([
          "api",
          "--hostname",
          "github.com",
          `repos/${ref.repo}/check-runs/${checkRunId}/annotations?per_page=30&page=${page}`,
        ]);
        const items = z
          .array(
            z.object({
              path: z.string(),
              start_line: z.number(),
              end_line: z.number(),
              annotation_level: z.string(),
              title: z.string().nullable(),
              message: z.string(),
              raw_details: z.string().nullable(),
            }),
          )
          .parse(JSON.parse(raw));
        return {
          page,
          hasMore: items.length === 30,
          items: items.map((item) => ({
            path: item.path,
            startLine: item.start_line,
            endLine: item.end_line,
            level: item.annotation_level,
            title: item.title,
            message: item.message.slice(0, 10_000),
            rawDetails: item.raw_details?.slice(0, 10_000) ?? null,
          })),
        };
      },
    );
  return { checks, checkAnnotations };
}
