# CourtOS research in Word

This is a bounded integration candidate, not a verified Word release. The browser
research app remains available at `/research`. The new `/word/research` route
uses the same authenticated layout, research component and backend. It loads
Office.js only for this route and exposes a selection-only Word adapter. The
separate manifest is `word-addin/manifest.courtos-research.xml`; it targets
`https://sandbox.swisslaw.io/word/research`. It does not replace the inherited
Mike manifest or task-pane chat application.

## Document access

Connecting checks Office readiness and WordApi 1.1; it reads no document text.
The interface must invoke `readSelection()` from an explicit action. This reads
only the current selection, preserves its text exactly and refuses empty or
overlong selections. There is no document-body fallback, event subscription,
background reading, document ID creation or automatic search/model request.

`insertTextAfterSelection(text)` inserts plain text at the current selection's
end. It never replaces the selected text, interprets HTML or changes Word's
tracking preference. The caller supplies the reviewed passage and its source
information. Operations are serialized by refusing overlapping actions; failed
insertions are never retried automatically because a missing acknowledgement
does not prove that Word made no change. Both operations refuse text over
12,000 UTF-16 code units instead of silently truncating it. The search UI applies
its own tighter query limit before offering a selection as search terms.

The manifest requests `ReadWriteDocument` to permit explicit insertion. This is
a host permission, not a technical guarantee that an add-in cannot read the
whole document. The adapter and regression tests enforce the narrower behaviour
of this CourtOS route. It does not import `useWordDoc` or `useWordAssistantChat`:
the inherited chat sends whole-document context on each new turn and exposes a
whole-document tool, so it is not used for this research path.

## More space in the browser

The Word header includes **Im Browser öffnen**. It uses Microsoft's
`Office.context.ui.openBrowserWindow` when the host declares
`OpenBrowserWindowApi 1.1`; otherwise it is a normal HTTPS link opening a new
browser tab. The destination is exactly the current origin's `/research`, with
no query, fragment, credentials or document text. This opens an external browser,
not an Office dialog. No resize or full-screen setting is imposed on the user.

The browser has its own login/session. The user's server-backed library becomes
available after signing into the same account. The current search, selection,
source dialog and unsent drafts stay in the Word pane; automatic task-state
synchronisation is not implemented. Private text must not be smuggled into a URL
or browser-storage workaround to make the transition appear seamless.

## Authentication and frontier boundary

No Access policy, backend identity check, cookie setting or framing header is
changed by this integration. Cloudflare Access still protects the pilot and the
backend still validates the signed Access identity. The existing add-in OAuth
handoff supports Google/Supabase; it does not establish a CourtOS email-code
session in the Office host.

The application login preserves an exact `/word/research` return target, including
when a Word-scoped library session expires. Only `/word/research` and `/research`
are accepted as CourtOS entry return targets; query strings, fragments and
external destinations are refused. This fixes application navigation; it does
not resolve or prove the host's Access-cookie behaviour.

Real Word tests must establish whether the protected task-pane page can load,
whether email-code authentication completes and whether subsequent API requests
retain both the Access cookie and the application session. Desktop Word on Mac,
desktop Word on Windows and Word on the web have different browser/storage
environments. A browser login alone is not acceptance evidence. Do not bypass
Access, put a service token in the manifest or weaken global cookie policy to
make a task pane appear to work.

The frontier workbench deliberately refuses embedding (`frame-ancestors 'none'`
and `X-Frame-Options: DENY`). Its current browser handoff uses sessionStorage;
Office dialogs do not share sessionStorage with the pane. A Word-to-frontier
handoff and return therefore require a separate, request-bound design and real
host testing. Do not claim the existing browser handoff works across Office
windows. Opening a source in an external browser must not include Word text in
the URL. No full-document transfer or pseudonymisation is implemented here.

Office.js can null `history.pushState` and `history.replaceState`. The route
saves the existing Next router methods before loading the script and restores
them if Office clears them. Host readiness and script-load waits are bounded;
failure leaves ordinary research available with a short status message.

## Release verification

Unit coverage checks inert connection, selection-only reads, exact text,
oversized/empty rejection, insertion with `End`, duplicate-action suppression,
uncertain failures without retry, redacted errors and history restoration.
These mocks do not certify Office compatibility.

Before sharing the manifest with test users, deploy and verify the dedicated
route and `word-assets`, then test authenticated sideloading with a synthetic
document in each supported Word host. Verify that opening the pane does not
read text, selection does not submit a search, inserting a source leaves the
selection intact, document protection fails safely, and logout blocks further
private queries. Verify the narrow pane and its navigation, including a return
from library management. Keep real case files outside this German VPS pilot.

## Primary implementation references

- [Microsoft: OpenBrowserWindowApi requirement set](https://learn.microsoft.com/en-us/office/dev/add-ins/reference/requirement-sets/open-browser-window-api-requirement-sets)
- [Microsoft: Word.Range](https://learn.microsoft.com/en-us/javascript/api/word/word.range?view=word-js-1.2)
- [Microsoft: Office dialog authentication](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/auth-with-office-dialog-api)
- [Microsoft: Office.js and framework history methods](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/connect-to-javascript-frameworks)
- [Cloudflare: Access authorization cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)

Documentation checked on 10 October 2026. This note records technical boundaries,
not approval for institutional or confidential processing.
