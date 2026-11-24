import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadStacks, stackDashboardUrl, type LoadResult, type Stack } from "./data";
import { groupByColor, matchesQuery, type ColorGroup } from "./grouping";
import { ExternalIcon, StackPanel } from "./StackPanel";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadResult };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const COLLAPSED_KEY = "stacks:collapsed-groups";

function readCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const panelHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    loadStacks()
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      );
  }, []);

  const groups = useMemo(
    () => (state.status === "ready" ? groupByColor(state.data.stacks) : []),
    [state]
  );
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, stacks: g.stacks.filter((s) => matchesQuery(s, query)) }))
        .filter((g) => g.stacks.length > 0),
    [groups, query]
  );
  // A filter shows every match, so it overrides collapsed groups while it's set.
  const searching = query.trim() !== "";
  const isCollapsed = (key: string) => !searching && collapsed.has(key);
  const visibleKeys = useMemo(
    () =>
      visibleGroups
        .filter((g) => searching || !collapsed.has(g.key))
        .flatMap((g) => g.stacks.map((s) => s.api_key)),
    [visibleGroups, collapsed, searching]
  );

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Not persisted; fine.
    }
  }, [collapsed]);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const select = (apiKey: string, focusRow: boolean) => {
    setSelectedKey(apiKey);
    if (focusRow) {
      const button = rowButtons.current.get(apiKey);
      button?.focus();
      button?.scrollIntoView({ block: "nearest" });
    }
  };

  const close = () => {
    const button = selectedKey ? rowButtons.current.get(selectedKey) : undefined;
    setSelectedKey(null);
    button?.focus();
  };

  // While the panel is open: ↑/↓ (or k/j) step through visible stacks, Esc closes.
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const step = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
      if (!step || visibleKeys.length === 0) return;
      e.preventDefault();
      const index = visibleKeys.indexOf(selectedKey);
      const next = index === -1 ? 0 : Math.min(Math.max(index + step, 0), visibleKeys.length - 1);
      select(visibleKeys[next], true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (state.status === "loading") {
    return (
      <main className="page">
        <p className="state" role="status">Loading stacks…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <div className="state state--error" role="alert">
          <h1>Stacks couldn’t be loaded</h1>
          <p>{state.message}</p>
        </div>
      </main>
    );
  }

  const { data } = state;
  const total = data.stacks.length;
  const colorCount = groups.filter((g) => !g.isUncolored).length;
  const selected = selectedKey ? data.stacks.find((s) => s.api_key === selectedKey) : undefined;
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  const summary =
    total === 0
      ? `No stacks in ${data.orgName} that you can access.`
      : colorCount === 0
        ? `${plural(total, "stack", "stacks")} in ${data.orgName}. None have a color set.`
        : `${plural(total, "stack", "stacks")} in ${data.orgName}, across ${plural(colorCount, "color", "colors")}.`;

  return (
    <div className={selected ? "app has-panel" : "app"}>
      <main className="page">
        <header className="masthead">
          <div>
            <h1>Stacks by color</h1>
            <p className="summary">{summary}</p>
          </div>
          {total > 0 && (
            <label className="search">
              <span className="visually-hidden">Filter stacks</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name, description or API key"
              />
            </label>
          )}
        </header>

        {data.preview && (
          <p className="notice">
            You’re looking at sample stacks. Open this app from your organization in Contentstack to
            see real ones.
          </p>
        )}

        {total > 0 && visibleGroups.length === 0 && (
          <p className="state">No stacks match “{query.trim()}”.</p>
        )}

        {groups.length > 1 && !searching && (
          <div className="groups-tools">
            <button
              type="button"
              className="text-button"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
        )}

        <div className="groups">
          {visibleGroups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              appUrl={data.appUrl}
              collapsed={isCollapsed(group.key)}
              onToggle={searching ? undefined : () => toggleGroup(group.key)}
              selectedKey={selectedKey}
              onSelect={(apiKey) => {
                const opening = !selectedKey;
                setSelectedKey(apiKey === selectedKey ? null : apiKey);
                // Move focus into the panel the first time it opens, for screen readers.
                if (opening) requestAnimationFrame(() => panelHeading.current?.focus());
              }}
              registerRow={(apiKey, el) => {
                if (el) rowButtons.current.set(apiKey, el);
                else rowButtons.current.delete(apiKey);
              }}
            />
          ))}
        </div>
      </main>

      {selected && (
        <StackPanel
          ref={panelHeading}
          stack={selected}
          appUrl={data.appUrl}
          preview={data.preview}
          currentUserUid={data.currentUserUid}
          onClose={close}
        />
      )}
    </div>
  );
}

interface RowHandlers {
  selectedKey: string | null;
  onSelect: (apiKey: string) => void;
  registerRow: (apiKey: string, el: HTMLButtonElement | null) => void;
}

function GroupSection({
  group,
  appUrl,
  collapsed,
  onToggle,
  ...handlers
}: {
  group: ColorGroup;
  appUrl: string | null;
  collapsed: boolean;
  /** Absent while a filter is set: matches are always shown then. */
  onToggle?: () => void;
} & RowHandlers) {
  const id = group.key.replace(/[^a-z0-9]+/gi, "-");
  const headingId = `group-${id}`;
  const listId = `group-list-${id}`;
  const style = group.css ? ({ "--swatch": group.css } as CSSProperties) : undefined;
  const railClass = group.isUncolored || !group.css ? "rail rail--none" : "rail";
  const names = group.stacks.map((s) => s.name).join(", ");

  return (
    <section
      className={collapsed ? "group group--collapsed" : "group"}
      style={style}
      aria-labelledby={headingId}
    >
      <div className={railClass} aria-hidden="true" />
      <div className="group-body">
        <h2 className="group-title" id={headingId}>
          <button
            type="button"
            className="group-toggle"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggle}
            disabled={!onToggle}
            title={onToggle ? undefined : "Clear the filter to collapse groups"}
          >
            <svg className="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {group.label}
            <span className="group-count">{plural(group.stacks.length, "stack", "stacks")}</span>
            {collapsed && <span className="group-names">{names}</span>}
          </button>
        </h2>
        {!collapsed && (
          <ul className="stack-list" id={listId}>
            {group.stacks.map((stack) => (
              <StackRow key={stack.uid ?? stack.api_key} stack={stack} appUrl={appUrl} {...handlers} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StackRow({
  stack,
  appUrl,
  selectedKey,
  onSelect,
  registerRow,
}: { stack: Stack; appUrl: string | null } & RowHandlers) {
  const url = stackDashboardUrl(appUrl, stack.api_key);
  const description = typeof stack.description === "string" ? stack.description.trim() : "";
  const isSelected = selectedKey === stack.api_key;

  return (
    <li className={isSelected ? "stack-row stack-row--selected" : "stack-row"}>
      <button
        type="button"
        className="stack-main"
        aria-expanded={isSelected}
        aria-controls={isSelected ? "stack-panel" : undefined}
        onClick={() => onSelect(stack.api_key)}
        ref={(el) => registerRow(stack.api_key, el)}
      >
        <span className="stack-name">{stack.name}</span>
        {description && <span className="stack-desc">{description}</span>}
      </button>
      {stack.master_locale && (
        <span className="stack-locale" title="Master locale">
          {stack.master_locale}
        </span>
      )}
      <code className="stack-key" title="API key">
        {stack.api_key}
      </code>
      {url ? (
        <a
          className="icon-button"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${stack.name} in Contentstack`}
          title="Open in Contentstack"
        >
          <ExternalIcon />
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}
