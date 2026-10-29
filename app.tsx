import { useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  experimental_usePluginId,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import type { PrRef, InboxPr } from "./github";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Icon } from "./components/ui/icon";
import { cn } from "./lib/utils";
import { useInbox } from "./inbox-hooks";
import { InboxFilterControls } from "./inbox-filters";
import {
  filterSchema,
  defaultFilters,
  filterStart,
  filterCount,
  type InboxFilters,
} from "./filters";
import { keyOf, Status, ErrorNotice, relativeDate } from "./pr-ui";
import { PrWorkspace } from "./pr-workspace";
import { formatTime, formatNumber } from "./copy";
import { OpenPrControl } from "./open-pr";
import { inboxViewKey, scrollPositions } from "./view-cache";
import "./app.css";
const pathOf = (ref: PrRef) => `${ref.repo.toLowerCase()}/${ref.number}`;
function parsePath(path: string): PrRef | null {
  const match =
    /^\/?([A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100})\/([1-9][0-9]{0,9})$/.exec(
      path,
    );
  if (!match) return null;
  const number = Number(match[2]);
  return number <= 2_147_483_647
    ? { repo: match[1]!.toLowerCase(), number }
    : null;
}
function parseUrl(value: string): PrRef | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "github.com"
      ? parsePath(url.pathname.replace("/pull/", "/").replace(/\/$/, ""))
      : null;
  } catch {
    return null;
  }
}
function InboxPage({ subPath }: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const pluginId = experimental_usePluginId();
  const [filters, setFilters] = useState<InboxFilters>(() => {
    try {
      const raw = localStorage.getItem(`${pluginId}:filters`);
      return raw ? filterSchema.parse(JSON.parse(raw)) : defaultFilters();
    } catch {
      return defaultFilters();
    }
  });
  const { data, error, pageError, loading, loadingMore, refresh, loadMore } =
    useInbox(filters);
  const [knownRepos, setKnownRepos] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(`${pluginId}:filters`, JSON.stringify(filters));
    } catch {
      /* Filters still work if browser storage is unavailable. */
    }
  }, [filters, pluginId]);
  useEffect(() => {
    if (data)
      setKnownRepos((previous) =>
        [...new Set([...previous, ...data.prs.map((pr) => pr.repo)])].sort(),
      );
  }, [data]);
  useEffect(() => {
    if (
      !data?.nextCursor ||
      loading ||
      loadingMore ||
      pageError ||
      !sentinel.current ||
      !list.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root: list.current, rootMargin: "100px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [data, loading, loadingMore, pageError, loadMore]);
  const scrollKey = inboxViewKey(pluginId, filters);
  useEffect(() => {
    if (list.current)
      list.current.scrollTop = scrollPositions.get(scrollKey) ?? 0;
  }, [scrollKey, Boolean(data)]);
  const selected = useMemo(() => parsePath(subPath), [subPath]);
  const prs = (data?.prs ?? []).filter(
    (pr) =>
      (filters.repositories.length === 0 ||
        filters.repositories.includes(pr.repo)) &&
      !filters.excludedRepos.includes(pr.repo) &&
      (filters.statuses.length === 0 || filters.statuses.includes(pr.status)) &&
      (filters.scope === "all" ||
        pr.reasons.includes(
          filters.scope === "assigned" ? "assigned" : "review-requested",
        )) &&
      Date.parse(pr.updatedAt) >= filterStart(filters),
  );
  const narrowed = filterCount(filters) > 0;
  const repositories = [
    ...new Set([
      ...knownRepos,
      ...filters.excludedRepos,
      ...filters.repositories,
    ]),
  ].sort();
  const open = (ref: PrRef) =>
    navigate.toPluginPanel("inbox", { subPath: pathOf(ref) });
  return (
    <div
      data-pr-inbox="root"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <h1 className="sr-only">PR Inbox</h1>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside
          aria-label="Pull requests"
          className={cn(
            "flex min-h-0 shrink-0 flex-col border-b border-border md:w-60 md:border-b-0 md:border-r xl:w-64",
            selected ? "max-md:hidden" : "max-md:flex-1",
          )}
        >
          <div className="border-b border-border p-2">
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium">
              <Icon name="GitPullRequest" className="size-3.5" />
              GitHub
              {data && (
                <span
                  className="ml-auto text-[10px] text-muted-foreground"
                  title={`@${data.login} · ${formatNumber(data.prs.length)} loaded · Updated ${formatTime(data.fetchedAt)}`}
                >
                  {formatNumber(data.prs.length)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Icon
                name="Search"
                className="ml-1 size-3.5 shrink-0 text-muted-foreground"
              />
              <Input
                aria-label="Search pull requests"
                placeholder="Retry handling"
                maxLength={200}
                value={filters.query}
                className="min-w-0 border-0 px-2 text-xs shadow-none"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
              <InboxFilterControls
                filters={filters}
                repositories={repositories}
                onChange={setFilters}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Refresh inbox"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <Icon
                  name="RotateCcw"
                  className={cn("size-4", loading && "animate-spin")}
                />
              </Button>
              <OpenPrControl
                onOpen={(value) => {
                  const ref = parseUrl(value);
                  if (!ref) throw new Error("Enter a GitHub pull request URL.");
                  open(ref);
                }}
              />
            </div>
          </div>
          {error && (
            <div className="px-4 pb-3">
              <ErrorNotice message={error} />
            </div>
          )}
          {data?.truncated && (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              GitHub limits search to 1,000 results per category. Narrow the
              filters to see older PRs.
            </p>
          )}
          <div
            ref={list}
            data-pr-list=""
            onScroll={(event) => {
              if (scrollPositions.size > 40)
                scrollPositions.delete(
                  scrollPositions.keys().next().value ?? "",
                );
              scrollPositions.set(scrollKey, event.currentTarget.scrollTop);
            }}
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
          >
            {!data && !error ? (
              <Status>Loading your pull requests…</Status>
            ) : data &&
              !error &&
              !loading &&
              prs.length === 0 &&
              !data.nextCursor ? (
              <div className="px-4 py-10 text-center">
                <Icon
                  name={narrowed ? "Search" : "Check"}
                  className="mx-auto mb-3 size-7 text-muted-foreground"
                />
                <h2 className="text-sm font-medium">
                  {narrowed
                    ? filters.query
                      ? `No pull requests match “${filters.query}”`
                      : "No PRs match your filters"
                    : "No pull requests yet"}
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {narrowed
                    ? "Try a different status, date, repository, or search."
                    : "Assigned pull requests and review requests appear here. Use + to open a pull request by URL."}
                </p>
                {narrowed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setFilters(defaultFilters())}
                  >
                    Reset filters
                  </Button>
                )}
              </div>
            ) : null}
            {prs.map((pr) => (
              <PrRow
                key={keyOf(pr)}
                pr={pr}
                selected={selected !== null && keyOf(pr) === keyOf(selected)}
                onOpen={() => open(pr)}
              />
            ))}
            {pageError && (
              <div className="p-2">
                <ErrorNotice message={pageError} />
              </div>
            )}
            {data?.nextCursor && (
              <div ref={sentinel} className="flex justify-center px-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore
                    ? "Loading more…"
                    : pageError
                      ? "Retry loading more"
                      : "Load more PRs"}
                </Button>
              </div>
            )}
            {data && prs.length > 0 && !data.nextCursor && (
              <p className="py-4 text-center text-[11px] text-muted-foreground">
                You’ve reached the end
              </p>
            )}
          </div>
        </aside>
        {selected ? (
          <PrWorkspace
            key={keyOf(selected)}
            prRef={selected}
            onBack={() => navigate.toPluginPanel("inbox")}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center max-md:hidden">
            <div className="rounded-2xl border border-border p-4">
              <Icon
                name="MessageSquare"
                className="size-7 text-muted-foreground"
              />
            </div>
            <h2 className="text-lg font-medium">
              Give every PR a conversation.
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Pick a pull request to read the changes, keep private notes, and
              ask your agent about the code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
function PrRow({
  pr,
  selected,
  onOpen,
}: {
  pr: InboxPr;
  selected: boolean;
  onOpen: () => void;
}) {
  const color =
    pr.status === "open"
      ? "text-emerald-600 dark:text-emerald-400"
      : pr.status === "merged"
        ? "text-violet-600 dark:text-violet-400"
        : pr.status === "closed"
          ? "text-rose-600 dark:text-rose-400"
          : "text-muted-foreground";
  return (
    <button
      data-pr-row={keyOf(pr)}
      type="button"
      title={`${pr.title}\n${pr.repo}#${pr.number}`}
      aria-label={`${pr.repo}#${pr.number} ${pr.title}`}
      onClick={onOpen}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "mb-1 w-full rounded-lg px-2.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-muted/80",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon
          name={pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"}
          className={cn("size-3 shrink-0", color)}
        />
        <span>#{pr.number}</span>
        <span className="ml-auto truncate">{relativeDate(pr.updatedAt)}</span>
      </div>
      <span className="block truncate text-xs font-semibold leading-5">
        {pr.title}
      </span>
      <span
        className="mt-1 block truncate text-[10px] text-muted-foreground"
        title={pr.repo}
      >
        {pr.repo}
      </span>
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "inbox",
    path: "inbox",
    title: "PR Inbox",
    icon: "GitPullRequest",
    component: InboxPage,
  });
});
