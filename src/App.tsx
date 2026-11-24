import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadStacks, stackDashboardUrl, type LoadResult, type Stack } from "./data";
import { groupByColor, matchesQuery, type ColorGroup } from "./grouping";
import { ExternalIcon, StackPanel } from "./StackPanel";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadResult };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
  const visibleKeys = useMemo(
    () => visibleGroups.flatMap((g) => g.stacks.map((s) => s.api_key)),
    [visibleGroups]
  );

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

        <div className="groups">
          {visibleGroups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              appUrl={data.appUrl}
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
  ...handlers
}: { group: ColorGroup; appUrl: string | null } & RowHandlers) {
  const headingId = `group-${group.key.replace(/[^a-z0-9]+/gi, "-")}`;
  const style = group.css ? ({ "--swatch": group.css } as CSSProperties) : undefined;
  const railClass = group.isUncolored || !group.css ? "rail rail--none" : "rail";

  return (
    <section className="group" style={style} aria-labelledby={headingId}>
      <div className={railClass} aria-hidden="true" />
      <div className="group-body">
        <h2 className="group-title" id={headingId}>
          {group.label}
          <span className="group-count">{plural(group.stacks.length, "stack", "stacks")}</span>
        </h2>
        <ul className="stack-list">
          {group.stacks.map((stack) => (
            <StackRow key={stack.uid ?? stack.api_key} stack={stack} appUrl={appUrl} {...handlers} />
          ))}
        </ul>
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
