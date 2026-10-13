# Shared text projection kernel

`index.js` is the single authored, dependency-free runtime implementation used
by both the Node and browser adapters. `index.d.ts` declares its public API.
There is no manually maintained client copy of the matching algorithm.

The kernel validates reviewed mappings, detects ambiguity, replaces registered
terms consistently, retains private Unicode-codepoint span maps, and constructs
the exact neutral JSON packet. It does not perform I/O, hash, approve, persist,
or send anything. `TextEncoder` supplies the same UTF-8 byte bounds in both
runtimes. Hashing belongs to the adapters:

- `backend/src/lib/courtosPseudonymisation.ts` and `courtosExportProjection.ts`
  use synchronous Node SHA-256;
- `frontend/src/app/lib/deviceWorkspace/projection.ts` uses WebCrypto SHA-256.

Kernel results contain original source text and the private alias map under
explicitly private fields. **Only `outbound_json` is the proposed external
payload.** Never serialise the entire core or adapter result to a provider.
Unknown identifying details remain untouched, and every projection requires a
human to review the complete packet. Transformation is not proof of anonymity.

## Explicit V2 source context

`buildProjectionV2Core` and the adapters `buildExportProjectionV2` /
`buildDeviceExportProjectionV2` produce a packet with `version: 2`. Existing
unversioned V1 builders remain unchanged. A consumer must explicitly support
V2; it must not interpret an old `source` section as having reviewed document
attribution.

V2 source sections include packet-local document (`D1`), version (`V1`, scoped
to that document) and submitting-party (`P1`, or `null`) handles, an explicit
document role, and the original page number. Repeated passages from the same
document/version or same party share their handles. Conflicting roles, party
attribution, file hashes, page hashes or extractor identities for the same
source/version are rejected. No original filename, party label, source key,
path, hash or private mapping is copied into this metadata. The private section
retains those bindings needed to resolve its transformed quotation to the
original page and Unicode-codepoint offsets.

The document's submitting-party handle does not identify every actor mentioned
in its text. It is not automatically associated with a replacement such as
“Person A”. Different private party keys are never inferred to be the same
person. Any such association needs separate reviewed input. The device adapter
only folds case, Unicode composition and whitespace in its user-entered party
labels before assigning private keys; it does not guess procedural roles.

Working notes retain their author and status; conversation excerpts retain
their speaker and status. Neither is an original source, even when adopted or
linked to source references. At least one original source section is required.
All non-matching source characters, including amounts, dates, negation and
citations, are preserved. A registered alias can itself contain a date or
amount, so the human must still inspect every intended replacement.

Only selected text is exported. PDF binaries and hidden PDF properties are not
part of the packet; identifying details in extracted text may remain. The
12,000-byte final JSON cap is a prototype admission limit, not a comprehensive
case-analysis capability. No text is silently truncated to fit. The kernel
checks binding consistency, not the authenticity of a supplied source hash or
the semantic accuracy of a model's later answer.

An already occupied replacement label is rejected, including when it appears
only in another selected section or the question. For example, substituting
“Claire Aubert” with “Person A” is refused if the original text already refers
to “Person A”. Otherwise two different identities could be conflated.

The current alias matcher does not disambiguate occurrences from context. A
reviewed alias such as “Mai” may be a person's name in one occurrence and a
month in another. Register review alone does not establish that every match
should be replaced. Complete packet review remains mandatory. An occurrence
approval system, bound to original file/page hashes and offsets, is still
required before claiming reliable whole-document semantic preservation.

## Deterministic V2 answer binding

`bindProjectionV2Answer` (Node) and `bindDeviceProjectionV2Answer` (browser)
accept an untrusted structured answer, the prepared V2 projection, its original
question, trusted original selections and reviewed terms, expected matter ID /
revision / packet hash / map hash, and the caller's current matter ID/revision.
Both use `prepareProjectionV2AnswerBinding` in this package and validate every
SHA-256 check before releasing any result. The core's intermediate result and
hash-check text are private and must never be displayed as validated output or
sent to a model.

Each answer claim contains `text` and one to eight `citations`, each with a
`section_id` and `exact_quote`. It may separately include `context_references`
to working notes or conversation excerpts. Every primary citation must resolve
to a selected source section. Notes and chat cannot provide primary evidence,
even if adopted or previously marked source-bound. Missing, altered, ambiguous
or overlapping duplicate quotations fail closed. A malformed claim rejects the
whole answer; no partially checked assertion is returned.

