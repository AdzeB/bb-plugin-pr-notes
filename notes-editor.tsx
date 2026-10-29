import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  useRpc,
  useRealtime,
  experimental_usePluginId,
  Markdown,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract, Note } from "./server";
import type { PrRef } from "./github";
import { Button } from "./components/ui/button";
import { keyOf, messageOf, Status, ErrorNotice } from "./pr-ui";
import { noteViews, viewKey } from "./view-cache";
import { formatDate } from "./copy";
const draftSchema = z.object({
  body: z.string().max(60_000),
  version: z.number().int().nonnegative(),
});
export function NotesEditor({ prRef }: { prRef: PrRef }) {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const storageKey = `${pluginId}:draft:${keyOf(prRef)}`;
  const cacheKey = viewKey(pluginId, prRef);
  const [saved, setSaved] = useState<Note | null>(
    () => noteViews.peek(cacheKey) ?? null,
  );
  const lastSaved = useRef<Note | null>(saved);
  const [draft, setDraft] = useState<z.infer<typeof draftSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  const dirty = draft !== null && saved !== null && draft.body !== saved.body;
  useEffect(() => {
    let active = true;
    noteViews
      .read(cacheKey, () => rpc.call("note", prRef))
      .then(
        (note) => {
          if (!active) return;
          const previous = lastSaved.current;
          lastSaved.current = note;
          setSaved(note);
          let restored: z.infer<typeof draftSchema> | null = null;
          try {
            const raw = sessionStorage.getItem(storageKey);
            const parsed = raw ? draftSchema.safeParse(JSON.parse(raw)) : null;
            if (parsed?.success) restored = parsed.data;
          } catch {
            /* A blocked browser store must not prevent editing. */
          }
          setDraft((current) =>
            current && (!previous || current.body !== previous.body)
              ? current
              : (restored ?? { body: note.body, version: note.version }),
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
  }, [rpc, prRef, storageKey, reload, cacheKey]);
  useRealtime("notes-changed", (payload) => {
    const parsed = z.object({ key: z.string() }).safeParse(payload);
    if (parsed.success && parsed.data.key === keyOf(prRef)) {
      noteViews.remove(cacheKey);
      setReload((value) => value + 1);
    }
  });
  const remember = (next: z.infer<typeof draftSchema> | null) => {
    try {
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      setError(
        "Browser draft storage is unavailable. Save your note before leaving this page.",
      );
    }
  };
  const discard = () => {
    if (saved) {
      setDraft({ body: saved.body, version: saved.version });
      setConflict(null);
      setError(null);
      remember(null);
    }
  };
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const result = await rpc.call("saveNote", {
        ...prRef,
        body: draft.body,
        expectedVersion: draft.version,
      });
      noteViews.set(cacheKey, result.note);
      if (result.kind === "conflict") {
        setConflict(result.note);
        lastSaved.current = result.note;
        setSaved(result.note);
      } else {
        lastSaved.current = result.note;
        setSaved(result.note);
        setDraft({ body: result.note.body, version: result.note.version });
        setConflict(null);
        remember(null);
        setError(null);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Private notes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep your thoughts here. Saved notes are available to this PR’s
            chats.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button
            size="sm"
            disabled={!draft || !dirty || saving || conflict !== null}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save note"}
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      {conflict && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
        >
          <p>This note was saved elsewhere. Your draft is still here.</p>
          <details>
            <summary className="cursor-pointer text-xs">
              View saved version
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
              {conflict.body}
            </pre>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={discard}>
              Load saved version
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const version = conflict.version;
                setDraft((current) => {
                  const next = current ? { ...current, version } : null;
                  remember(next);
                  return next;
                });
                setConflict(null);
              }}
            >
              Keep my draft
            </Button>
          </div>
        </div>
      )}
      {draft && !draft.body && !saved?.body && (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
          No notes yet. Capture a question, a review concern, or context you
          want your agent to remember.
        </p>
      )}
      {!draft ? (
        <Status>Loading notes…</Status>
      ) : preview ? (
        <div className="min-h-80 rounded-lg border border-border p-4">
          <Markdown content={draft.body || "Nothing to preview yet."} />
        </div>
      ) : (
        <textarea
          aria-label="Private PR notes"
          maxLength={60_000}
          placeholder="Check the retry path and confirm that cancellation keeps the draft."
          value={draft.body}
          disabled={saving}
          onChange={(event) => {
            const next = { body: event.target.value, version: draft.version };
            setDraft(next);
            remember(next);
          }}
          className="min-h-80 w-full resize-y rounded-lg border border-input bg-transparent p-4 text-sm leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span role="status">
          {dirty
            ? "Unsaved draft, kept in this browser tab"
            : saved?.updatedAt
              ? `Saved ${formatDate(saved.updatedAt)}`
              : "No saved notes yet"}
        </span>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={discard}>
            Discard draft
          </Button>
        )}
      </div>
    </div>
  );
}
