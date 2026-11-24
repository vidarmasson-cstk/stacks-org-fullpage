import { ApiError, stackGet } from "./data";

/**
 * On-demand stack details. Nothing here runs on first paint: each section is
 * fetched only when the user opens it in the stack panel, then cached.
 */

export interface Detail {
  stats?: { label: string; value: string }[];
  items?: { label: string; meta?: string; muted?: boolean }[];
  /** Shown when there are no stats and no items. */
  empty?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  /** Number of CMA requests the section costs, shown to the user. */
  requests: number;
  load: (apiKey: string) => Promise<Detail>;
  /** Message for statuses that mean "not available here" rather than "broken". */
  unavailable?: Partial<Record<number, string>>;
}

type Named = { name?: string; uid?: string };

const count = (n: number | undefined) => (typeof n === "number" ? n.toLocaleString() : "–");

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

export function formatAgo(iso: string | number | undefined): string | null {
  if (iso === undefined) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const seconds = (ms - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relFmt.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const SECTIONS: SectionDef[] = [
  {
    id: "content",
    title: "Content model",
    requests: 2,
    async load(apiKey) {
      const [ct, gf] = await Promise.all([
        stackGet<{ count?: number }>(apiKey, "/content_types?include_count=true&limit=1"),
        stackGet<{ count?: number }>(apiKey, "/global_fields?include_count=true&limit=1"),
      ]);
      return {
        stats: [
          { label: "Content types", value: count(ct.count) },
          { label: "Global fields", value: count(gf.count) },
        ],
      };
    },
  },
  {
    id: "assets",
    title: "Assets",
    requests: 1,
    async load(apiKey) {
      const res = await stackGet<{ count?: number }>(apiKey, "/assets?include_count=true&limit=1");
      return { stats: [{ label: "Assets", value: count(res.count) }] };
    },
  },
  {
    id: "activity",
    title: "Recent publishing",
    requests: 1,
    async load(apiKey) {
      type QueueItem = {
        action?: string;
        entry?: { title?: string; content_type?: { title?: string } };
        asset?: { title?: string; filename?: string };
        environment?: unknown;
        created_at?: string;
        updated_at?: string;
      };
      const res = await stackGet<{ queue?: QueueItem[] }>(apiKey, "/publish-queue?limit=5");
      const queue = res.queue ?? [];
      return {
        items: queue.map((q) => ({
          label: q.entry?.title || q.asset?.title || q.asset?.filename || "Untitled",
          meta: [q.action, q.entry?.content_type?.title, formatAgo(q.updated_at ?? q.created_at)]
            .filter(Boolean)
            .join(" · "),
        })),
        empty: "Nothing has been published from this stack yet.",
      };
    },
  },
  {
    id: "environments",
    title: "Environments",
    requests: 1,
    async load(apiKey) {
      const res = await stackGet<{ environments?: Named[] }>(apiKey, "/environments");
      return {
        items: (res.environments ?? []).map((e) => ({ label: e.name ?? e.uid ?? "Unnamed" })),
        empty: "No environments.",
      };
    },
  },
  {
    id: "languages",
    title: "Languages",
    requests: 1,
    async load(apiKey) {
      type Locale = { code?: string; name?: string; fallback_locale?: string | null };
      const res = await stackGet<{ locales?: Locale[] }>(apiKey, "/locales");
      return {
        items: (res.locales ?? []).map((l) => ({
          label: l.name ?? l.code ?? "Unknown",
          meta: [l.code, l.fallback_locale ? `falls back to ${l.fallback_locale}` : null]
            .filter(Boolean)
            .join(" · "),
        })),
        empty: "No languages.",
      };
    },
  },
  {
    id: "branches",
    title: "Branches",
    requests: 1,
    unavailable: { 403: "Branches aren’t enabled on this stack.", 422: "Branches aren’t enabled on this stack." },
    async load(apiKey) {
      type Branch = { uid?: string; alias?: { uid?: string }[] };
      const res = await stackGet<{ branches?: Branch[] }>(apiKey, "/stacks/branches");
      return {
        items: (res.branches ?? []).map((b) => {
          const aliases = (b.alias ?? []).map((a) => a.uid).filter(Boolean);
          return { label: b.uid ?? "Unnamed", meta: aliases.length ? `alias: ${aliases.join(", ")}` : undefined };
        }),
        empty: "No branches.",
      };
    },
  },
  {
    id: "releases",
    title: "Releases",
    requests: 1,
    async load(apiKey) {
      type Release = { name?: string; items_count?: number; locked?: boolean };
      const res = await stackGet<{ releases?: Release[]; count?: number }>(
        apiKey,
        "/releases?include_count=true&limit=5"
      );
      const releases = res.releases ?? [];
      return {
        stats: [{ label: "Releases", value: count(res.count ?? releases.length) }],
        items: releases.map((r) => ({
          label: r.name ?? "Untitled",
          meta: [
            typeof r.items_count === "number" ? `${r.items_count} items` : null,
            r.locked ? "locked" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      };
    },
  },
  {
    id: "automation",
    title: "Workflows & webhooks",
    requests: 2,
    async load(apiKey) {
      type Toggle = Named & { enabled?: boolean; disabled?: boolean };
      const [wf, wh] = await Promise.all([
        stackGet<{ workflows?: Toggle[] }>(apiKey, "/workflows").catch(() => ({ workflows: undefined })),
        stackGet<{ webhooks?: Toggle[] }>(apiKey, "/webhooks"),
      ]);
      const items = [
        ...(wf.workflows ?? []).map((w) => ({
          label: w.name ?? "Workflow",
          meta: w.enabled === false ? "workflow · off" : "workflow",
          muted: w.enabled === false,
        })),
        ...(wh.webhooks ?? []).map((w) => ({
          label: w.name ?? "Webhook",
          meta: w.disabled ? "webhook · off" : "webhook",
          muted: !!w.disabled,
        })),
      ];
      return { items, empty: "No workflows or webhooks." };
    },
  },
  {
    id: "tokens",
    title: "Delivery tokens",
    requests: 1,
    async load(apiKey) {
      type Token = { name?: string; scope?: { environments?: Named[] }[] };
      const res = await stackGet<{ tokens?: Token[] }>(apiKey, "/stacks/delivery_tokens");
      // Only names and scopes are shown; token values never leave the response.
      return {
        items: (res.tokens ?? []).map((t) => ({
          label: t.name ?? "Unnamed token",
          meta: (t.scope ?? [])
            .flatMap((s) => s.environments ?? [])
            .map((e) => e.name ?? e.uid)
            .filter(Boolean)
            .join(", "),
        })),
        empty: "No delivery tokens. This stack isn’t serving content through the Delivery API.",
      };
    },
  },
];

export const TOTAL_REQUESTS = SECTIONS.reduce((n, s) => n + s.requests, 0);

/* Concurrency: at most a few CMA requests in flight, whatever the user clicks. */

const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  try {
    return await task();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/* Cache: memory first, then sessionStorage so a reload inside Contentstack doesn't refetch. */

const TTL_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = "stack-details:v1:";

export interface Cached {
  at: number;
  data: Detail;
}

const memory = new Map<string, Cached>();
const pending = new Map<string, Promise<Cached>>();

const cacheKey = (apiKey: string, sectionId: string) => `${apiKey}:${sectionId}`;

export function readCached(apiKey: string, sectionId: string): Cached | null {
  const key = cacheKey(apiKey, sectionId);
  let hit = memory.get(key) ?? null;
  if (!hit) {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
      if (raw) hit = JSON.parse(raw) as Cached;
    } catch {
      hit = null;
    }
  }
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  memory.set(key, hit);
  return hit;
}

export function loadSection(
  section: SectionDef,
  apiKey: string,
  preview: boolean,
  force = false
): Promise<Cached> {
  const key = cacheKey(apiKey, section.id);
  if (!force) {
    const hit = readCached(apiKey, section.id);
    if (hit) return Promise.resolve(hit);
  }
  const existing = pending.get(key);
  if (existing) return existing;

  const run = limited(() => (preview ? previewDetail(section, apiKey) : section.load(apiKey)))
    .then((data) => {
      const entry = { at: Date.now(), data };
      memory.set(key, entry);
      try {
        sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
      } catch {
        // Storage full or blocked; the memory cache still works.
      }
      return entry;
    })
    .finally(() => pending.delete(key));
  pending.set(key, run);
  return run;
}

export function errorMessage(section: SectionDef, err: unknown): string {
  if (err instanceof ApiError) {
    const special = section.unavailable?.[err.status];
    if (special) return special;
    if (err.status === 401 || err.status === 403) return "Your role in this stack can’t see this.";
    if (err.status === 429) return "Too many requests right now. Try again in a moment.";
  }
  return err instanceof Error ? err.message : String(err);
}

/* Which sections the user keeps open, remembered between stacks and visits. */

const OPEN_KEY = "stack-details:open";

export function readOpenSections(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeOpenSections(ids: string[]): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    // Not persisted; fine.
  }
}

/* Sample data for preview mode (opened outside Contentstack). */

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (max: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return Math.abs(h) % max;
  };
}

async function previewDetail(section: SectionDef, apiKey: string): Promise<Detail> {
  const rand = seeded(apiKey + section.id);
  await new Promise((r) => setTimeout(r, 300 + rand(500)));
  const ago = (maxHours: number) => formatAgo(Date.now() - rand(maxHours) * 3_600_000 - 60_000) ?? "";
  switch (section.id) {
    case "content":
      return {
        stats: [
          { label: "Content types", value: String(4 + rand(30)) },
          { label: "Global fields", value: String(rand(12)) },
        ],
      };
    case "assets":
      return { stats: [{ label: "Assets", value: (rand(9000) + 12).toLocaleString() }] };
    case "activity": {
      const n = rand(6);
      const titles = ["Home page", "Spring campaign", "Pricing", "About us", "Footer", "Hero banner"];
      return {
        items: Array.from({ length: n }, (_, i) => ({
          label: titles[(i + rand(6)) % titles.length],
          meta: `publish · Page · ${ago(24 * 30 * (i + 1))}`,
        })),
        empty: "Nothing has been published from this stack yet.",
      };
    }
    case "environments":
      return {
        items: ["development", "staging", "production"].slice(0, 1 + rand(3)).map((label) => ({ label })),
      };
    case "languages":
      return {
        items: [
          { label: "English - United States", meta: "en-us" },
          ...(rand(2) ? [{ label: "French - France", meta: "fr-fr · falls back to en-us" }] : []),
        ],
      };
    case "branches":
      if (rand(3) === 0) throw new ApiError(422, "Unprocessable Entity");
      return { items: [{ label: "main", meta: "alias: deploy" }, ...(rand(2) ? [{ label: "develop" }] : [])] };
    case "releases":
      return {
        stats: [{ label: "Releases", value: String(rand(4)) }],
        items: rand(2) ? [{ label: "Black Friday", meta: "12 items · locked" }] : [],
      };
    case "automation":
      return {
        items: [
          { label: "Editorial review", meta: "workflow" },
          { label: "Rebuild site", meta: rand(2) ? "webhook" : "webhook · off", muted: false },
        ].slice(0, rand(3)),
        empty: "No workflows or webhooks.",
      };
    case "tokens":
      return {
        items: rand(4) ? [{ label: "Website", meta: "production" }] : [],
        empty: "No delivery tokens. This stack isn’t serving content through the Delivery API.",
      };
    default:
      return {};
  }
}
