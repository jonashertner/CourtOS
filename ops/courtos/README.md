# CourtOS pilot profile

This profile supports a bounded pilot with synthetic case files and public or lawfully usable, non-confidential literature excerpts. Real case files, personal data and confidential material are excluded. It is not a production court deployment recipe.

For parameterised build/install/run scripts, exact runtime/model provenance and separate service examples, see [the native deployment guide](native/README.md). These examples require operator configuration and are not an unattended installer.

## Runtime configuration

Backend:

- `COURTOS_PILOT_MODE=true`
- `COURTOS_PILOT_MODEL_ID=courtos-local`
- `COURTOS_PILOT_MODEL_NAME=gemma-4-12b-qat`
- `COURTOS_PILOT_MODEL_URL=http://127.0.0.1:18181/v1`
- `COURTOS_AUTH_MODE=cloudflare`
- `COURTOS_ACCESS_ISSUER`, `COURTOS_ACCESS_AUDIENCE`, `COURTOS_ACCESS_JWKS_FILE`: exact issuer/audience and an operator-refreshed local JWKS file.
- Default admission is closed: `COURTOS_ACCESS_EMAILS` contains the explicitly allowed addresses, and the Cloudflare policy must also admit them.
- Explicit self-registration: `COURTOS_ACCESS_SELF_REGISTRATION=true` is effective only with pilot mode enabled. It creates a personal account from a verified Access identity without a local invitation allowlist. Configure Cloudflare for email-code authentication of the intended public audience, not an unauthenticated bypass.
- `COURTOS_ACCESS_DENY_EMAILS`: comma-separated email addresses denied on every protected request, in either mode. A denied email overrides self-registration and allowlists. Deleting an account alone permits later re-registration; use a deny entry as well when access must remain revoked.
- `COURTOS_KNOWLEDGE_ENABLED=true` explicitly enables the optional knowledge/search path in pilot mode; default false. Its frontend counterpart is `NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED=true`. See the knowledge section below.
- `STREAM_FIRST_CHUNK_TIMEOUT_MS=600000`, `STREAM_CHUNK_TIMEOUT_MS=120000`: allow time for CPU inference.

Frontend build: `NEXT_PUBLIC_COURTOS_PILOT_MODE=true`, `NEXT_PUBLIC_COURTOS_AUTH_MODE=cloudflare`, and `NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION=true` only for an enabled self-registration deployment (default false). Rebuild after changing public flags. Set frontend/server Sentry disable flags and `NEXT_TELEMETRY_DISABLED=1`.

Keep Supabase Auth/Postgres/PostgREST and filesystem storage under the operator's control, with unique secrets and loopback-only listeners. The application processes must have outbound network access restricted to their local dependencies. Application-level model labels alone do not enforce that boundary. The local model is pinned and receives no cloud fallback.

`POST /auth/cloudflare` verifies the Access identity in middleware, then exchanges an internally generated one-time GoTrue link for Mike's HttpOnly session. For a newly created account, GoTrue returns the `signup` verification type; for an existing account it returns `magiclink`. The bridge accepts only those two server-returned types. The token is not emailed or returned to the browser. Protected API requests require Access again; a Supabase session for a different email is rejected. The public `GET /health` probe returns only service availability. The pilot disables alternate account authentication routes.

## Public-pilot capacity

In pilot mode, the ordinary workspace admits at most three model-starting requests per person and 30 globally per UTC calendar day, with one active/queued request per person and three globally. Started model requests count even if inference fails; rejected admissions and reconnects do not. Native requests have a 20-minute lifetime. Title generation is deterministic and automatic model-based memory curation is disabled in the pilot.

In self-registration mode, server-side copy-to-project, copy-to-version, edit resolution, workflow asset/add-on imports and persistent export jobs are disabled because they can write files outside upload reservations. The guarded upload-session path, source reading and direct downloads remain available.

The public upload boundary is 5 MiB per file, five files per batch, and cumulative reservations of 20 MiB per user and 500 MiB globally. Failed uploads and later deletion do not automatically refund that budget. Operator cleanup and a deliberate accounting reset are separate actions. This is an input-reservation budget, not a filesystem quota: derived PDF/text renditions and temporary processing files still need host capacity limits and monitoring. Native assistant quotas are fixed in the pilot code. Upload defaults are configured through `COURTOS_UPLOAD_MAX_FILE_BYTES=5242880`, `COURTOS_UPLOAD_MAX_BATCH_FILES=5`, `COURTOS_UPLOAD_USER_TOTAL_BYTES=20971520`, and `COURTOS_UPLOAD_GLOBAL_TOTAL_BYTES=524288000`; keep the UI notice aligned if these change. The older `UPLOAD_SESSION_MAX_FILE_BYTES` name is not read by this backend.

