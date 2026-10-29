import { useEffect, useState } from "react";
import {
  useRpc,
  experimental_usePluginId,
  experimental_Diff as Diff,
  UrlLink,
  type DiffViewMode,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { DiffPage, PrRef } from "./github";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { cn } from "./lib/utils";
import { formatNumber } from "./copy";
import { codeViews, viewKey } from "./view-cache";

export function CodeDiff({
  prRef,
  active,
  revision,
  initialPath,
  initialPage,
}: {
  prRef: PrRef;
  active: boolean;
  revision: number;
  initialPath?: string;
  initialPage?: number;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const [data, setData] = useState<DiffPage | null>(
    () =>
      codeViews.peek(`${viewKey(pluginId, prRef)}${initialPage ?? 1}`) ?? null,
  );
  const [page, setPage] = useState(initialPage ?? 1);
  const [selected, setSelected] = useState<string | null>(initialPath ?? null);
  const [view, setView] = useState<DiffViewMode>("unified");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(!codeViews.fresh(`${viewKey(pluginId, prRef)}${page}`));
    setError(null);
    codeViews
      .read(`${viewKey(pluginId, prRef)}${page}`, () =>
        rpc.call("code", { ...prRef, page, refresh: revision > 0 }),
      )
      .then(
        (next) => {
          if (!alive) return;
          setData(next);
          setSelected((current) =>
            next.files.some((file) => file.path === current)
              ? current
              : (next.files[0]?.path ?? null),
          );
        },
        (cause) => {
          if (alive)
            setError(cause instanceof Error ? cause.message : String(cause));
        },
      )
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rpc, prRef, active, page, revision, retry, pluginId]);
  const file = data?.files.find((candidate) => candidate.path === selected);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {data
            ? `Head ${data.headSha.slice(0, 12)} · Page ${data.page}`
            : "Changes in this PR"}
          {loading && " · Loading…"}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view === "unified"}
            onClick={() => setView("unified")}
          >
            Unified
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view === "split"}
            onClick={() => setView("split")}
          >
            Side by side
          </Button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="m-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => {
              codeViews.remove(viewKey(pluginId, prRef));
              setRetry((value) => value + 1);
            }}
          >
            Retry diff
          </Button>
        </div>
      )}
      {!data && loading ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          Loading file changes…
        </p>
      ) : data?.files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Icon
            name="FileCode"
            fallback="FileText"
            className="size-7 text-muted-foreground"
          />
          <h3 className="text-sm font-medium">No file changes on this page</h3>
          <p className="text-xs text-muted-foreground">
            Refresh the PR or open it on GitHub to check for changes.
          </p>
        </div>
      ) : data ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col lg:flex-row",
            (loading || error) && "opacity-50 pointer-events-none",
          )}
        >
          <aside
            aria-label="Changed files"
            className="max-h-44 shrink-0 overflow-y-auto border-b border-border lg:max-h-none lg:w-56 lg:border-b-0 lg:border-r"
          >
            <div className="p-2">
              {data.files.map((candidate) => (
                <button
                  key={candidate.path}
                  type="button"
                  aria-current={
                    candidate.path === file?.path ? "true" : undefined
                  }
                  onClick={() => setSelected(candidate.path)}
                  className={cn(
                    "mb-1 w-full rounded-md p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    candidate.path === file?.path && "bg-muted",
                  )}
                >
                  <span className="block break-all font-mono text-[11px] leading-5">
                    {candidate.path}
                  </span>
                  <span className="mt-1 flex gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {candidate.status}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{formatNumber(candidate.additions)}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400">
                      −{formatNumber(candidate.deletions)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            {file && (
              <>
                <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
                  <p className="break-all font-mono text-xs">
                    {file.previousPath ? `${file.previousPath} → ` : ""}
                    {file.path}
                  </p>
                </div>
                {file.patch ? (
                  <Diff
                    key={`${data.headSha}:${file.path}:${view}`}
                    patch={file.patch}
                    path={file.path}
                    view={view}
                    overflow="scroll"
                  />
                ) : (
                  <div className="space-y-3 p-6">
                    <p className="text-sm font-medium">
                      {file.tooLarge
                        ? "This patch is too large to preview"
                        : "No text diff is available"}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {file.tooLarge
                        ? "Open GitHub to inspect the complete change."
                        : "GitHub omits patches for binary files and some large changes."}
                    </p>
                    <UrlLink
                      className="text-xs text-sky-600 dark:text-sky-400"
                      href={`https://github.com/${prRef.repo}/pull/${prRef.number}/files`}
                    >
                      View changes on GitHub
                    </UrlLink>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
      {data && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 1 || loading}
            onClick={() => {
              setData(null);
              setPage((value) => value - 1);
            }}
          >
            Previous files
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Up to 25 files per page
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!data.hasMore || loading}
            onClick={() => {
              setData(null);
              setPage((value) => value + 1);
            }}
          >
            Next files
          </Button>
        </div>
      )}
    </div>
  );
}
