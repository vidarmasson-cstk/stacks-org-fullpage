# Stacks by color

A Contentstack Marketplace app for the **Global Full Page** (organization-level) UI location. It lists every stack in the current organization that the signed-in user can access and groups them by their **Stack Color** (Stack Settings › Appearance). Stacks on the default color are listed last.

Built with React, TypeScript, Vite and `@contentstack/app-sdk` 2.4.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Opened directly in a browser, the app shows sample stacks so you can work on the UI. Inside Contentstack it loads the real organization.

## Register the app in Developer Hub

1. In Developer Hub, create a new app with **Organization** as the app type.
2. Under **Hosting**, choose Custom Hosting and set the URL to `http://localhost:3000` while developing (or your Launch / static host URL later).
3. Under **UI Locations**, add the **Global Full Page** location. Leave Path empty (the app serves from `/`), give it a name such as "Stacks by color" and an SVG icon.
4. Install the app in your organization. It appears in the organization's left navigation.

No OAuth scopes are needed: the app reads stacks through the App SDK as the signed-in user.

## How stacks are fetched

`src/data.ts` calls `appSdk.stack.getAllStacks({ orgUid })` with the organization from `appSdk.location.GlobalFullPageLocation.currentOrganization`. If that call fails it falls back to `GET /v3/stacks` through `appSdk.api()` with the `organization_uid` header.

## How stacks are grouped

Each stack's Stack Color comes back as a top-level `color` hex string, for example `"color": "#A8F0E6"`. Stacks created before the setting existed have no `color` field; they're grouped with the default color `#DDE3EE`, which Contentstack stores when no color is picked. To list those older stacks separately under "No color set", set `DEFAULT_STACK_COLOR` to `null` in `src/stackColor.ts`.

Groups with a picked color come first, largest first, then the default group.

## Stack details

First paint makes one request: the stacks list. Click a stack to open its details panel. The top of the panel (created, settings changed, members, owner, API key) uses fields the list already returned. Everything else is in collapsed sections, defined in `src/details.ts`. Each section shows how many requests it costs and fetches only when opened.

- A section fetches 300 ms after it opens, so arrowing through stacks with sections open doesn't fire a request per stack.
- At most 3 requests run at once.
- Results are cached in memory and `sessionStorage` for 10 minutes. Each section has a Refresh button.
- The panel remembers which sections you keep open (`localStorage`) and opens them again for the next stack.
- 401/403 responses show "Your role in this stack can't see this" instead of an error.

With the panel open, ↑/↓ (or j/k) move between stacks and Esc closes it.

## Deploy

```bash
npm run build      # outputs dist/
```

Host `dist/` on Contentstack Launch or any static host, then update the hosting URL in Developer Hub.
