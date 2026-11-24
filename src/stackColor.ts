import type { Stack } from "./data";

/**
 * The color Contentstack applies when no Stack Color is picked. Newer stacks
 * store it in `color`; stacks created before the setting existed have no
 * `color` field at all. Those are grouped with this default. Set this to null
 * to list them separately under "No color set" instead.
 */
export const DEFAULT_STACK_COLOR: string | null = "#DDE3EE";

export interface ResolvedColor {
  /** Grouping key, case-insensitive. */
  key: string;
  /** Label for the group heading. */
  label: string;
  /** A valid CSS color for the rail, or null if the value isn't one. */
  css: string | null;
  isDefault: boolean;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function normalizeHex(value: string): string | null {
  const match = value.trim().match(HEX);
  if (!match) return null;
  const digits =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

const defaultKey = DEFAULT_STACK_COLOR
  ? (normalizeHex(DEFAULT_STACK_COLOR) ?? DEFAULT_STACK_COLOR).toLowerCase()
  : null;

/** Reads the stack's top-level `color` (e.g. "#A8F0E6"). */
export function resolveStackColor(stack: Stack): ResolvedColor | null {
  const stored = typeof stack.color === "string" ? stack.color.trim() : "";
  const value = stored || DEFAULT_STACK_COLOR;
  if (!value) return null;

  const hex = normalizeHex(value);
  const display = hex ?? value;
  const key = display.toLowerCase();
  const isDefault = key === defaultKey;
  const css = hex ?? (CSS.supports("color", value) ? value : null);

  return { key, label: isDefault ? `Default (${display})` : display, css, isDefault };
}
