import { forwardRef, useEffect, useState, type CSSProperties } from "react";
import { stackDashboardUrl, type Stack } from "./data";
import {
  SECTIONS,
  TOTAL_REQUESTS,
  errorMessage,
  formatAgo,
  formatDate,
  loadSection,
  readCached,
  readOpenSections,
  writeOpenSections,
  type Cached,
  type Detail,
  type SectionDef,
} from "./details";
import { resolveStackColor } from "./stackColor";

/** Wait this long after a section opens (or the stack changes) before fetching,
 *  so arrowing quickly through stacks doesn't fire a request per stack. */
const SETTLE_MS = 300;

interface Props {
  stack: Stack;
  appUrl: string | null;
  preview: boolean;
  currentUserUid: string | null;
  onClose: () => void;
}

export const StackPanel = forwardRef<HTMLHeadingElement, Props>(function StackPanel(
  { stack, appUrl, preview, currentUserUid, onClose },
  headingRef
) {
  const [open, setOpen] = useState<string[]>(readOpenSections);
  const color = resolveStackColor(stack);
  const style = color?.css ? ({ "--swatch": color.css } as CSSProperties) : undefined;
  const url = stackDashboardUrl(appUrl, stack.api_key);
  const description = typeof stack.description === "string" ? stack.description.trim() : "";
  const allOpen = open.length === SECTIONS.length;

  useEffect(() => writeOpenSections(open), [open]);
  const toggle = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <aside className="panel" id="stack-panel" style={style} aria-labelledby="panel-title">
      <header className="panel-head">
        <span className={color?.css ? "panel-swatch" : "panel-swatch panel-swatch--none"} aria-hidden="true" />
        <div className="panel-heading">
          <h2 id="panel-title" ref={headingRef} tabIndex={-1}>
            {stack.name}
          </h2>
          {description && <p className="panel-desc">{description}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="panel-body">
        <Facts stack={stack} currentUserUid={currentUserUid} />

        {url && (
          <a className="panel-open" href={url} target="_blank" rel="noopener noreferrer">
            Open stack in Contentstack
            <ExternalIcon />
          </a>
        )}

        <div className="sections-head">
          <h3>Details</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => setOpen(allOpen ? [] : SECTIONS.map((s) => s.id))}
          >
            {allOpen ? "Collapse all" : `Load all · ${TOTAL_REQUESTS} requests`}
          </button>
        </div>
        <div className="sections">
          {SECTIONS.map((section) => (
            <Section
              key={`${stack.api_key}:${section.id}`}
              section={section}
              apiKey={stack.api_key}
              preview={preview}
              open={open.includes(section.id)}
              onToggle={() => toggle(section.id)}
            />
          ))}
        </div>

        <p className="panel-hint">
          Sections you open stay open for the next stack. Use <kbd>↑</kbd> <kbd>↓</kbd> to move
          between stacks, <kbd>Esc</kbd> to close.
        </p>
      </div>
    </aside>
  );
});

function Facts({ stack, currentUserUid }: { stack: Stack; currentUserUid: string | null }) {
  const [copied, setCopied] = useState(false);
  const created = formatDate(stack.created_at);
  const updated = formatAgo(stack.updated_at);
  const members = Array.isArray(stack.user_uids) ? stack.user_uids.length : null;
  const isOwner = !!currentUserUid && stack.owner_uid === currentUserUid;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stack.api_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked inside the iframe; the key is still selectable.
    }
  };

  return (
    <dl className="facts">
      {created && (
        <div>
          <dt>Created</dt>
          <dd>{created}</dd>
        </div>
      )}
      {updated && (
        <div>
          <dt>Settings changed</dt>
          <dd>{updated}</dd>
        </div>
      )}
      {members !== null && (
        <div>
          <dt>Members</dt>
          <dd>{members}</dd>
        </div>
      )}
      {stack.master_locale && (
        <div>
          <dt>Master locale</dt>
          <dd>{stack.master_locale}</dd>
        </div>
      )}
      {isOwner && (
        <div>
          <dt>Owner</dt>
          <dd>You</dd>
        </div>
      )}
      <div className="facts-wide">
        <dt>API key</dt>
        <dd className="facts-key">
          <code>{stack.api_key}</code>
          <button type="button" className="text-button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </dd>
      </div>
    </dl>
  );
}

