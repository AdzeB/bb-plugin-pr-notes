import { useEffect, useState } from "react";
import {
  useRpc,
  useSdk,
  useBbNavigate,
  useBbContext,
  experimental_usePluginId,
  experimental_NewThreadComposer as NewThreadComposer,
  ThreadChat,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract, Chat } from "./server";
import type { PrRef } from "./github";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { keyOf, messageOf, Status, ErrorNotice } from "./pr-ui";
import { chatViews, viewKey } from "./view-cache";
export function PrChat({ prRef, active }: { prRef: PrRef; active: boolean }) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const { projectId } = useBbContext();
  const pluginId = experimental_usePluginId();
  const cacheKey = viewKey(pluginId, prRef);
  const [chats, setChats] = useState<Chat[] | null>(
    () => chatViews.peek(cacheKey)?.chats ?? null,
  );
  const [threadId, setThreadId] = useState<string | null>(
    () => chatViews.peek(cacheKey)?.chats[0]?.id ?? null,
  );
  const [newChat, setNewChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    chatViews
      .read(cacheKey, () => rpc.call("chats", prRef))
      .then(
        (result) => {
          if (alive) {
            setChats(result.chats);
            setLimited(result.truncated);
            setThreadId((current) => current ?? result.chats[0]?.id ?? null);
            setError(null);
          }
        },
        (cause) => {
          if (alive) setError(messageOf(cause));
        },
      );
    return () => {
      alive = false;
    };
  }, [active, rpc, prRef, refresh, cacheKey]);
  const submit = async (request: NewThreadRequest) => {
    try {
      const context = await rpc.call("context", prRef);
      const thread = await sdk.threads.spawn({
        ...request,
        input: [
          { type: "text", text: context.text, mentions: [] },
          ...request.input,
        ],
        title: `PR #${prRef.number} · ${prRef.repo}`,
        pluginMetadata: {
          kind: "pull-request",
          ...prRef,
          headShaAtStart: context.headSha,
        },
      });
      setThreadId(thread.id);
      setNewChat(false);
      chatViews.remove(cacheKey);
      setRefresh((value) => value + 1);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
      throw cause;
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Icon name="MessageSquare" className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">PR conversation</span>
        {(chats?.length ?? 0) > 0 && (
          <select
            aria-label="PR conversation"
            className="min-w-0 max-w-64 rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={newChat ? "" : (threadId ?? "")}
            onChange={(event) => {
              if (event.target.value) {
                setThreadId(event.target.value);
                setNewChat(false);
              }
            }}
          >
            <option value="" disabled>
              Choose a conversation
            </option>
            {chats?.map((chat) => (
              <option value={chat.id} key={chat.id}>
                {chat.title}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          {threadId && !newChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate.toThread(threadId)}
            >
              Open thread
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setNewChat(true)}>
            New chat
          </Button>
        </div>
      </div>
      {error && (
        <div className="p-4">
          <ErrorNotice message={error} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              chatViews.remove(cacheKey);
              setRefresh((value) => value + 1);
            }}
          >
            Retry conversations
          </Button>
        </div>
      )}
      {limited && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Searching the latest 1,000 PR chat threads. Older chats remain in BB’s
          thread list.
        </p>
      )}
      {threadId && !newChat ? (
        <ThreadChat
          key={threadId}
          threadId={threadId}
          variant="full"
          layout="contained"
          permissionPolicy="inherit"
          className="min-h-0 flex-1"
        />
      ) : chats ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-5 pb-2 pt-6">
            <h3 className="text-lg font-medium">Ask about this PR</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Ask for an explanation, a review, or help with a specific change.
              The conversation starts with the PR’s latest details and your
              saved notes.
            </p>
          </div>
          <NewThreadComposer
            defaultProjectId={projectId ?? undefined}
            draftKey={`${pluginId}:chat:${keyOf(prRef)}`}
            placeholder="What would you like to know about this PR?"
            layout="contained"
            onSubmit={submit}
            className="min-h-0 flex-1 px-3 pb-3"
          />
        </div>
      ) : !error ? (
        <Status>Loading conversations…</Status>
      ) : null}
    </div>
  );
}
