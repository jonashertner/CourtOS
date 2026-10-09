# CourtOS guided hybrid workflow

A bounded synthetic Swiss administrative-file exercise: understand the dossier, create a local chronology, select a public legal question, inspect the exact external request, optionally approve one frontier-model analysis, and prepare a local review note.

`backend.py` and `gateway.py` run under separate Unix identities. `data/demo.json` is fictional; `data/public-catalog.json` contains separately identified public-source excerpts and editorial context. Only the gateway receives a provider credential. Local app jobs and packets are scoped by user and tenant and recovered after a page reload.

The deployment must enforce the filesystem and network boundary described in `../ops/courtos/README.md`. This application is not a general mechanism for automatically anonymising or approving real court records for external transmission.
