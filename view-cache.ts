import { createReadCache } from "./read-cache";
import type { Inbox, Detail, DiffPage, PrControls, PrRef } from "./github";
import type { Chat, Note } from "./server";
import type { InboxFilters } from "./filters";
import type { ActivityPage } from "./github-activity";
import type { ChecksPage, CheckAnnotations } from "./github-checks";
export const CACHE_AGE = 5 * 60_000;
export const inboxViews = createReadCache<Inbox>(CACHE_AGE, 30);
export const detailViews = createReadCache<Detail>(CACHE_AGE, 24);
export const codeViews = createReadCache<DiffPage>(CACHE_AGE, 24);
export const controlViews = createReadCache<PrControls>(CACHE_AGE, 24);
export const chatViews = createReadCache<{ chats: Chat[]; truncated: boolean }>(
  CACHE_AGE,
  24,
);
export const activityViews = createReadCache<ActivityPage>(CACHE_AGE, 24);
export const checkViews = createReadCache<ChecksPage>(CACHE_AGE, 24);
export const annotationViews = createReadCache<CheckAnnotations>(CACHE_AGE, 40);
export const noteViews = createReadCache<Note>(CACHE_AGE, 40);
export const scrollPositions = new Map<string, number>();
export const viewKey = (pluginId: string, ref: PrRef) =>
  `${pluginId}:${ref.repo.toLowerCase()}#${ref.number}:`;
export const inboxViewKey = (pluginId: string, filters: InboxFilters) =>
  `${pluginId}:${JSON.stringify({ ...filters, statuses: [...filters.statuses].sort(), excludedRepos: [...filters.excludedRepos].sort(), repositories: [...filters.repositories].sort() })}`;
export function invalidatePrViews(pluginId: string, ref: PrRef) {
  const prefix = viewKey(pluginId, ref);
  detailViews.remove(prefix);
  codeViews.remove(prefix);
  controlViews.remove(prefix);
  chatViews.remove(prefix);
  activityViews.remove(prefix);
  checkViews.remove(prefix);
  annotationViews.remove(prefix);
}
