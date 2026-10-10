# CourtOS Word startup candidate

**Local candidate. Not deployed; native authentication, selection and insertion are not yet accepted as working.**

The initial Word page must initialize Office before a user encounters a sign-in page. The previous manifest targeted `/word/research`, which redirects a fresh client to Cloudflare Access. That sign-in page has no Office.js and refuses framing. The application layout also defers its Word child until its own session is authenticated. This candidate moves only the inert Office startup surface ahead of authentication.

## Exact hosting boundary

`routes.json` is the complete proposed file-to-URL mapping. It is data for deployment review, not a Cloudflare configuration and not an installation script.

- Only the **12 listed exact `/word-bootstrap/…` files** may be public: startup and login HTML/JavaScript, shared styles, command initialization and icons.
- `/word-auth/complete.html` and `/word-auth/complete.js` **remain behind the existing Access policy**. They are deliberately absent from the public list.
- Every `/api/…`, `/word/research`, library, source, storage, model and ordinary application route keeps its current Access and backend authorization.
- Use exact Nginx `location = …` file aliases. Do not expose this directory through a general `/word-bootstrap/` alias: the source directory also contains protected completion files and these instructions.
- Any proposed Access exception must identify each public path exactly. Do not use `/word*`, `/word-bootstrap/*`, `/api/*`, an entire hostname, or an authentication-endpoint exception. This candidate does not configure such exceptions.
- Serve this pilot's static files with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Restrict scripts to self and the Office/MicrosoftAjax CDNs, auth connections to self, and block objects, base changes and form submissions. Native compatibility must be checked before claiming the CSP works in Word. Do not weaken the protected login's frame policy or impose untested iframe restrictions on Office. Office initialization uses Microsoft's hosted Office.js.

Both manifest entry locations target `/word-bootstrap/index.html`. Version `0.1.1.0` also points the base high-resolution icon to an actual 64×64 PNG; command icons retain their required 16/32/80 sizes. Existing 16/32/80 assets are copied unchanged; 64 is rendered from the existing CourtOS SVG. The local sideloaded manifest has not been replaced by this change.

## Login flow

1. Startup loads Office.js and calls `Office.onReady()` before any authentication or document action. It reads no Word text and makes no API request on load. Unsupported/unavailable Office leaves an explicit browser link.
2. **Anmelden** creates a cryptographically random 256-bit correlation state and opens `/word-bootstrap/login.html?state=…` with `displayDialogAsync`. The first dialog page is same-origin. The dialog is not an iframe. Hosts without origin-bearing dialog messages fail closed.
3. That minimal page initializes Office and navigates only to `/word-auth/complete.html?state=…`. Existing Cloudflare Access performs the user's email-code login before serving it. State contains no email, document text, token or session data. It is not authentication and cannot grant access.
4. **Zugang in Word bestätigen** calls the existing `POST /api/auth/cloudflare` without a body or client identity. The server derives identity from its verified Access assertion. The dialog then calls `GET /api/auth/session` and requires the same opaque user ID.
5. The dialog sends only `{ type, state, userId }` via `messageParent`, with an exact target origin. The pane requires the exact event origin, current random state and a valid opaque user ID. Old, malformed, missing-origin and mismatched messages do nothing.
6. After closing the dialog, the pane separately calls its own `GET /api/auth/session`. Only a session for that exact user permits navigation to `/word/research`. A manual close does not count as successful login, even if an old pane session exists.
7. If cookies were not retained in the pane, it stays on the bootstrap and offers **Im Browser öffnen**. It never copies cookies/tokens, creates a service-token bypass, uses localStorage/sessionStorage, or silently sends private data elsewhere. The browser link contains only the fixed `/research` destination; the browser authenticates independently.

API requests are same-origin, credentialed, `no-store`, refuse redirects, time out, require JSON, and accept only the expected user-ID field. Responses are read incrementally with an 8192-byte bound and cancelled on overflow; UTF-8 is decoded across chunk boundaries. Internal/network errors are never displayed. Office initialization and dialog opening have bounded waits; a late dialog callback cannot revive an expired attempt. No local model, frontier model or document API is called by these files.

## What still needs real host verification

The dialog's success does **not** prove that Access and application cookies are usable in the taskpane. This differs between Mac, Windows and Word on the web. The candidate intentionally stops if the pane cannot authenticate. If a supported host cannot retain the required cookies, a separately reviewed, request-bound authentication design is necessary; do not weaken Access or present a browser fallback as a successful Word release.

After deployment approval, verify exact public paths return their expected static MIME types without login and protected completion/API paths still require authentication. Then test native cold start with a synthetic document, actual email-code login, cancelled/expired login, account mismatch, session expiry/logout, selection-only reads, source insertion and the explicit browser link. Preserve all existing documents/add-ins. Do not clear the user's Office cache to hide an unresolved authentication problem.

Local test command:

```sh
npm test --prefix frontend -- src/app/lib/wordBootstrap.test.ts
```

Tests execute these actual static scripts with a mocked Office host and mocked HTTP. They cover no automatic reads/requests, explicit login, origin/state/owner binding, replay, closure, failed cookie transfer, unsupported hosts, timeouts and exact deployment mapping. They do not certify native Word.

## Primary references

- [Office initialization](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/initialize-add-in)
- [Office dialog authentication](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/auth-with-office-dialog-api)
- [Dialog messages and origin checks](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/dialog-api-in-office-add-ins)
- [Cloudflare authorization cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)
