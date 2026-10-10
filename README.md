# CourtOS

A compact research window for OpenCaseLaw and a personal document library. Find a passage, inspect its source, copy a usable reference into your usual working tools, or prepare an explicit AI request from selected text.

CourtOS is a fork of [MikeOSS](https://github.com/open-legal-products/mike), developed by Jonas Hertner in connection with [OpenCaseLaw](https://opencaselaw.ch). Mike's contributors built the underlying document workspace. CourtOS adds an authenticated research surface, local search of personal source copies and a separate channel for explicitly approved external analysis. See the [upstream README](README.upstream.md) for the original project's features and documentation.

## Current pilot

The browser entry is `/research`. The header offers research, the personal library, the guide and account sign-out. Existing `/knowledge` links remain valid; `/` and `/pilot` lead to research when the knowledge feature is enabled. The inherited assistant and specialised workspaces remain reachable through their existing routes, without making users adopt them to research or copy a source.

The pilot runs on the operator's separate Switchboard Hetzner VPS in Germany, reached through Cloudflare Access email-code authentication. Explicit self-registration mode creates a personal account on first entry; an installation remains closed by default unless its operator enables that mode. Use **public sources, lawfully usable non-confidential literature excerpts and synthetic documents only**. Real case files, personal data and confidential material are excluded. A model running on that VPS is not a model running inside a court's network. Cloudflare handles browser traffic, including documents and results displayed in the application.

- **OpenCaseLaw:** explicitly submit public legal terms through `public-research/` to the existing OpenCaseLaw service, which can use external AI to analyse the query and rank results. The interface discloses this before searching. No personal library files, account identifiers or chat history accompany the query. Inspect the returned decision text and its original-source link; court, date and case identifiers remain metadata to check against the original. No corpus copy or CourtOS search process is installed on the OpenCaseLaw server.
- **Personal library:** explicitly select personal files and search extracted text locally. Each result identifies a fixed document version and PDF page. Unreadable, scanned or partly indexed material is reported. Upload and manage documents at `/library`; nothing is automatically shared with another user's library.
- **Continue in your own tools:** copy a passage with its source reference. The shared `/word/research` integration candidate adds explicit selection reading, insertion after the selection and **Im Browser öffnen** for more space. It still requires complete native Word acceptance; see [Word integration boundaries](docs/courtos-word-research.md).
- **Citation checking:** the clearly separate «Zitate prüfen ↗» link opens the [Citecheck browser application](https://jonashertner.github.io/citecheck/taskpane.html?lang=de), linked from the [official OpenCaseLaw page](https://opencaselaw.ch/citecheck/). The link transfers no document, selection or search query. Citecheck is not yet integrated into this research panel or its identity/session.
- **Local AI:** prepare a question with selected text for Gemma 4 on the CourtOS server. The editable draft stays in the same browser tab, is bound to the signed-in account, expires after thirty minutes and is not automatically sent. Existing document-selection requests can also reference library attachments without copying files into projects.
- **External AI:** the separate `/hybrid/` application uses the explicitly configured Claude Opus 5.5. It displays the exact request, provider and model; transmission requires a separate approval. Only the text placed in that request is sent. Links are references, not instructions to fetch their contents. There is no automatic private-library upload, anonymisation or cloud fallback. An answer can return as an editable local draft.
- **Bounded test operation:** model-start and upload limits are documented in [pilot operations](ops/courtos/README.md). User-supplied provider keys and external connectors are disabled. Titles are deterministic; automatic model-based memory curation is disabled. Some inherited workspace operations are deliberately unavailable in this pilot.
- **Guide:** a German, French and Italian guide is available at `/guide/`.

Search results and model answers are working materials. A missing result does not establish exhaustive research, and a matching citation does not establish substantive support. This pilot does not establish legal accuracy, institutional approval or readiness for confidential case files.

The current library stores uploaded copies on the CourtOS server. It does not read ordinary folders in place or maintain a case wiki beside local originals. A local filesystem companion and per-case memory beside untouched originals remain proposed next steps. The shared browser/Word research panel is implemented as a candidate; native host acceptance remains incomplete.

The concrete design, existing Citecheck/Word interfaces and acceptance boundaries are set out in [Local case work in Word and the browser](docs/architecture/local-case-memory.md).

The intended institutional path also includes claims, responses and exhibits. Confidential real case files require a suitable institution-controlled deployment or a verified, consistent anonymisation process across the complete set of documents before external processing. This pilot implements neither that approval nor automatic cross-document anonymisation; naming that future use does not change the present data limits.

## Source and licence

CourtOS retains Mike's **AGPL-3.0-only** licence, notices and attribution. See [LICENSE](LICENSE). This repository is the source offer for the modified network application; operators must make the corresponding source of the version they actually run available to its users. This concerns software source, not users' case files.

The project is not an endorsement by a court or authority. The pilot comes first; institutional deployment decisions will follow measured user experience and the institution's own operational requirements.

## Development

Start with [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [deployment documentation](docs/deployment.md). Existing Mike development commands remain available. CourtOS's model, connector and managed-access restrictions are opt-in through the documented runtime and frontend build settings. CourtOS branding and navigation remain part of this fork when those restrictions are disabled.

See [CourtOS pilot operations](ops/courtos/README.md) for the additional boundaries and configuration. The upstream development Compose file contains demonstration credentials and must not be exposed as a production configuration.
