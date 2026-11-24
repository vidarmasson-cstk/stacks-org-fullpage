import type { Stack } from "./data";
import { resolveStackColor } from "./stackColor";

export interface ColorGroup {
  key: string;
  label: string;
  css: string | null;
  isDefault: boolean;
  isUncolored: boolean;
  stacks: Stack[];
}

const UNCOLORED_KEY = "__uncolored__";

const byName = (a: Stack, b: Stack) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/** Picked colors first (largest group first), then the default color, then stacks with none. */
const rank = (g: ColorGroup) => (g.isUncolored ? 2 : g.isDefault ? 1 : 0);

export function groupByColor(stacks: Stack[]): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();

  for (const stack of stacks) {
    const color = resolveStackColor(stack);
    const key = color?.key ?? UNCOLORED_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: color?.label ?? "No color set",
        css: color?.css ?? null,
        isDefault: color?.isDefault ?? false,
        isUncolored: !color,
        stacks: [],
      };
      groups.set(key, group);
    }
    group.stacks.push(stack);
  }

  return [...groups.values()]
    .map((g) => ({ ...g, stacks: [...g.stacks].sort(byName) }))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.stacks.length - a.stacks.length ||
        a.label.localeCompare(b.label)
    );
}

export function matchesQuery(stack: Stack, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [stack.name, stack.description, stack.api_key]
    .filter((v): v is string => typeof v === "string")
    .some((v) => v.toLowerCase().includes(q));
}
