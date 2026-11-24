import ContentstackAppSdk from "@contentstack/app-sdk";
import { PREVIEW_STACKS } from "./previewStacks";

export interface Stack {
  uid: string;
  name: string;
  api_key: string;
  description?: string;
  org_uid?: string;
  /** Stack Color from Settings > Appearance, e.g. "#A8F0E6". Absent on older stacks. */
  color?: string;
  master_locale?: string;
  created_at?: string;
  updated_at?: string;
  owner_uid?: string;
  user_uids?: string[];
  [key: string]: unknown;
}

export interface LoadResult {
  orgName: string;
  stacks: Stack[];
  /** Base URL of the Contentstack app for this region, used for "Open" links. */
  appUrl: string | null;
  /** True when running outside Contentstack with sample data. */
  preview: boolean;
  currentUserUid: string | null;
}

type Sdk = Awaited<ReturnType<typeof ContentstackAppSdk.init>>;

/** Set once loadStacks() connects; per-stack detail requests go through it. */
let sdk: Sdk | null = null;

const INIT_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function cmaUrl(cmaBase: string | undefined, path: string): string {
  const base = (cmaBase || "https://api.contentstack.io").replace(/\/+$/, "");
  const withVersion = /\/v3$/.test(base) ? base : `${base}/v3`;
  return `${withVersion}${path}`;
}

export class ApiError extends Error {
  constructor(public status: number, statusText: string) {
    super(`The API returned ${status} ${statusText}.`);
  }
}

/** GET a CMA path (e.g. "/environments") in the context of one stack. */
export async function stackGet<T>(apiKey: string, path: string): Promise<T> {
  if (!sdk) throw new Error("Not connected to Contentstack.");
  const res = await sdk.api(cmaUrl(sdk.endpoints?.CMA, path), { headers: { api_key: apiKey } });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return (await res.json()) as T;
}

export async function loadStacks(): Promise<LoadResult> {
  // Opened directly in a browser (e.g. http://localhost:3000) rather than inside
  // Contentstack: there is no parent frame to talk to, so show sample data.
  if (window.self === window.top) {
    return {
      orgName: "Sample organization",
      stacks: PREVIEW_STACKS,
      appUrl: null,
      preview: true,
      currentUserUid: "bltpreviewuser",
    };
  }

  sdk = await withTimeout(
    ContentstackAppSdk.init(),
    INIT_TIMEOUT_MS,
    "Couldn’t connect to Contentstack. Open this app from your organization’s left navigation."
  );

  const org = sdk.location.GlobalFullPageLocation?.currentOrganization;
  if (!org?.uid) {
    throw new Error(
      "This app needs the Global Full Page location. Add it under UI Locations in Developer Hub, then reinstall."
    );
  }

  let stacks: Stack[];
  try {
    stacks = (await sdk.stack.getAllStacks({ orgUid: org.uid })) as unknown as Stack[];
  } catch {
    // Fall back to a direct CMA call proxied through the App SDK.
    const res = await sdk.api(cmaUrl(sdk.endpoints?.CMA, "/stacks"), {
      headers: { organization_uid: org.uid },
    });
    if (!res.ok) {
      throw new Error(`Couldn’t load stacks: the API returned ${res.status} ${res.statusText}.`);
    }
    const body = (await res.json()) as { stacks?: Stack[] };
    stacks = body.stacks ?? [];
  }

  // The stacks endpoint can include stacks shared from other orgs; keep this org's.
  stacks = stacks.filter((s) => !s.org_uid || s.org_uid === org.uid);

  return {
    orgName: org.name,
    stacks,
    appUrl: sdk.endpoints?.APP ?? null,
    preview: false,
    currentUserUid: sdk.currentUser?.uid ?? null,
  };
}

export function stackDashboardUrl(appUrl: string | null, apiKey: string): string | null {
  if (!appUrl) return null;
  return `${appUrl.replace(/\/+$/, "")}/#!/stack/${encodeURIComponent(apiKey)}/dashboard`;
}
