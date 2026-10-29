import { useEffect, useState } from "react";
import {
  useRpc,
  experimental_usePluginId,
  UrlLink,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { PrRef } from "./github";
import type {
  CheckAnnotations,
  ChecksPage,
  PrCheck,
  CheckBucket,
} from "./github-checks";
import { checkViews, annotationViews, viewKey } from "./view-cache";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { ErrorNotice, messageOf } from "./pr-ui";
import { RichMarkdown } from "./rich-markdown";
import { cn } from "./lib/utils";
import { countLabel, formatNumber, formatTime } from "./copy";
const groups: {
  kind: CheckBucket;
  title: string;
  color: string;
  icon: string;
}[] = [
  {
    kind: "failed",
    title: "Failed",
    color: "text-rose-600 dark:text-rose-400",
    icon: "X",
  },
  {
    kind: "cancelled",
    title: "Cancelled",
    color: "text-muted-foreground",
    icon: "Minus",
  },
  {
    kind: "pending",
    title: "Pending",
    color: "text-amber-700 dark:text-amber-400",
    icon: "Clock",
  },
  {
    kind: "passed",
    title: "Passed",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: "Check",
  },
  {
    kind: "skipped",
    title: "Skipped",
    color: "text-muted-foreground",
    icon: "Minus",
  },
];
function duration(check: PrCheck) {
  if (!check.startedAt || !check.completedAt)
    return check.bucket === "pending"
      ? check.state === "in_progress"
        ? "Running"
        : check.state === "queued"
          ? "Queued"
          : "Pending"
      : null;
  const seconds = Math.max(
    0,
    Math.round(
      (Date.parse(check.completedAt) - Date.parse(check.startedAt)) / 1_000,
    ),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function CheckDetails({
  prRef,
  headSha,
  check,
}: {
  prRef: PrRef;
  headSha: string;
  check: PrCheck;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const [data, setData] = useState<CheckAnnotations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!check.checkRunId || !check.annotationCount) return;
    let active = true;
    annotationViews
      .read(
        `${viewKey(pluginId, prRef)}${headSha}:${check.checkRunId}:${page}`,
        () =>
          rpc.call("checkAnnotations", {
            ...prRef,
            headSha,
            checkRunId: check.checkRunId!,
            page,
          }),
      )
      .then(
        (result) => {
          if (active) {
            setData((previous) =>
              page === 1 || !previous
                ? result
                : { ...result, items: [...previous.items, ...result.items] },
            );
            setError(null);
          }
        },
        (cause) => {
          if (active) setError(messageOf(cause));
        },
      );
    return () => {
      active = false;
    };
  }, [rpc, prRef, headSha, check, page, retry, pluginId]);
  return (
    <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
      {check.title && <p className="text-sm font-medium">{check.title}</p>}
      {check.summary && <RichMarkdown content={check.summary} />}
      {error && (
        <div>
          <ErrorNotice message={error} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry check details
          </Button>
        </div>
      )}
      {check.annotationCount > 0 && !data && !error && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading annotations…
        </p>
      )}
      {data?.items.map((item, index) => (
        <article
          key={`${item.path}:${item.startLine}:${index}`}
          className="overflow-hidden rounded-lg border border-border"
        >
          <header className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs">
            <Icon name="FileText" className="size-3.5" />
            <UrlLink
              className="min-w-0 break-all font-mono"
              href={`https://github.com/${prRef.repo}/blob/${headSha}/${item.path.split("/").map(encodeURIComponent).join("/")}#L${item.startLine}`}
            >
              {item.path}:{item.startLine}
              {item.endLine !== item.startLine ? `–${item.endLine}` : ""}
            </UrlLink>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {item.level}
            </span>
          </header>
          <div className="space-y-2 p-3">
            {item.title && (
              <p className="text-xs font-semibold">{item.title}</p>
            )}
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {item.message}
            </p>
            {item.rawDetails && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  More details
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                  {item.rawDetails}
                </pre>
              </details>
            )}
          </div>
        </article>
      ))}
      {data?.hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((value) => value + 1)}
        >
          Load more annotations
        </Button>
      )}
      {!check.annotationCount && !check.summary && !check.title && (
        <p className="text-xs text-muted-foreground">
          Detailed output is available on GitHub.
        </p>
      )}
      {check.url && (
        <UrlLink
          href={check.url}
          aria-label={`Open ${check.name} run and logs on GitHub`}
          className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400"
        >
          Open run and logs
          <Icon name="ExternalLink" className="size-3" />
        </UrlLink>
      )}
    </div>
  );
}
export function PrChecks({
  prRef,
  headSha,
  active,
  revision,
}: {
  prRef: PrRef;
  headSha: string;
  active: boolean;
  revision: number;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const key = `${viewKey(pluginId, prRef)}${headSha}:`;
  const [data, setData] = useState<ChecksPage | null>(
    () => checkViews.peek(key) ?? null,
  );
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(!checkViews.fresh(page === 1 ? key : `${key}${page}`));
    checkViews
      .read(page === 1 ? key : `${key}${page}`, () =>
        rpc.call("checks", {
          ...prRef,
          headSha,
          page,
          refresh: revision > 0 || refresh > 0,
        }),
      )
      .then(
        (result) => {
          if (!alive) return;
          setData((previous) => {
            const next =
              page === 1 || !previous
                ? result
                : {
                    ...result,
                    checks: [
                      ...new Map(
                        [...previous.checks, ...result.checks].map((check) => [
                          check.id,
                          check,
                        ]),
                      ).values(),
                    ],
                  };
            checkViews.set(key, next);
            return next;
          });
          setError(null);
        },
        (cause) => {
          if (alive) setError(messageOf(cause));
        },
      )
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, rpc, prRef, headSha, page, refresh, revision, key]);
  const failed =
    data?.checks.filter((check) => check.bucket === "failed").length ?? 0;
  const attention =
    data?.checks.filter((check) =>
      ["failed", "cancelled", "pending"].includes(check.bucket),
    ).length ?? 0;
  const refreshChecks = () => {
    checkViews.remove(key);
    setPage(1);
    setRefresh((value) => value + 1);
  };
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {failed
              ? countLabel(failed, {
                  one: "{count} check needs a fix",
                  other: "{count} checks need a fix",
                })
              : data?.hasMore
                ? "Checks"
                : attention
                  ? "Checks need attention"
                  : data?.checks.length
                    ? "Checks completed"
                    : "Checks"}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Head <code>{headSha.slice(0, 12)}</code>
            {data &&
              ` · ${formatNumber(data.checks.length)} of ${formatNumber(data.total)} loaded · ${formatTime(data.fetchedAt)}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh checks"
          disabled={loading}
          onClick={refreshChecks}
        >
          <Icon
            name="RotateCcw"
            className={cn("size-4", loading && "animate-spin")}
          />
        </Button>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={filter === "attention"}
          className={cn(filter === "attention" && "bg-background shadow-sm")}
          onClick={() => setFilter("attention")}
        >
          Needs attention {attention}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={filter === "all"}
          className={cn(filter === "all" && "bg-background shadow-sm")}
          onClick={() => setFilter("all")}
        >
          All checks {data?.checks.length ?? 0}
        </Button>
        <span className="ml-auto hidden px-2 text-[11px] text-muted-foreground sm:inline">
          Failures first
        </span>
      </div>
      {!data && loading && (
        <p
          role="status"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          Loading GitHub checks…
        </p>
      )}
      {data &&
        (data.checks.length === 0 ||
          (filter === "attention" && attention === 0)) && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Icon
              name="Check"
              className="mx-auto mb-3 size-7 text-muted-foreground"
            />
            <h4 className="text-sm font-medium">
              {data.checks.length
                ? "Nothing needs attention"
                : "No checks for this commit"}
            </h4>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.checks.length
                ? "View All checks to see completed and skipped jobs."
                : "Workflow jobs and external checks will appear here when GitHub reports them."}
            </p>
          </div>
        )}
      {groups
        .filter(
          (group) =>
            filter === "all" ||
            ["failed", "cancelled", "pending"].includes(group.kind),
        )
        .map((group) => {
          const checks =
            data?.checks.filter((check) => check.bucket === group.kind) ?? [];
          if (!checks.length) return null;
          return (
            <section
              key={group.kind}
              aria-label={`${group.title} checks`}
              className="space-y-3"
            >
              <h4 className="text-xs font-medium text-muted-foreground">
                {group.title} {checks.length}
              </h4>
              {checks.map((check) => (
                <article
                  key={check.id}
                  data-pr-check={group.kind}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3 bg-muted/20 p-4">
                    <Icon
                      name={group.icon}
                      fallback="Info"
                      className={cn("size-4 shrink-0", group.color)}
                    />
                    <button
                      type="button"
                      aria-expanded={expanded.has(check.id)}
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(check.id)) next.delete(check.id);
                          else next.add(check.id);
                          return next;
                        })
                      }
                    >
                      <span className="block text-sm font-semibold">
                        {check.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {check.workflow}
                      </span>
                    </button>
                    <span className={cn("text-xs", group.color)}>
                      {check.state === "neutral" ? "Neutral" : group.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {duration(check)}
                    </span>
                    {check.url && (
                      <UrlLink
                        href={check.url}
                        aria-label={`Open ${check.name} on GitHub`}
                        className="shrink-0 text-muted-foreground"
                      >
                        <Icon name="ExternalLink" className="size-3.5" />
                      </UrlLink>
                    )}
                  </div>
                  {expanded.has(check.id) && (
                    <CheckDetails
                      prRef={prRef}
                      headSha={headSha}
                      check={check}
                    />
                  )}
                </article>
              ))}
            </section>
          );
        })}
      {data?.hasMore && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setPage((value) => value + 1)}
        >
          {loading ? "Loading checks…" : "Load more checks"}
        </Button>
      )}
    </div>
  );
}