The independent guided app defaults to three local jobs per person and 30 globally per UTC day; chronology and synthesis share that local allowance. It separately allows one external job per person and ten globally. Its admitted jobs count even on failure; previews and rejected requests do not. Its `OCL_LOCAL_DAILY_USER_LIMIT`, `OCL_LOCAL_DAILY_GLOBAL_LIMIT`, `OCL_FRONTIER_DAILY_USER_LIMIT`, and `OCL_FRONTIER_DAILY_GLOBAL_LIMIT` settings accept non-negative integers; zero pauses admission. Keep displayed notices consistent with configured limits.

Existing databases require CourtOS migrations `20261009_04_courtos_native_quota.sql`, `20261009_05_courtos_upload_budget.sql`, and `20261009_06_courtos_upload_ledger_grants.sql`, in that order. Migration 06 removes direct reservation-ledger mutations from application roles; do not restore those grants for operational cleanup. The optional knowledge path also requires `20261009_07_courtos_knowledge.sql`. Fresh installations use the matching `backend/schema.sql`. Follow the migration ledger and backup procedure; do not apply the fresh-schema bootstrap to an existing database.

## Optional knowledge and public decisions

`/knowledge` offers two separate operations. Personal-library passage search accepts 1–20 explicitly selected documents and checks the requesting user's ownership before extraction and retrieval. PDF text and existing PDF renditions are supported; a scan without a usable text layer, missing rendition or exhausted index budget is reported as unreadable/partial. Limits are 200 pages, 250000 extracted characters and 500000 indexed passage bytes per file, 8 MiB indexed passage bytes per person and 64 MiB globally. Search itself does not call a model or consume a model-start allowance. The UI can prepare a visible private assistant draft with selected document/version references, without automatic submission or project copying. The assistant's `search_knowledge` tool remains scoped to its explicit document attachments.

Public-decision retrieval uses the separate [`public-research/`](../../public-research/README.md) service on loopback port 18184. Install and isolate that service separately; the native renderer does not provision it or distribute a corpus. The authenticated backend proxy accepts only the manually entered public query. It does not forward personal library IDs, document text, assistant history or provider credentials. This is a bounded lexical search of a public corpus, not the complete OpenCaseLaw MCP interface. Verify the corpus generation, original links and text extraction when relying on a result. Public-text offsets are not judicial paragraph numbers.

Enable the runtime and matching build flags only after migration 07 and the public sidecar are ready; changing an EnvironmentFile cannot alter compiled Next.js flags. No private knowledge-base content is passed to the independent hybrid gateway.

## Workflows

`workflows.json` is the initial German-language court-workflow catalog. `seed-workflows.sql` installs those three templates in a **separate CourtOS database after Mike's schema**. Existing personalised workflow copies remain independent. Do not apply this script to an unrelated installation.

## Guided hybrid case

`hybrid/` contains the separate Python application and external gateway. Only the latter has a frontier-provider credential. Its immutable, hashed public-source packets are explicitly reviewed, expire, and can be sent once. The application cannot substitute arbitrary document text into that catalog. Neither an ordinary chat history nor workspace documents are forwarded to this module.

A reverse proxy serves the workspace, `/hybrid/`, and `/guide/` on the same Access-protected origin. The hybrid module checks Access independently. `OCL_ACCESS_SELF_REGISTRATION=true` separately enables its first-login personal account creation; otherwise authorise each email in its own store. Disabling an existing hybrid account continues to block it. It currently has a fixed German synthetic dossier and a fixed public-source catalog, not dynamic corpus search.

## Validation before admitting test users

Verify a real code login, session identity binding, a complete local document task, exact-packet external approval, reload recovery, source navigation and export. Verify two users cannot read each other's private resources, all origin listeners remain private, and a probe inside the app's actual cgroup cannot reach the Internet. Check capacity and latency against the existing OpenCaseLaw service. Record observed results separately from future requirements.

The static Docker and Node distributions used in the initial pilot require explicit operator updates. A later institutional deployment should use its supported packaging and patch process.
