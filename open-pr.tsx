import { useId, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Icon } from "./components/ui/icon";

export function OpenPrControl({ onOpen }: { onOpen: (url: string) => void }) {
  const id = useId();
  const panel = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  return (
    <>
      <span title="Open a pull request">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Open a pull request"
          popoverTarget={id}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPosition({
              top: Math.max(8, Math.min(rect.bottom + 6, innerHeight - 160)),
              left: Math.max(8, Math.min(rect.left, innerWidth - 388)),
            });
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          <Icon name="Plus" className="size-4" />
        </Button>
      </span>
      <form
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Open pull request"
        style={position}
        className="fixed m-0 w-[min(380px,calc(100vw-16px))] space-y-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onOpen(url);
            setUrl("");
            setError(null);
            panel.current?.hidePopover();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <label htmlFor={`${id}-url`} className="text-sm font-medium">
          Open pull request
        </label>
        <div className="flex gap-2">
          <Input
            ref={input}
            id={`${id}-url`}
            aria-label="Pull request URL"
            placeholder="https://github.com/octocat/hello-world/pull/42"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" size="sm">
            Open
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
