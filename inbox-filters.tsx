import { useId, useRef, useState } from "react";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import {
  defaultFilters,
  filterCount,
  statusLabels,
  statusSchema,
  repositorySchema,
  type InboxFilters,
} from "./filters";

function FilterChoice({
  label,
  checked,
  onChange,
  radio,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  radio?: boolean;
}) {
  return (
    <label
      title={label}
      className="relative flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring"
    >
      <input
        type={radio ? "radio" : "checkbox"}
        name={radio ? "pr-filter-time" : undefined}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0 truncate">{label}</span>
      {checked ? (
        <Icon name="Check" className="size-3.5 shrink-0" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
    </label>
  );
}
export function InboxFilterControls({
  filters,
  repositories,
  onChange,
}: {
  filters: InboxFilters;
  repositories: string[];
  onChange: (next: InboxFilters) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const repoPanel = useRef<HTMLDivElement>(null);
  const repoTrigger = useRef<HTMLButtonElement>(null);
  const [repoPosition, setRepoPosition] = useState({
    top: 0,
    left: 0,
    width: 280,
  });
  const repoId = `${id}-repos`;
  const positionRepositories = () => {
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(280, innerWidth - 16);
    const right = rect.right + 6;
    const left =
      right + width <= innerWidth - 8
        ? right
        : rect.left - width - 6 >= 8
          ? rect.left - width - 6
          : Math.max(8, innerWidth - width - 8);
    setRepoPosition({
      top: Math.max(
        8,
        Math.min(rect.top, innerHeight - Math.min(480, innerHeight * 0.8) - 8),
      ),
      left,
      width,
    });
  };
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const count = filterCount(filters);
  const [repoSearch, setRepoSearch] = useState("");
  const customRepo = repositorySchema.safeParse(repoSearch);
  const visibleRepos = repositories.filter((repo) =>
    repo.toLowerCase().includes(repoSearch.toLowerCase()),
  );
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-8 shrink-0"
        aria-label="Filter pull requests"
        aria-haspopup="dialog"
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(
              8,
              Math.min(
                rect.bottom + 6,
                innerHeight - Math.min(innerHeight * 0.8, 650) - 8,
              ),
            ),
            left: Math.max(
              8,
              Math.min(rect.right - 250, window.innerWidth - 258),
            ),
          });
        }}
      >
        <Icon name="SlidersHorizontal" className="size-4" />
        {count > 0 && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-sky-500" />
        )}
      </Button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Filter inbox"
        style={position}
        className="fixed m-0 max-h-[min(80vh,650px)] w-[250px] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
      >
        <FilterChoice
          label="Assigned to me"
          checked={filters.scope === "assigned"}
          onChange={() =>
            onChange({
              ...filters,
              scope: filters.scope === "assigned" ? "all" : "assigned",
            })
          }
        />
        <FilterChoice
          label="Review requested"
          checked={filters.scope === "reviews"}
          onChange={() =>
            onChange({
              ...filters,
              scope: filters.scope === "reviews" ? "all" : "reviews",
            })
          }
        />
        <fieldset className="mt-3">
          <legend className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Status
          </legend>
          {statusSchema.options.map((status) => (
            <FilterChoice
              key={status}
              label={statusLabels[status]}
              checked={filters.statuses.includes(status)}
              onChange={() =>
                onChange({
                  ...filters,
                  statuses: filters.statuses.includes(status)
                    ? filters.statuses.filter((value) => value !== status)
                    : [...filters.statuses, status],
                })
              }
            />
          ))}
        </fieldset>
        <fieldset className="mt-3">
          <legend className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Time
          </legend>
          {(
            [
              { value: "all", label: "All time" },
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
            ] satisfies { value: InboxFilters["time"]; label: string }[]
          ).map((option) => (
            <FilterChoice
              key={option.value}
              label={option.label}
              radio
              checked={filters.time === option.value}
              onChange={() =>
                onChange({
                  ...filters,
                  time: option.value,
                  timezoneOffset: new Date().getTimezoneOffset(),
                })
              }
            />
          ))}
        </fieldset>
        <div className="mt-3 border-t border-border pt-2">
          <button
            ref={repoTrigger}
            type="button"
            aria-label="Choose repositories"
            aria-haspopup="dialog"
            popoverTarget={repoId}
            className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={positionRepositories}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                positionRepositories();
                repoPanel.current?.showPopover();
              }
            }}
          >
            <span>Repositories</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {filters.repositories.length
                ? `${filters.repositories.length} selected`
                : filters.excludedRepos.length
                  ? "Custom"
                  : "All"}
              <Icon name="ChevronRight" className="size-3.5" />
            </span>
          </button>
          <div
            ref={repoPanel}
            id={repoId}
            popover="auto"
            role="dialog"
            aria-label="Choose repositories"
            style={repoPosition}
            className="fixed m-0 max-h-[min(80vh,480px)] overflow-y-auto rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            onKeyDown={(event) => {
              const editingText =
                event.target instanceof HTMLInputElement &&
                !["checkbox", "radio"].includes(event.target.type);
              if (event.key === "ArrowLeft" && !editingText) {
                event.preventDefault();
                event.stopPropagation();
                repoPanel.current?.hidePopover();
                repoTrigger.current?.focus();
              }
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Repositories</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Back to filters"
                onClick={() => {
                  repoPanel.current?.hidePopover();
                  repoTrigger.current?.focus();
                }}
              >
                <Icon name="X" className="size-3" />
              </Button>
            </div>
            <div className="space-y-2 px-1 pb-1 pt-2">
              <Input
                aria-label="Search repositories"
                placeholder="octocat/hello-world"
                value={repoSearch}
                onChange={(event) => setRepoSearch(event.target.value)}
                className="h-8 text-xs"
              />
              <FilterChoice
                label="All repositories"
                checked={
                  filters.repositories.length === 0 &&
                  filters.excludedRepos.length === 0
                }
                onChange={() =>
                  onChange({ ...filters, repositories: [], excludedRepos: [] })
                }
              />
              <div className="max-h-40 overflow-y-auto">
                {visibleRepos.slice(0, 50).map((repo) => (
                  <FilterChoice
                    key={repo}
                    label={repo}
                    checked={filters.repositories.includes(repo)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        excludedRepos: [],
                        repositories: filters.repositories.includes(repo)
                          ? filters.repositories.filter(
                              (value) => value !== repo,
                            )
                          : [...filters.repositories, repo].slice(0, 50),
                      })
                    }
                  />
                ))}
              </div>
              {customRepo.success &&
                !repositories.includes(customRepo.data) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto w-full whitespace-normal break-all text-xs"
                    onClick={() =>
                      onChange({
                        ...filters,
                        excludedRepos: [],
                        repositories: [
                          ...new Set([
                            ...filters.repositories,
                            customRepo.data,
                          ]),
                        ].slice(0, 50),
                      })
                    }
                  >
                    Use {customRepo.data}
                  </Button>
                )}
              {visibleRepos.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">
                  No matching repositories. Try another name or enter
                  owner/repository.
                </p>
              )}
              {visibleRepos.length > 50 && (
                <p className="px-2 text-xs text-muted-foreground">
                  Search to narrow the list.
                </p>
              )}
            </div>
          </div>
        </div>
        {count > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => onChange(defaultFilters())}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
