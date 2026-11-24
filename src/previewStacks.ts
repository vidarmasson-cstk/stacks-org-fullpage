import type { Stack } from "./data";

/** Sample data shown only when the app is opened outside Contentstack. */
const sample = (
  name: string,
  color: string | null,
  description: string,
  master_locale = "en-us",
  created_at = "2025-03-14T09:12:00.000Z"
): Stack => {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10).padEnd(10, "x");
  const members = 1 + (name.length % 9);
  return {
    uid: `blt${id}uid`,
    api_key: `blt${id}key`,
    name,
    description,
    master_locale,
    created_at,
    updated_at: new Date(Date.now() - name.length * 5 * 86_400_000).toISOString(),
    owner_uid: name.length % 3 === 0 ? "bltpreviewuser" : "bltsomeoneelse",
    user_uids: Array.from({ length: members }, (_, i) => `bltuser${i}`),
    ...(color ? { color } : {}),
  };
};

export const PREVIEW_STACKS: Stack[] = [
  sample("US storefront", "#A8F0E6", "Product pages and campaigns for the US store", "en-us", "2024-02-01T10:00:00.000Z"),
  sample("EU storefront", "#A8F0E6", "Localized storefront for EU markets", "en-gb", "2024-04-18T10:00:00.000Z"),
  sample("APAC storefront", "#A8F0E6", "Storefront for Japan, Australia and Singapore", "ja-jp", "2025-01-09T10:00:00.000Z"),
  sample("Marketing website", "#8BC34A", "Corporate site, blog and landing pages", "en-us", "2023-11-02T10:00:00.000Z"),
  sample("Careers site", "#8BC34A", "Job listings and employer brand content", "en-us", "2024-07-22T10:00:00.000Z"),
  sample("Help center", "#DDE3EE", "Support articles and troubleshooting guides", "en-us", "2023-08-15T10:00:00.000Z"),
  sample("Mobile app", "#DDE3EE", "In-app messages, onboarding and release notes", "en-us", "2024-10-30T10:00:00.000Z"),
  sample("Partner portal", "#DDE3EE", "Enablement material for resellers", "en-us", "2025-05-12T10:00:00.000Z"),
  sample("Sandbox", null, "Scratch space for trying out content models", "en-us", "2025-09-01T10:00:00.000Z"),
  sample("Migration test", null, "", "en-us", "2025-10-20T10:00:00.000Z"),
];
