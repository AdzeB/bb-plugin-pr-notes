import { useEffect, useState } from "react";
import {
  useRpc,
  UrlLink,
  experimental_usePluginId,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { PrRef, Detail } from "./github";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { cn } from "./lib/utils";
import {
  keyOf,
  messageOf,
  Status,
  ErrorNotice,
  StateBadge,
  relativeDate,
} from "./pr-ui";
import { NotesEditor } from "./notes-editor";
import { PrChat } from "./pr-chat";
import { RichMarkdown } from "./rich-markdown";
import { PrActivity } from "./pr-activity";
import { PrChecks } from "./pr-checks";
import { formatDate, formatList, countLabel, formatNumber } from "./copy";
import { checkBucket } from "./github-checks";
import { CodeDiff } from "./code-diff";
import { PullRequestControls } from "./pr-controls";
import { detailViews, viewKey, invalidatePrViews } from "./view-cache";
export function PrWorkspace({
  prRef,
  onBack,
}: {
  prRef: PrRef;
  onBack: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const cacheKey = viewKey(pluginId, prRef);
  const [detail, setDetail] = useState<Detail | null>(
    () => detailViews.peek(cacheKey) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const tabKey = `${pluginId}:tab:${keyOf(prRef)}`;
  const [tab, setTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem(tabKey);
      return saved &&
        ["Overview", "Code", "Checks", "Notes", "Chat"].includes(saved)
        ? saved
        : "Overview";
    } catch {
      return "Overview";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(tabKey, tab);
    } catch {
      /* The active tab still works without browser storage. */
    }
  }, [tab, tabKey]);
  const [revision, setRevision] = useState(0);
  const [requestedFile, setRequestedFile] = useState<{
    path: string;
    page: number;
  } | null>(null);
  const openFile = (path: string) => {
    const index =
      detail?.pr.files.findIndex((file) => file.path === path) ?? -1;
    if (index >= 0) {
      setRequestedFile({ path, page: Math.floor(index / 25) + 1 });
      setTab("Code");
    }
  };
  useEffect(() => {
    let active = true;
    setError(null);
    detailViews
      .read(cacheKey, () =>
        rpc.call("detail", { ...prRef, refresh: revision > 0 }),
      )
      .then(
        (value) => {
          if (active) setDetail(value);
        },
        (cause) => {
          if (active) setError(messageOf(cause));
        },
      );
    return () => {
      active = false;
    };
  }, [rpc, prRef, revision, cacheKey]);
  const pr = detail?.pr;
  return (
    <section
      aria-label={`Pull request ${keyOf(prRef)}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="border-b border-border px-5 pb-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 md:hidden"
              aria-label="Back to inbox"
              onClick={onBack}
            >
              <Icon name="ArrowLeft" className="size-4" />
            </Button>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {keyOf(prRef)}
            </span>
          </div>
          <UrlLink
            href={`https://github.com/${prRef.repo}/pull/${prRef.number}`}
            aria-label={`Open ${keyOf(prRef)} on GitHub`}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            GitHub
            <Icon name="ExternalLink" className="size-3" />
          </UrlLink>
        </div>
        <h2 className="text-xl font-semibold leading-snug tracking-tight">
          {pr?.title ?? `Pull request #${prRef.number}`}
        </h2>
        {pr && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StateBadge
              status={
                pr.state === "MERGED"
                  ? "merged"
                  : pr.state === "CLOSED"
                    ? "closed"
                    : pr.isDraft
                      ? "draft"
                      : "open"
              }
            />
            <span className="text-xs text-muted-foreground">
              {pr.author?.login ?? "deleted-user"}
            </span>
            <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
              {pr.headRefName} → {pr.baseRefName}
            </span>
            <span className="text-xs text-muted-foreground">
              ·{" "}
              {countLabel(pr.changedFiles, {
                one: "{count} file",
                other: "{count} files",
              })}
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              +{formatNumber(pr.additions)}
            </span>
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
              −{formatNumber(pr.deletions)}
            </span>
          </div>
        )}
        {pr && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {pr.assignees.length
                ? `Assigned to ${formatList(pr.assignees.map((person) => person.login))}`
                : "Unassigned"}
            </span>
            <time dateTime={pr.createdAt}>
              Created {relativeDate(pr.createdAt)}
            </time>
            <time dateTime={pr.updatedAt}>
              Updated {relativeDate(pr.updatedAt)}
            </time>
            {pr.reviewDecision && (
              <span className="text-amber-700 dark:text-amber-400">
                {pr.reviewDecision.toLowerCase().replaceAll("_", " ")}
              </span>
            )}
          </div>
        )}
        {pr && (
          <PullRequestControls
            prRef={prRef}
            pr={pr}
            revision={revision}
            onChanged={() => {
              invalidatePrViews(pluginId, prRef);
              setRevision((value) => value + 1);
            }}
          />
        )}
      </div>
      <div
        role="tablist"
        aria-label="PR workspace"
        className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2"
      >
        {["Overview", "Code", "Checks", "Notes", "Chat"].map((value) => (
          <Button
            key={value}
            role="tab"
            aria-label={value}
            id={`tab-${value}`}
            aria-controls={`panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            variant="ghost"
            size="sm"
            className={cn(tab === value && "bg-muted")}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const tabs = ["Overview", "Code", "Checks", "Notes", "Chat"];
              const index = tabs.indexOf(value);
              const next =
                event.key === "ArrowRight"
                  ? tabs[(index + 1) % tabs.length]
                  : event.key === "ArrowLeft"
                    ? tabs[(index + tabs.length - 1) % tabs.length]
                    : event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[tabs.length - 1]
                        : null;
              if (next) {
                event.preventDefault();
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {value}
            {value === "Checks" &&
              pr &&
              (pr.statusCheckRollup?.filter(
                (check) =>
                  checkBucket(
                    check.conclusion || check.state || check.status || "",
                  ) === "failed",
              ).length ?? 0) > 0 && (
                <span
                  aria-hidden="true"
                  className="ml-1 text-xs text-rose-600 dark:text-rose-400"
                >
                  {
                    pr.statusCheckRollup?.filter(
                      (check) =>
                        checkBucket(
                          check.conclusion || check.state || check.status || "",
                        ) === "failed",
                    ).length
                  }
                </span>
              )}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label="Refresh PR details"
          onClick={() => {
            invalidatePrViews(pluginId, prRef);
            setRevision((value) => value + 1);
          }}
        >
          <Icon name="RotateCcw" className="size-3.5" />
        </Button>
      </div>
      {error && (
        <div className="p-4">
          <ErrorNotice message={error} />
        </div>
      )}
      <div
        role="tabpanel"
        id="panel-Overview"
        aria-labelledby="tab-Overview"
        hidden={tab !== "Overview"}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {detail ? (
          <Overview
            detail={detail}
            prRef={prRef}
            active={tab === "Overview"}
            revision={revision}
            onOpenFile={openFile}
          />
        ) : !error ? (
          <Status>Loading pull request…</Status>
        ) : null}
      </div>
      <div
        role="tabpanel"
        id="panel-Code"
        aria-labelledby="tab-Code"
        hidden={tab !== "Code"}
        className={cn(
          "min-h-0 flex-1 flex-col overflow-hidden",
          tab === "Code" && "flex",
        )}
      >
        <CodeDiff
          key={requestedFile?.path ?? "default"}
          prRef={prRef}
          active={tab === "Code"}
          revision={revision}
          initialPath={requestedFile?.path}
          initialPage={requestedFile?.page}
        />
      </div>
      <div
        role="tabpanel"
        id="panel-Checks"
        aria-labelledby="tab-Checks"
        hidden={tab !== "Checks"}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {pr && (
          <PrChecks
            key={pr.headRefOid}
            prRef={prRef}
            headSha={pr.headRefOid}
            active={tab === "Checks"}
            revision={revision}
          />
        )}
      </div>
      <div
        role="tabpanel"
        id="panel-Notes"
        aria-labelledby="tab-Notes"
        hidden={tab !== "Notes"}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <NotesEditor prRef={prRef} />
      </div>
      <div
        role="tabpanel"
        id="panel-Chat"
        aria-labelledby="tab-Chat"
        hidden={tab !== "Chat"}
        className={cn(
          "min-h-0 flex-1 flex-col overflow-hidden",
          tab === "Chat" && "flex",
        )}
      >
        <PrChat prRef={prRef} active={tab === "Chat"} />
      </div>
    </section>
  );
}
function Overview({
  detail,
  prRef,
  active,
  revision,
  onOpenFile,
}: {
  detail: Detail;
  prRef: PrRef;
  active: boolean;
  revision: number;
  onOpenFile: (path: string) => void;
}) {
  const pr = detail.pr;
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>
          Head <code>{pr.headRefOid.slice(0, 12)}</code>
        </span>
        <span>· Fetched {formatDate(detail.fetchedAt)}</span>
      </div>
      {detail.bodyTruncated && (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          This description is shortened. Open GitHub to read the complete text.
        </p>
      )}
      {pr.body ? (
        <RichMarkdown
          className="pr-main-description"
          content={pr.body}
          files={pr.files}
          onOpenFile={onOpenFile}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Icon
            name="FileText"
            className="mx-auto mb-2 size-6 text-muted-foreground"
          />
          <h3 className="text-sm font-medium">No description yet</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            You can still inspect the code or ask about this PR.
          </p>
        </div>
      )}
      <PrActivity
        prRef={prRef}
        active={active}
        revision={revision}
        files={pr.files}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
