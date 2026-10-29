import { useEffect, useMemo, useRef } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";

export function RichMarkdown({
  content,
  files = [],
  onOpenFile,
  className,
}: {
  content: string;
  files?: { path: string }[];
  onOpenFile?: (path: string) => void;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const paths = useMemo(() => {
    const result = new Map<string, string>();
    for (const file of files) result.set(file.path, file.path);
    const basenames = new Map<string, string | null>();
    for (const file of files) {
      const name = file.path.split("/").at(-1)!;
      basenames.set(name, basenames.has(name) ? null : file.path);
    }
    for (const [name, path] of basenames)
      if (path !== null) result.set(name, path);
    return result;
  }, [files]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const decorate = () => {
      for (const code of Array.from(element.querySelectorAll("code"))) {
        if (code.closest("pre") || code.textContent?.includes("\n")) continue;
        if (code.hasAttribute("data-pr-chip")) {
          for (const attr of [
            "data-pr-file",
            "data-pr-file-kind",
            "role",
            "tabindex",
            "title",
            "aria-label",
          ])
            code.removeAttribute(attr);
        }
        code.setAttribute("data-pr-chip", "true");
        const text = code.textContent?.trim() ?? "";
        const name = text.replace(/:\d+(?::\d+)?$/, "");
        const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
        if (
          extension &&
          [
            "yml",
            "yaml",
            "ts",
            "tsx",
            "js",
            "jsx",
            "cs",
            "json",
            "md",
            "mdx",
            "sql",
            "py",
            "rs",
            "go",
            "swift",
            "kt",
            "css",
            "html",
            "xml",
            "toml",
            "sh",
          ].includes(extension)
        )
          code.setAttribute("data-pr-file-kind", extension);
        const path = paths.get(name);
        if (path && onOpenFile) {
          code.setAttribute("data-pr-file", path);
          code.setAttribute("role", "button");
          code.setAttribute("tabindex", "0");
          code.setAttribute("title", `View changes in ${path}`);
          code.setAttribute("aria-label", `View changes in ${text}`);
        }
      }
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [content, paths, onOpenFile]);
  const open = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    const path = target
      .closest("code[data-pr-file]")
      ?.getAttribute("data-pr-file");
    if (!path || !files.some((file) => file.path === path) || !onOpenFile)
      return false;
    onOpenFile(path);
    return true;
  };
  return (
    <div
      ref={root}
      className={cn(
        "pr-description [&_a]:text-sky-600 dark:[&_a]:text-sky-400",
        className,
      )}
      onClick={(event) => open(event.target)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && open(event.target))
          event.preventDefault();
      }}
    >
      <Markdown content={content} />
    </div>
  );
}
