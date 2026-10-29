import type { ReactNode } from "react";
import type { PrRef } from "./github";
import { statusLabels, type PrStatus } from "./filters";
import { cn } from "./lib/utils";
export const keyOf = (ref: PrRef) => `${ref.repo.toLowerCase()}#${ref.number}`;
export const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
export function Status({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
export function StateBadge({ status }: { status: PrStatus }) {
  const colors = {
    open: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    draft: "border-border bg-muted text-muted-foreground",
    closed:
      "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    merged:
      "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        colors[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}
export { relativeDate } from "./copy";

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
