# Public decision retrieval

## Switchboard mode: existing public OpenCaseLaw service

`PUBLIC_RESEARCH_MODE=existing_opencaselaw` uses the already published public
service, with no change on the OpenCaseLaw server and no corpus copy. Use
`ops/config.existing-opencaselaw.env.example`. This mode is **AI-assisted**:
OpenCaseLaw can analyse queries and rerank hits with its own model providers.
The number of actual model calls is unknown (`model_calls:null`); CourtOS must
not call this a model-free or purely literal search. The UI discloses the external
processing before the user submits public terms. This source processing is
separate from CourtOS's explicit Gemma/Opus draft workflow.

Search is one MCP POST to the fixed `https://mcp.opencaselaw.ch/`, invoking only
`search_decisions` with the user's query (2–180 characters, at most eight terms), limit, chosen
exact filters, `fields:full` and `include_pinpoint:false`. The last setting skips
pinpoint enrichment, **not** AI query analysis or reranking. No private documents,
owner/account identifiers, cookies, history or provider credentials are sent.
Terms stay in the JSON body. OpenCaseLaw's own processing/retention applies;
CourtOS does not log query text. The JSON-RPC response ID must match exactly;
only its `structuredContent` is consumed. Bounded SSE parsing stops at that
completed result instead of waiting for connection closure. The existing plain
JSON tool wrapper is not used: its payload extraction is incompatible with the
current search handler's structured return. No automatic search, prefetch, retry or fallback.
The local `/health` checks configuration only (`upstream_checked:false`) and
does not contact the public service or trigger a model call.

Detail is one GET to the fixed `/api/decisions/{percentEncodedID}?full_text=true`.
That public endpoint also supports aliases; CourtOS rejects a response unless its
`decision_id` exactly equals the requested ID. The full public response is bounded
to 2 MiB before JSON parsing. Oversize, missing or explicitly withheld source text
fails as unavailable, never as a silently truncated complete decision. CourtOS
slices the supplied text locally into at most 6000 Unicode characters with
end-exclusive offsets. Missing provenance remains null; source warnings and
estimated dates are preserved. Original URLs are links only. Unknown fields,
generated rule statements and widget HTML are not forwarded.

Transport: 25-second total deadline including streaming, two concurrent requests,
300,000-byte search response cap, verified HTTPS, no environment proxy, redirects
or persistent cookies. Native backend deadline: 26 seconds; authenticated owner
checks, private-library boundaries and its 150,000-byte response cap remain.
Remote failures expose fixed error codes, never raw service messages. Test the
mode against the public service only with synthetic public terms before release;
mocked tests alone do not establish live availability.

## Deferred mode: separate official model-free API

This alternative is implemented locally but its upstream API is **not deployed**.
Do not activate it or represent it as available without a separately approved
OpenCaseLaw release.

Set `PUBLIC_RESEARCH_MODE=opencaselaw` using `ops/config.opencaselaw.env.example`.
This keeps the existing loopback contract at `127.0.0.1:18184` but reads from
the fixed HTTPS origin `https://mcp.opencaselaw.ch/api/research`. Switchboard
needs no decision database and no CourtOS process on the OpenCaseLaw host.
The upstream routes are an extension of the public OpenCaseLaw
service; verify they have been released before enabling this mode.

Search uses POST `/search`; selected public terms and exact filters travel only
in its JSON body. GET `/decisions/{id}?start=&length=` contains only the public
decision identifier and numeric text offsets. GET `/health` checks the upstream
capability. Only this explicit model-free API is allowed: ordinary OpenCaseLaw
MCP/REST search can run query expansion and AI reranking, so it is **not** a
fallback. Every successful upstream response must explicitly say
`model_calls:false`; search must report `query_mode:literal_terms`.

No keys, account identifiers, cookies, document text, history, source URLs or
arbitrary caller headers are forwarded. TLS verification stays enabled;
redirects and environment proxies are disabled. Source URLs remain links only.
There is no retry, persistent cookie jar, query cache or query log. Search and
detail metadata is explicitly selected, IDs are exact, filters are checked,
and Unicode passage bounds must be internally consistent. Missing metadata is
null; generation and source hashes are never invented. Results remain plain
text and are not certified quotations.

The official API ranks literal matches with global BM25, without AI reranking or
a preselected candidate window. Results are limited, not a complete search report.
If a later upstream version uses a bounded candidate window, the adapter preserves its
`ranking`, `candidate_limit` and `candidates_examined` fields after validation.
The UI discloses that window and does not claim these are the highest-ranked
matches across the whole corpus. `exhaustive` must remain false.

The adapter permits two concurrent requests, applies a 7-second total deadline
(including streaming), and refuses responses over 150,000 bytes. It maps failures
to the existing fixed public error codes without upstream details. The native
backend has a 26-second deadline shared with the existing-service mode and still
authenticates and rate-limits each owner before using loopback. The separate API
candidate sets a 6-second SQLite progress
deadline; this is not a hard filesystem-I/O latency guarantee.
Private library searches remain on CourtOS and never enter this adapter.

The existing systemd unit is intentionally local-only. For remote mode, the
operator must add explicit `IPAddressAllow` entries for the current verified
public API address(es) and necessary DNS resolver(s), retaining the deny default,
loopback bind, credential/path isolation and resource limits. Recheck those
entries when DNS changes; never silently fall back to the old host or a local DB.
The upstream service applies its own database and admission limits separately.

