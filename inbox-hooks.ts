import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRpc,
  useRealtimeConnectionState,
  useRealtime,
  experimental_usePluginId,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Inbox, InboxPr } from "./github";
import type { InboxFilters } from "./filters";
import { inboxViews, inboxViewKey } from "./view-cache";

function mergeRows(previous: InboxPr[], incoming: InboxPr[]) {
  const rows = new Map(previous.map((pr) => [`${pr.repo}#${pr.number}`, pr]));
  for (const pr of incoming) {
    const key = `${pr.repo}#${pr.number}`;
    const old = rows.get(key);
    rows.set(
      key,
      old
        ? { ...pr, reasons: [...new Set([...old.reasons, ...pr.reasons])] }
        : pr,
    );
  }
  return [...rows.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export function useInbox(filters: InboxFilters) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const key = inboxViewKey(pluginId, filters);
  const [data, setData] = useState<Inbox | null>(
    () => inboxViews.peek(key) ?? null,
  );
  const latest = useRef<Inbox | null>(data);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(
    async (force = false, more = false) => {
      const current = latest.current;
      if (more && (busy.current || !current?.nextCursor)) return;
      const request = ++sequence.current;
      busy.current = true;
      if (more) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await inboxViews.read(
          more && current?.nextCursor ? `${key}:${current.nextCursor}` : key,
          () =>
            rpc.call("inbox", {
              refresh: force,
              filters,
              ...(more && current?.nextCursor
                ? { cursor: current.nextCursor }
                : {}),
            }),
          force,
        );
        if (request !== sequence.current) return;
        const next =
          more && current
            ? {
                ...result,
                prs: mergeRows(current.prs, result.prs),
                truncated: current.truncated || result.truncated,
              }
            : result;
        inboxViews.set(key, next);
        latest.current = next;
        setData(next);
        setError(null);
        setPageError(null);
      } catch (cause) {
        if (request !== sequence.current) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        if (more) setPageError(message);
        else setError(message);
      } finally {
        if (request === sequence.current) {
          busy.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [rpc, filters, key],
  );
  useEffect(() => {
    const cached = inboxViews.peek(key) ?? null;
    latest.current = cached;
    setData(cached);
    setError(null);
    setPageError(null);
    const debounce = inboxViews.fresh(key)
      ? null
      : setTimeout(() => void refresh(), 200);
    return () => {
      if (debounce) clearTimeout(debounce);
      ++sequence.current;
      busy.current = false;
    };
  }, [refresh, key]);
  useRealtime("prs-changed", () => {
    inboxViews.clear();
    void refresh(true);
  });
  const connection = useRealtimeConnectionState();
  const previous = useRef(connection);
  useEffect(() => {
    if (connection === "connected" && previous.current === "reconnecting")
      void refresh(true);
    previous.current = connection;
  }, [connection, refresh]);
  return {
    data,
    error,
    pageError,
    loading,
    loadingMore,
    refresh: () => refresh(true),
    loadMore: () => refresh(false, true),
  };
}