type SectionState =
  | { status: "idle" }
  | { status: "loading"; previous?: Cached }
  | { status: "ready"; cached: Cached }
  | { status: "error"; message: string };

function Section({
  section,
  apiKey,
  preview,
  open,
  onToggle,
}: {
  section: SectionDef;
  apiKey: string;
  preview: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [state, setState] = useState<SectionState>(() => {
    const cached = readCached(apiKey, section.id);
    return cached ? { status: "ready", cached } : { status: "idle" };
  });
  const [reloadToken, setReloadToken] = useState(0);
  const bodyId = `section-${section.id}`;

  useEffect(() => {
    const force = reloadToken > 0;
    if (!open || (state.status !== "idle" && !force)) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setState((s) => ({ status: "loading", previous: s.status === "ready" ? s.cached : undefined }));
        loadSection(section, apiKey, preview, force).then(
          (cached) => !cancelled && setState({ status: "ready", cached }),
          (err: unknown) => !cancelled && setState({ status: "error", message: errorMessage(section, err) })
        );
      },
      force ? 0 : SETTLE_MS
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Re-run only when opened or refreshed; state changes come from this effect.
  }, [open, reloadToken]);

  const shown = state.status === "ready" ? state.cached : state.status === "loading" ? state.previous : undefined;

  return (
    <section className={open ? "section section--open" : "section"}>
      <button type="button" className="section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <svg className="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="section-title">{section.title}</span>
        <span className="section-teaser">
          {open
            ? null
            : shown
              ? teaser(shown.data)
              : state.status === "error"
                ? "Unavailable"
                : costLabel(section.requests)}
        </span>
      </button>

      {open && (
        <div className="section-body" id={bodyId} aria-live="polite" aria-busy={state.status === "loading"}>
          {state.status === "error" ? (
            <p className="section-note">{state.message}</p>
          ) : shown ? (
            <DetailView detail={shown.data} />
          ) : (
            <p className="section-note">Loading…</p>
          )}
          {(state.status === "ready" || state.status === "error") && (
            <div className="section-foot">
              {state.status === "ready" && <span>Fetched {formatAgo(state.cached.at)}</span>}
              <button type="button" className="text-button" onClick={() => setReloadToken((n) => n + 1)}>
                {state.status === "error" ? "Try again" : "Refresh"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DetailView({ detail }: { detail: Detail }) {
  const hasStats = !!detail.stats?.length;
  const hasItems = !!detail.items?.length;
  if (!hasStats && !hasItems) return <p className="section-note">{detail.empty ?? "Nothing here."}</p>;
  return (
    <>
      {hasStats && (
        <dl className="stats">
          {detail.stats!.map((s) => (
            <div key={s.label}>
              <dd>{s.value}</dd>
              <dt>{s.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {hasItems && (
        <ul className="items">
          {detail.items!.map((item, i) => (
            <li key={i} className={item.muted ? "item item--muted" : "item"}>
              <span className="item-label">{item.label}</span>
              {item.meta && <span className="item-meta">{item.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One-line summary shown on the collapsed header once a section has data. */
function teaser(detail: Detail): string {
  if (detail.stats?.length) return detail.stats.map((s) => s.value).join(" · ");
  if (detail.items) return detail.items.length ? String(detail.items.length) : "None";
  return "";
}

const costLabel = (n: number) => (n === 1 ? "1 request" : `${n} requests`);

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M9 3h4v4M13 3L7 9M11 9.5V13H3V5h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { ExternalIcon };
