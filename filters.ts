import { z } from "zod";

export const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/)
  .transform((value) => value.toLowerCase());
export const statusSchema = z.enum(["open", "draft", "closed", "merged"]);
export type PrStatus = z.infer<typeof statusSchema>;
export const filterSchema = z.object({
  statuses: z.array(statusSchema).max(4).default([]),
  time: z.enum(["all", "today", "7d", "30d"]).default("all"),
  excludedRepos: z.array(repositorySchema).max(100).default([]),
  repositories: z.array(repositorySchema).max(50).default([]),
  timezoneOffset: z.number().int().min(-840).max(840).default(0),
  scope: z.enum(["all", "reviews", "assigned"]).default("all"),
  query: z.string().max(200).default(""),
});
export type InboxFilters = z.infer<typeof filterSchema>;
export const defaultFilters = (): InboxFilters => ({
  statuses: [],
  time: "all",
  excludedRepos: [],
  repositories: [],
  timezoneOffset: new Date().getTimezoneOffset(),
  scope: "all",
  query: "",
});
export const statusLabels: Record<PrStatus, string> = {
  open: "Open",
  draft: "Draft",
  closed: "Closed",
  merged: "Merged",
};
export function filterStart(filters: InboxFilters, now = Date.now()): number {
  if (filters.time === "all") return 0;
  if (filters.time === "today") {
    const local = new Date(now - filters.timezoneOffset * 60_000);
    local.setUTCHours(0, 0, 0, 0);
    return local.getTime() + filters.timezoneOffset * 60_000;
  }
  return now - (filters.time === "7d" ? 7 : 30) * 86_400_000;
}
export function filterCount(filters: InboxFilters) {
  return (
    filters.statuses.length +
    filters.excludedRepos.length +
    filters.repositories.length +
    (filters.time === "all" ? 0 : 1) +
    (filters.scope === "all" ? 0 : 1) +
    (filters.query ? 1 : 0)
  );
}