The binder reconstructs the selected derivatives and private replacement maps,
checks packet and private-source consistency, and checks the actual packet,
map, original-text and derivative-text hashes. It resolves unique exact quotes
using Unicode-codepoint offsets. A quote intersecting a replacement is labelled
`pseudonymised_derivative` and carries its original quotation separately. When
a quote cuts through a replacement, its original range expands to include the
complete original term. It never calls transformed wording an original quote.

The bound citation retains the original document and version keys, file and
page hashes, page number, extractor and absolute original page offsets. These
are private lineage, not part of the outgoing V2 packet. The result explicitly
has `original_bytes_revalidated: false`. The caller must independently re-read
ownership/current revision and revalidate the actual original bytes before
publishing or adopting an answer; the pure binder performs no file, database or
network access. `selected` and `terms` must come from that trusted private
revision, not from a model answer or the candidate being checked.

`source_match: exact` establishes a textual match only. Every claim remains
`ai_draft_requires_review`: this check does not establish factual truth,
semantic support, negation, party attribution, legal applicability or complete
coverage. No model call, send approval, price approval or payment
acknowledgement is part of this API. V1 packet handling remains separate.

The browser and Node adapters must produce identical output bytes, hashes and
private spans. Frontend adapter parity tests import the Node adapter only in
test code and cover German, French, Italian, English, Unicode composition,
emoji, ambiguity and exact packet caps.

The backend Dockerfile copies this package to `/packages/courtos-projection`;
the frontend copies it to `/app/packages/courtos-projection` beside
`/app/frontend`, within the configured Turbopack root.
The frontend imports it through its declared `@courtos/projection` alias; the
backend's relative import resolves to the same package from both `src/lib`
and emitted `dist/lib`.

## V3: whole selected pages and occurrence decisions

V1 and V2 remain separate, unchanged wire contracts. `preparation.js` extends
this same shared kernel; it reuses its Unicode matcher rather than maintaining
a browser-specific replacement algorithm.

`inspectProjectionV3(input)` returns every registered alias occurrence, tied to
its original source section, codepoint span, entity revision and exact text.
`buildProjectionV3Core(input, decisions)` requires an explicit approve/exclude
decision for every occurrence. Excluded occurrences remain byte-for-byte
unchanged. Two approved overlapping identities fail; a shared name can instead
be assigned to one identity by excluding its other candidate. Occupied
replacement labels still fail across all selected sources and the question.
This makes `Mai` as a name separable from `Mai` as a month, without a language
blacklist or a claim of automatic disambiguation. The human still decides.

V3 accepts up to five PDFs, 200 original pages, 1 MiB of extracted source text
and 2,500,000 UTF-8 bytes in the final packet. Nothing is truncated. All PDF
pages are represented in coverage, including explicitly excluded pages. A
selected page without text refuses preparation; no OCR is available in this
path. Images, handwriting, reading-order accuracy and layout meaning are not
verified. The text-only outgoing packet never contains PDF binaries, hidden
PDF metadata, original filenames or local paths. Unregistered identifiers in
visible text can remain, so occurrence review is not anonymity certification.

Reviewed party records link a stable `P` handle to a specific private entity
revision and an explicit procedural role. The outgoing party register contains
only the reviewed replacement. Document role is separate: `submission` stays
`submission` if the user has not classified it more specifically. Page sections
share their submitting-party and document handles. PDF and public decision
sources are distinct types. A selected OpenCaseLaw passage carries an explicit
`complete_document: false`; its genuine ID/hash/URL/absolute offsets stay in
private `original_authority`. It never acquires a fabricated PDF hash or page.
Working notes and conversations remain attributed context, not evidence.

The browser adapter binds occurrence review to SHA-256 of the entire input and
candidate list, rechecks extracted page hashes, and commits the private
preparation using the existing matter CAS before exposing it to any sender.
Every later matter revision invalidates that copy for new use. The sender must
re-read it immediately before quote/send, revalidate original PDFs (including
exact re-extracted page text), and refresh public original passages. Only the
exact `outbound_json` is eligible for the separately approved request. Private
prepared snapshots and answer receipts are never model payloads.

`prepareProjectionV3AnswerBinding` uses the same source-match rules as V2 and
retains required stable claim IDs. It accepts an empty claim array to represent
no supported result; that is not a finding that no claims exist. The caller's
task validator supplies coverage and explains unresolved portions separately.
Every nonempty claim still requires at least one unique literal source quote.
The binder reconstructs reviewed occurrences, checks all saved source/map and
packet bindings, and checks actual hashes through Node/WebCrypto wrappers.
Public citations retain genuine original decision offsets and trusted URLs.
Notes and earlier assistant replies remain context-only. The result establishes
exact text matching, not entailment, factual truth or legal correctness.
