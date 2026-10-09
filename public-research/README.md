# Local public decision retrieval

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
  digits, underscore, dot, colon or hyphen, at most 240 characters. The passage
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
