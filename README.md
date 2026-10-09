# CourtOS

A practical workspace for judges and judicial clerks: understand a file, locate contradictions, identify the questions that matter, and prepare a draft that can be checked against its sources.

CourtOS is a fork of [MikeOSS](https://github.com/open-legal-products/mike), developed by Jonas Hertner in connection with [OpenCaseLaw](https://opencaselaw.ch). Mike's contributors built the underlying document workspace. CourtOS adds a Swiss judicial pilot profile and a deliberately separate hybrid analysis workflow. See the [upstream README](README.upstream.md) for the original project's features and documentation.

## Current pilot

The pilot runs on the operator's Hetzner VPS in Germany, reached through Cloudflare Access email-code authentication. Explicit self-registration mode creates a personal account on first entry; an installation remains closed by default unless its operator enables that mode. Use **synthetic test documents only**. A model running on that VPS is not a model running inside a court's network. Cloudflare handles the browser traffic, including documents and results displayed in the workspace.

- Personal email-code access, checked again by the application; separate application sessions.
- Document workspace, projects, source-linked drafting and three initial court workflows.
- A fixed local model for ordinary assistant work; titles are generated deterministically and automatic model-based memory curation is disabled. User-supplied provider keys and external connectors are disabled in the pilot profile.
- A guided synthetic case in `hybrid/`: local chronology, review of an exact public-source request, optional frontier analysis, and local synthesis. This is a separate application on the same origin, with separate storage. The ordinary workspace does not send its documents to that external-analysis channel.
- A concise German, French and Italian guide accompanies the pilot at `/guide/`.

The guided case uses a small reviewed source catalog. It is not yet a general OpenCaseLaw search integration. Outputs are drafts for human review; this pilot does not establish legal accuracy, institutional approval or readiness for confidential case files.

## Source and licence

CourtOS retains Mike's **AGPL-3.0-only** licence, notices and attribution. See [LICENSE](LICENSE). This repository is the source offer for the modified network application; operators must make the corresponding source of the version they actually run available to its users. This concerns software source, not users' case files.

The project is not an endorsement by a court or authority. The pilot comes first; institutional deployment decisions will follow measured user experience and the institution's own operational requirements.

## Development

Start with [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [deployment documentation](docs/deployment.md). Existing Mike development commands remain available. CourtOS's model, connector and managed-access restrictions are opt-in through the documented runtime and frontend build settings. CourtOS branding and navigation remain part of this fork when those restrictions are disabled.

See [CourtOS pilot operations](ops/courtos/README.md) for the additional boundaries and configuration. The upstream development Compose file contains demonstration credentials and must not be exposed as a production configuration.
