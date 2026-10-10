# Formal citation checks

The pure Citecheck engine is pinned to commit
[`ae73c86e706f45c75f1e58561304dbea5ff4cbf9`](https://github.com/jonashertner/citecheck/tree/ae73c86e706f45c75f1e58561304dbea5ff4cbf9).
`vendor/PROVENANCE.json` records source hashes and the mechanical TypeScript
packaging changes. The MIT notice is retained. No checker rules were rewritten.
The original network/cache portion of `index.js` is deliberately excluded.

An operator provisions the pinned public list once:

```sh
python3 backend/scripts/fetch-citecheck-index.py --output /absolute/public-index-cache
```

Set `COURTOS_CITATION_INDEX_DIR` to that directory and give the backend account
read/traverse access. The compressed file is 16,389,394 bytes; its unpacked
buffer is 110,702,553 bytes. The runtime checks the exact compressed SHA-256,
compressed size and unpacked size before caching it in memory. The index loader
has no network path; the checker sends no private text, citation label or query
to a research or model service. PDF bytes use the existing authorised document
storage path. Missing or invalid
provisioning returns `citation_index_unavailable`; there is no network fallback.
Updating the list requires a reviewed manifest change and provisioning its file.
The result always identifies the actual list date/hash, so an older list is
not represented as current. SHA verification is integrity checking against this
pinned release, not an independent audit of corpus metadata.

`POST /knowledge/citations/check` accepts only `sources` containing 1–5 exact
personal-library PDF document/version IDs. Existing source admission verifies
ownership, original bytes and every extracted page within the aggregate limits
of 200 pages and 1 MiB (1,048,576 UTF-8 bytes), and 5 MiB per file.
More than 500 recognised references rejects the whole check. The model-backed
review keeps its separate original 40-page/10,000-byte context admission limits. It rechecks them before releasing findings.
The endpoint consumes no model-start quota, stores no new report and calls no
model. Authentication, trusted Origin, no-store responses and the knowledge
router's account rate limit apply; two checks can run concurrently.

Each finding includes the original PDF version/hash, page/hash, exact citation
wording and Unicode-codepoint offsets on that page. The adapter explicitly
converts the upstream parser's UTF-16 offsets. Status is only `found`, `differs`,
`missing` or `unchecked`. Missing means absent from this list; unchecked and
missing numbering remain unresolved. With multiple written pinpoints the
upstream engine checks the first. Images and unrecognised citation forms are
outside coverage. Neither a correct label nor a valid pinpoint verifies the
wording attributed to a decision or whether it supports a legal proposition.
Those separate result fields remain `not_checked` and `not_assessed`.

Tests use an explicitly synthetic index; no model or public endpoint is called.
