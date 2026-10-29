import { useEffect, useRef, useState } from "react";
import { useRpc, experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Detail, PrRef, PrControls, PrAction } from "./github";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { ErrorNotice, messageOf, keyOf } from "./pr-ui";
import { controlViews, viewKey } from "./view-cache";

const actionNames: Record<PrAction, string> = {
  merge: "Merge pull request",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
  draft: "Convert to draft",
  ready: "Mark ready for review",
  close: "Close pull request",
  reopen: "Reopen pull request",
};
export function PullRequestControls({
  prRef,
  pr,
  revision,
  onChanged,
}: {
  prRef: PrRef;
  pr: Detail["pr"];
  revision: number;
  onChanged: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const cacheKey = viewKey(pluginId, prRef);
  const [capabilities, setCapabilities] = useState<PrControls | null>(
    () => controlViews.peek(cacheKey) ?? null,
  );
  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [pending, setPending] = useState<PrAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    controlViews
      .read(cacheKey, () =>
        rpc.call("controls", { ...prRef, refresh: revision > 0 }),
      )
      .then(
        (value) => {
          if (!active) return;
          setCapabilities(value);
          setMethod((previous) =>
            value.mergeMethods.includes(previous)
              ? previous
              : (value.mergeMethods[0] ?? "merge"),
          );
          setError(null);
        },
        (cause) => {
          if (active) setError(messageOf(cause));
        },
      );
    return () => {
      active = false;
    };
  }, [rpc, prRef, revision, retry, cacheKey]);
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);
  const confirmationTitles: Record<PrAction, string> = {
    merge: `Merge pull request #${pr.number}?`,
    squash: `Squash and merge pull request #${pr.number}?`,
    rebase: `Rebase and merge pull request #${pr.number}?`,
    draft: `Convert pull request #${pr.number} to draft?`,
    ready: `Mark pull request #${pr.number} ready for review?`,
    close: `Close pull request #${pr.number}?`,
    reopen: `Reopen pull request #${pr.number}?`,
  };
  const open = pr.state === "OPEN";
  const merged = pr.state === "MERGED";
  const mergeEnabled = Boolean(
    capabilities?.canMerge &&
    open &&
    !pr.isDraft &&
    capabilities.mergeMethods.length &&
    capabilities.mergeable !== "CONFLICTING",
  );
  const updateEnabled = Boolean(capabilities?.canUpdate && !merged);
  const run = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await rpc.call("action", {
        ...prRef,
        action: pending,
        expectedHeadSha: pr.headRefOid,
      });
      setSuccess(result.message);
      setError(null);
      setPending(null);
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!merged && (
          <div className="flex items-stretch">
            <Button
              size="sm"
              className="rounded-r-none"
              disabled={!mergeEnabled || busy}
              onClick={() => {
                setSuccess(null);
                setPending(method);
              }}
            >
              <Icon
                name="GitMerge"
                fallback="GitPullRequest"
                className="size-3.5"
              />
              {actionNames[method]}
            </Button>
            <div className="relative flex">
              <select
                aria-label="Merge method"
                value={method}
                disabled={
                  !capabilities?.canMerge ||
                  !open ||
                  busy ||
                  !capabilities.mergeMethods.length
                }
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next === "merge" ||
                    next === "squash" ||
                    next === "rebase"
                  )
                    setMethod(next);
                }}
                className="w-9 appearance-none rounded-r-md border border-l-0 border-input bg-background text-xs text-transparent [&_option]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option
                  value="merge"
                  disabled={!capabilities?.mergeMethods.includes("merge")}
                >
                  Merge commit
                </option>
                <option
                  value="squash"
                  disabled={!capabilities?.mergeMethods.includes("squash")}
                >
                  Squash and merge
                </option>
                <option
                  value="rebase"
                  disabled={!capabilities?.mergeMethods.includes("rebase")}
                >
                  Rebase and merge
                </option>
              </select>
              <Icon
                name="ChevronDown"
                className="pointer-events-none absolute left-2.5 top-2.5 size-3"
              />
            </div>
          </div>
        )}
        {open && (
          <Button
            variant="outline"
            size="sm"
            disabled={!updateEnabled || busy}
            onClick={() => {
              setSuccess(null);
              setPending(pr.isDraft ? "ready" : "draft");
            }}
          >
            <Icon
              name="GitPullRequestDraft"
              fallback="GitPullRequest"
              className="size-3.5"
            />
            {pr.isDraft ? "Mark ready for review" : "Convert to draft"}
          </Button>
        )}
        {!merged && (
          <Button
            variant="outline"
            size="sm"
            disabled={!updateEnabled || busy}
            onClick={() => {
              setSuccess(null);
              setPending(open ? "close" : "reopen");
            }}
          >
            <Icon name={open ? "X" : "RotateCcw"} className="size-3.5" />
            {open ? "Close pull request" : "Reopen pull request"}
          </Button>
        )}
        {!capabilities && !error && (
          <span className="text-xs text-muted-foreground">
            Checking access…
          </span>
        )}
        {capabilities &&
          !capabilities.canUpdate &&
          !capabilities.canMerge &&
          !merged && (
            <span className="text-xs text-muted-foreground">
              Ask a repository maintainer for access to edit or merge this PR.
            </span>
          )}
      </div>
      {success && (
        <p
          role="status"
          className="text-xs text-emerald-700 dark:text-emerald-400"
        >
          {success}
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <ErrorNotice message={error} />
          {!capabilities && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry PR controls
            </Button>
          )}
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setPending(null);
        }}
        onClose={() => {
          if (!busy) setPending(null);
        }}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45"
        aria-labelledby="pr-action-title"
      >
        <div className="p-5">
          <h3 id="pr-action-title" className="text-lg font-semibold">
            {pending ? confirmationTitles[pending] : "Confirm PR action"}
          </h3>
          <p className="mt-3 break-words text-sm text-muted-foreground">
            {keyOf(prRef)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {pending === "merge" || pending === "squash" || pending === "rebase"
              ? `Merge commit ${pr.headRefOid.slice(0, 12)} into ${pr.baseRefName}. This changes the shared base branch and cannot be undone from this dialog.`
              : pending === "close"
                ? "Close this pull request without merging it."
                : pending === "reopen"
                  ? "Reopen this pull request on GitHub."
                  : pending === "draft"
                    ? "Mark this pull request as a draft."
                    : "Mark this pull request as ready for review."}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void run()}>
            {busy ? "Working…" : pending ? actionNames[pending] : "Confirm"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