Sources checked: [official API documentation](https://mcp.opencaselaw.ch/api/docs),
[OpenCaseLaw source](https://github.com/jonashertner/opencaselaw/blob/main/mcp_server.py).

## Optional local-corpus mode

This independent CourtOS sidecar reads the existing public OpenCaseLaw SQLite
corpus. It does not import the production MCP application, call a model, rerank
with AI, expand queries externally, fetch URLs, or read provider credentials.
The native application must authenticate users before proxying requests to it.
Bind only to `127.0.0.1:18184`; do not expose this port through the tunnel.

## API

- `GET /health`: readiness, SQLite `user_version` as `database_generation`.
- `POST /search`: JSON `{ "query": "rechtliches Gehör Zustellung", "limit": 5 }`.
  Optional exact `court`, two-letter uppercase `canton`, and `language`
  (`de`, `fr`, `it`) filters. Queries: 2–180 characters, one to eight word/number
  terms, each at most 60 characters. Terms are quoted literally and combined
  with AND. FTS operators, wildcards and natural-language expansion are not
  supported. Limit 1–8; no exhaustive total or deep pagination. JSON body 4 KiB
  maximum; explicit Content-Length required.
- `GET /decisions/{decision_id}?start=0&length=4000`: exact canonical identifier
  only, not fuzzy docket or alias resolution. Identifiers contain ASCII letters,
  digits, spaces, underscore, dot, colon, literal `#` or hyphen, at most 240 characters.
  The identifier is encoded as one path segment (`#` becomes `%23`, never a URL fragment). The passage
  is bounded to 6000 Unicode characters, starting at a zero-based offset up to
  10 million. Its `end` is exclusive; `total_chars` and `has_more` permit another
  bounded request. Offsets are text positions, not judicial paragraph numbers
  or PDF pages. Check `content_hash`/`database_generation` when combining reads.

Search returns `results`, `query_mode`, `database_generation`, `limit`,
`exhaustive:false` and a notice. Each result contains `decision_id`, `court`,
`canton`, `docket_number`, `decision_date`, `language`, `title`, `source_url`,
`pdf_url`, `content_hash`, `scraped_at`, `snippet`, `snippet_truncated`.
The detail endpoint returns the same metadata and `passage` with `start`, `end`,
`text`, `total_chars`, `has_more`, `locator_kind`. Empty/unknown titles and URLs
can be null. Snippets are at most 1200 characters and are automatically shortened.
Neither snippets nor retrieved passages are an AI answer or proof that a source
supports a proposition.

Source links are exactly the stored URLs when syntactically valid HTTP(S),
without embedded credentials. No URL is fetched or reconstructed. This is not
an authority/domain allowlist or a link-availability check. Render every field
as text, never trusted HTML; permit only HTTP(S) links in the consuming UI.
The corpus can contain stale links, gaps or imperfect extraction. This first
path searches decisions only, not statutes, legal commentary or a live web index.

## Resource and data boundaries

SQLite opens a new `mode=ro` connection per request, sets `query_only`, disables
trusted schemas, limits each value to 16 MiB, and uses a 4 MiB page cache. The app
accepts at most two simultaneous DB operations. A SQLite progress handler stops
work after 1500 ms by default (operator maximum 2000 ms); lock wait is 100 ms. These
are operational bounds, not a hard filesystem-I/O latency guarantee. Broad
queries may return 503 asking for narrower terms. Capacity saturation returns 429.
Errors do not disclose database paths, SQL text or credentials.

Connections use normal SQLite locking, not `immutable=1`. Atomic replacement
of the public DB is visible on the next request; a response uses one read
transaction. Production inspection found a DELETE-journal database without WAL.
If the publisher changes journal strategy, verify read-only reader access to
journal side files before changing the deployment. Never grant the sidecar
write permission to the database or its parent directory.

No query log or cache is implemented. Run Uvicorn with `--no-access-log` as in
the unit. Upstream request logging and Cloudflare web traffic remain separate
operator responsibilities. Private library material is not an input to this
service: the authenticated UI must take an explicit public search query and
must not silently prefill it from documents or model prompts.

## Installation and verification

Use a separate service user, environment file and virtual environment. Templates
are in `ops/`; they contain no keys. Set `PUBLIC_RESEARCH_DB` to the physical
public SQLite file (or an appropriately managed read-only exposure). The user
needs read/traverse only. Do not import a production environment file. The unit
sets `ProtectSystem=strict`, hides existing production/pilot trees, denies
non-loopback networking, caps CPU at 100% and RAM at 512 MiB. The native proxy must
apply its own authenticated-user search rate limit and an approximately 3-second
HTTP deadline. Loopback is a deployment boundary, not user authentication.

A file bind mount pins an inode: if used, explicitly refresh it after a publisher
replaces the DB. Direct read-only access to its physical path avoids that stale
snapshot issue. No production code, database migration or database copy is
required. The service templates have not been installed by this component.

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
# For the isolated ASGI tests only:
.venv/bin/pip install httpx==0.28.1
.venv/bin/python -m unittest discover -s tests -v
```

Tests create a disposable synthetic SQLite FTS5 fixture. They cover actual FTS,
language/filter limits, literal operators, parameter binding, bounded passages,
unsafe URL rejection, read-only enforcement, atomic DB replacement, concurrency,
SQLite interruption and no outbound socket calls. No production data or model
provider is used by the test suite.
