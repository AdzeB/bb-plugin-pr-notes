import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  useRpc,
  useRealtime,
  experimental_usePluginId,
  UrlLink,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { PrRef } from "./github";
import type { ActivityItem, ActivityPage } from "./github-activity";
import { activityViews, viewKey } from "./view-cache";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { keyOf, messageOf, relativeDate, ErrorNotice } from "./pr-ui";
import { RichMarkdown } from "./rich-markdown";
import { countLabel } from "./copy";
const draftSchema = z.object({
  body: z.string().max(60_000),
  requestId: z.uuid(),
});
const merge = (before: ActivityItem[], after: ActivityItem[]) => [
  ...new Map([...before, ...after].map((item) => [item.id, item])).values(),
];
function Actor({ actor }: { actor: ActivityItem["actor"] }) {
  const avatar = actor.avatarUrl?.startsWith(
    "https://avatars.githubusercontent.com/",
  )
    ? actor.avatarUrl
    : null;
  return avatar ? (
    <img
      src={avatar}
      alt=""
      className="size-6 rounded-full"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="flex size-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold">
      {actor.login.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function PrActivity({
  prRef,
  active,
  revision,
  files,
  onOpenFile,
}: {
  prRef: PrRef;
  active: boolean;
  revision: number;
  files: { path: string }[];
  onOpenFile: (path: string) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const cacheKey = viewKey(pluginId, prRef);
  const storageKey = `${cacheKey}comment-draft`;
  const [data, setData] = useState<ActivityPage | null>(
    () => activityViews.peek(cacheKey) ?? null,
  );
  const latest = useRef(data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);
  const ownRequests = useRef(new Set<string>());
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const sequence = useRef(0);
  const [draft, setDraft] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) return draftSchema.parse(JSON.parse(raw));
    } catch {
      /* Keep comment editing available when draft storage is blocked. */
    }
    return { body: "", requestId: crypto.randomUUID() };
  });
  const updateDraft = (body: string) => {
    const next = { body, requestId: crypto.randomUUID() };
    setDraft(next);
    try {
      if (body) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* A failed write does not clear the visible draft. */
    }
  };
  const load = useCallback(
    async (force = false, more = false) => {
      const previous = latest.current;
      const page = more && previous ? previous.page + 1 : 1;
      const current = ++sequence.current;
      setLoading(true);
      try {
        const result = await activityViews.read(
          more ? `${cacheKey}${page}` : cacheKey,
          () =>
            rpc.call("activity", {
              ...prRef,
              page,
              refresh: force || revision > 0,
            }),
          force,
        );
        if (current !== sequence.current) return;
        const next =
          more && previous
            ? { ...result, items: merge(previous.items, result.items) }
            : result;
        latest.current = next;
        activityViews.set(cacheKey, next);
        setData(next);
        setError(null);
      } catch (cause) {
        if (current === sequence.current) setError(messageOf(cause));
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [rpc, prRef, cacheKey, revision],
  );
  useEffect(() => {
    if (active) void load();
    return () => {
      ++sequence.current;
    };
  }, [active, load]);
  useRealtime("activity-changed", (payload) => {
    const event = z
      .object({ key: z.string(), requestId: z.string().optional() })
      .safeParse(payload);
    if (
      !event.success ||
      event.data.key !== keyOf(prRef) ||
      ownRequests.current.has(event.data.requestId ?? "")
    )
      return;
    activityViews.remove(cacheKey);
    if (active) void load(true);
  });
  const send = async () => {
    if (!draft.body.trim() || postingRef.current || !data?.canComment) return;
    postingRef.current = true;
    setPosting(true);
    setPostError(null);
    ownRequests.current.add(draft.requestId);
    try {
      const comment = await rpc.call("comment", { ...prRef, ...draft });
      const previous = latest.current;
      if (previous) {
        const next = {
          ...previous,
          items: merge(previous.items, [comment]),
          commentCount:
            previous.commentCount +
            (previous.items.some((item) => item.id === comment.id) ? 0 : 1),
        };
        latest.current = next;
        setData(next);
        activityViews.set(cacheKey, next);
      }
      updateDraft("");
      setPosted(comment.url);
      setPreview(false);
    } catch (cause) {
      setPostError(
        `${messageOf(cause)} Your draft is still here. Refresh activity to check for the comment before sending it again.`,
      );
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  };
  return (
    <section
      aria-label="PR activity"
      className="space-y-5 border-t border-border pt-7"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Activity</h3>
        {data && (
          <span className="text-xs text-muted-foreground">
            {countLabel(data.commentCount, {
              one: "{count} comment",
              other: "{count} comments",
            })}{" "}
            ·{" "}
            {countLabel(data.commitCount, {
              one: "{count} commit",
              other: "{count} commits",
            })}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label="Refresh activity"
          disabled={loading}
          onClick={() => void load(true)}
        >
          <Icon name="RotateCcw" className="size-3.5" />
        </Button>
      </div>
      {error && <ErrorNotice message={error} />}
      {!data && loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading activity…
        </p>
      )}
      {data?.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          No comments or updates yet. Write a GitHub comment below.
        </div>
      )}
      <div className="relative space-y-5 before:absolute before:bottom-3 before:left-3 before:top-3 before:w-px before:bg-border">
        {data?.items.map((item) => (
          <div
            key={item.id}
            data-pr-activity={item.kind}
            className="relative flex items-start gap-3"
          >
            <div className="relative z-10 shrink-0 bg-background py-1">
              <Actor actor={item.actor} />
            </div>
            <div className="min-w-0 flex-1">
              {item.kind === "comment" || item.kind === "review" ? (
                <article className="overflow-hidden rounded-lg border border-border">
                  <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 text-xs">
                    <span className="font-semibold">{item.actor.login}</span>
                    {item.kind === "review" && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {item.state.toLowerCase().replaceAll("_", " ")}
                      </span>
                    )}
                    <UrlLink
                      href={item.url}
                      className="text-muted-foreground"
                      title={item.createdAt ?? undefined}
                      aria-label={`View ${item.kind === "review" ? "review" : "comment"} by ${item.actor.login} on GitHub`}
                    >
                      {item.createdAt
                        ? relativeDate(item.createdAt)
                        : "View on GitHub"}
                    </UrlLink>
                  </header>
                  <div className="p-4">
                    <RichMarkdown
                      content={item.body || "Reviewed this pull request."}
                      files={files}
                      onOpenFile={onOpenFile}
                    />
                    {item.truncated && (
                      <UrlLink
                        href={item.url}
                        className="mt-3 block text-xs text-sky-600 dark:text-sky-400"
                      >
                        Read the complete comment on GitHub
                      </UrlLink>
                    )}
                  </div>
                </article>
              ) : (
                <div className="py-1 text-xs leading-6">
                  <span className="font-semibold">{item.actor.login}</span>
                  <span className="ml-2 text-muted-foreground">
                    {item.kind === "commit" ? "added a commit" : item.label}
                  </span>
                  {item.createdAt && (
                    <time
                      dateTime={item.createdAt}
                      className="ml-2 text-muted-foreground"
                    >
                      · {relativeDate(item.createdAt)}
                    </time>
                  )}
                  {item.kind === "commit" ? (
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words">{item.title}</span>
                      <UrlLink
                        href={item.url}
                        aria-label={`View commit ${item.sha.slice(0, 7)} on GitHub`}
                        className="shrink-0 rounded bg-muted px-1.5 font-mono text-[11px] text-muted-foreground"
                      >
                        {item.sha.slice(0, 7)}
                      </UrlLink>
                    </div>
                  ) : (
                    item.detail && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5">
                        {item.detail}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {data?.hasMore && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load(false, true)}
        >
          {loading ? "Loading activity…" : "Load more activity"}
        </Button>
      )}
      <div className="space-y-3 border-t border-border pt-6">
        {posted && (
          <p
            role="status"
            className="text-xs text-emerald-700 dark:text-emerald-400"
          >
            Comment posted.{" "}
            <UrlLink href={posted} className="underline">
              View comment on GitHub
            </UrlLink>
          </p>
        )}
        {postError && <ErrorNotice message={postError} />}
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-medium">Leave a comment</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 text-xs"
              disabled={!draft.body}
              onClick={() => setPreview((value) => !value)}
            >
              {preview ? "Write" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-28 p-4">
              <RichMarkdown
                content={draft.body}
                files={files}
                onOpenFile={onOpenFile}
              />
            </div>
          ) : (
            <textarea
              aria-label="Leave a comment"
              placeholder="The retry keeps the original request. Can we also check cancellation?"
              maxLength={60_000}
              value={draft.body}
              disabled={posting || !data?.canComment}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
              className="min-h-28 w-full resize-y bg-transparent p-4 text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
            <span className="text-[11px] text-muted-foreground">
              {data && !data.canComment
                ? "Comments are unavailable. Open this PR on GitHub to check access."
                : "Posts to GitHub · Markdown supported · ⌘/Ctrl+Enter to send"}
            </span>
            <Button
              size="sm"
              disabled={posting || !draft.body.trim() || !data?.canComment}
              onClick={() => void send()}
            >
              {posting ? "Posting…" : "Comment"}
            </Button>
          </footer>
        </div>
      </div>
    </section>
  );
}
