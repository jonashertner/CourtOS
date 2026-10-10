# Native Linux pilot: build, configure and run

These are parameterised examples of the native CourtOS pilot arrangement. They
are corresponding build/run source, **not an unattended production installer**.
Use a fresh, dedicated Linux x86_64 host or review the isolation of a separate
installation. Do not run these examples over an existing CourtOS deployment.
Only synthetic case files and public or lawfully usable, non-confidential literature excerpts belong in this pilot. Real case files, personal data and confidential material are excluded. No live host, account allowlist,
Access audience, provider credential, database credential or private volume
identifier is distributed here.

The observed software and model versions are recorded in
[`provenance.json`](provenance.json). The model has its own upstream terms;
weights and third-party runtime binaries are not included in this repository.
This configuration is dated 9 October 2026. Pinning makes it reproducible; it
does not replace a supported update and vulnerability-management process.

## Files and boundaries

| File | Action |
| --- | --- |
| `fetch-runtime.py` | Download public Node, Docker and llama.cpp archives, check the recorded SHA-256, then extract; optionally fetch the pinned GGUF. |
| `build.sh` | Install JavaScript lockfiles, compile both apps, create a Python virtual environment from `hybrid/requirements.txt`. No services or database touched. |
| `operator.example.json` | Public placeholder configuration. Copy outside the repository and supply the operator's own values. |
| `configure.py` | Validate that configuration, generate new secrets and render environment files, systemd units and nginx configuration into a **new** private directory. |
| `install.py` | Create dedicated users/directories, install the rendered files and reload systemd definitions. Refuses existing configuration, state or units. Starts nothing. |
| `datastore.py` | Explicitly start fresh digest-pinned data containers, or apply the fresh database schema and workflow seed. Refuses to initialise an existing schema. |
| `refresh-access-jwks.py` | Fetch and validate public Access keys from the configured issuer; atomically replace only after validation. |

The backend, frontend, hybrid app, local model and private proxy have systemd
outbound-IP restrictions allowing loopback only. The gateway is a separate Unix
identity with the sole frontier credential, and calls a fixed provider URL with
validated public catalog content. Its service intentionally needs outbound
HTTPS; the host's egress policy must permit that destination and DNS. The tunnel
connector is separately operated and also needs its own outbound connectivity.

`IPAddressDeny` requires working cgroup/BPF support. Verify it inside the actual
service's cgroup. These units do not make a shared or hostile host safe by
assertion. The external gateway cannot read the hybrid dossier, app database or
CourtOS files; the backend has no gateway credential. The nginx example binds
only loopback; never expose the PostgREST/Auth listener as a public service.

The public origin routes `/` to CourtOS, `/hybrid/` to the independent guided
application, and `/guide/` to the three reviewed guides. Sessions/storage remain
separate. A CourtOS document is not copied into the guided application.

## 1. Prepare the host and a release

Install ordinary host dependencies using the distribution's maintained
packages: Python 3.12 with venv/pip, nginx, CA certificates, curl, tar/xz,
Git, a compiler toolchain required by native npm dependencies, and systemd.
LibreOffice is needed if you enable/test Office-to-PDF conversion; the initial
native pilot's verified upload was PDF. Install any additional converter
requirements described in the upstream deployment guide before offering those
formats. The model example reserves up to 16 GiB and six CPU cores; allow
separate capacity for the database, builds and applications.

Check out the exact CourtOS revision that you intend to run. Do not build with
production `.env` files in the checkout. In these commands, substitute your own
release and runtime paths; they must match `operator.json`:

For the reviewed Timeless typography, first follow the separately licensed
font step in [`frontend/scripts/FONTS.md`](../../../frontend/scripts/FONTS.md),
then run `python3 frontend/scripts/fetch-timeless-fonts.py --accept-license`
from the release checkout after accepting the publisher's terms. The fonts
must be present before building and deployed with the application. A checkout
without this step uses the bundled OFL fallbacks. The guide has its own
font preparation step in the guide README linked below.

```sh
python3 ops/courtos/native/fetch-runtime.py /opt/courtos-runtime \
  --model-file /srv/courtos-models/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf
ops/courtos/native/build.sh /srv/courtos/release \
  /opt/courtos-runtime/node-v22.23.3-linux-x64/bin /usr/bin/python3
```

The download command verifies the known archives rather than executing a remote
shell installer. The model is 6,716,356,800 bytes; omit `--model-file` if a
separately obtained file with the recorded hash is already installed. The
llama.cpp archive includes its companion libraries: preserve the extracted
`llama-b11429/` directory. `provenance.json` records both its source commit and
release archive hash. The launcher is configured offline, without a web UI,
agent, MCP proxy or prompt cache. Its stdout/stderr are disabled.

The build enables CourtOS's pilot UI and managed Access login. For a deliberately
self-registering installation, prefix the build command with
`NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION=true`; otherwise it defaults to
false. For the optional knowledge view, also prefix it with `NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED=true` and set `knowledge_enabled: true` in the operator configuration; both default to false. These build flags must match the backend settings described below. Frontend settings
are compiled in: changing only a runtime EnvironmentFile does not change them.
The reviewed guide files can be served directly; see
[`docs/guide/README.md`](../../../docs/guide/README.md) to rebuild them.

## 2. Configure identity and generate private configuration

Create an Access-protected public hostname for the **entire origin**, including
`/api/`, `/hybrid/` and `/guide/`. Enable the email-code identity provider and
configure the intended policy. Point a separately managed Cloudflare Tunnel at
`http://127.0.0.1:18189`. Do not open that listener to the Internet. Cloudflare
handles browser traffic, including documents/results; this is not court-local
processing.

Use the issuer and application audience from your own Access application, not
values copied from another operator. The backend verifies the signed
`Cf-Access-Jwt-Assertion`, including issuer, audience and expiry, rather than
trusting an email header. Official references:
[JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
and [email-code login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

Choose admission explicitly. `self_registration: false` is the default: supply
`allowed_emails` and the matching Cloudflare policy. For the email-code public
pilot, set `self_registration: true`, set `allowed_emails: []`, and build the
frontend with the matching flag above. Cloudflare must still authenticate the
email and issue a signed assertion; never use an Access bypass policy. The
backend accepts the self-registration flag only in pilot mode. `denied_emails`
always overrides admission and is checked on every protected request. Removing
an account without denying its email permits a fresh registration later.

The guided app has a separate `hybrid_self_registration` switch (default false),
rendered as `OCL_ACCESS_SELF_REGISTRATION`. In that mode its first verified
login creates an isolated personal account; disabled existing accounts remain
blocked. The two applications have separate account stores and quotas. The guided app
defaults to three local jobs per person and 30 globally per UTC calendar day,
shared by chronology and synthesis; its external step defaults to one per
person and ten globally. Set `OCL_LOCAL_DAILY_USER_LIMIT`,
`OCL_LOCAL_DAILY_GLOBAL_LIMIT`, `OCL_FRONTIER_DAILY_USER_LIMIT`, and
`OCL_FRONTIER_DAILY_GLOBAL_LIMIT` in the rendered `hybrid.env` if needed.
Admitted jobs count even if they fail; previews and rejected requests do not.
Zero pauses that category. Changing these limits requires updating the user
notice as well as the service configuration. For native assistant/upload
limits and migration requirements, see [the pilot profile](../README.md#public-pilot-capacity).

Copy `operator.example.json` outside the repository, edit all placeholders, and
review paths. A source checkout, private configuration directory and state
root must be separate. Paths with whitespace/parent traversal are deliberately
refused by this small renderer. The sample uses a unique `service_prefix` and
fixed loopback ports 18180–18182 and 18189–18195; review/change the templates if
your host already uses those ports. The installer refuses occupied ports, existing service identities, units or
state. A failure after installation has started requires manual inspection; it
does not roll back user creation or copied files.

```sh
python3 ops/courtos/native/configure.py /root/courtos-operator.json /root/courtos-rendered
sudo python3 ops/courtos/native/install.py /root/courtos-rendered
```

The output directory contains real newly generated secrets. Keep it root-only,
outside source control and backups without appropriate protection. Never paste
its files into issue reports. `install.py` installs EnvironmentFiles under a
root-only `private/` directory; systemd reads them before dropping privileges.
The packet HMAC file is readable only by the separate app/gateway shared group.
The generated long-lived internal role JWTs follow the initial stack's
arrangement and need an explicit rotation plan. Re-running the renderer to a
new directory generates **different** secrets; it is not an in-place rotation.

`external_enabled` defaults to false. To use the optional external step, set it
true in the operator configuration and put a dedicated provider key only into
the installed `private/gateway-provider.env`. Do not source another
application's environment or credential file. The key is never included in
backend, frontend or model settings. Keep all rendered files root-owned.

## Optional knowledge search: separate installation

`knowledge_enabled` is false by default. When true, the renderer sets backend
`COURTOS_KNOWLEDGE_ENABLED=true` and records the matching frontend build flag.
Build with `NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED=true`; the runtime file alone
cannot change a compiled browser application. The native application performs
private, user-scoped passage extraction and search in its own database. PDF
text or a completed PDF rendition is required; it does not add OCR silently.

For an existing database, follow the migration ledger through
`20261009_04_courtos_native_quota.sql`,
`20261009_05_courtos_upload_budget.sql`,
`20261009_06_courtos_upload_ledger_grants.sql`,
`20261009_07_courtos_knowledge.sql`, then
`20261009_08_courtos_native_ledger_grants.sql`, and reload PostgREST's schema cache.
Use backups and the repository migration procedure, not the fresh bootstrap.
The fresh `backend/schema.sql` includes those definitions. Migration 06 is
required even when knowledge search remains disabled. Migration 08 likewise
hardens the existing assistant quota ledger independently of knowledge search;
both ledger migrations retain reads and reserve/release RPCs while removing
direct service-role writes.

The public source class needs a **separate** installation of
[`public-research/`](../../../public-research/README.md), its Python virtual
environment and dedicated service identity. Its example unit and configuration
are in [`public-research/ops/`](../../../public-research/ops/). Adjust paths,
provide a read-only physical public OpenCaseLaw SQLite corpus, verify its source
and update procedure, and keep it inaccessible to writes by the service. The
corpus is not included or downloaded by this renderer. Keep the service bound to
`127.0.0.1:18184`; it is reached only through the authenticated native proxy, not
through a new tunnel route. The native build/install scripts do not start or
provision it. No private file, hybrid store or provider credential is needed.

Before enabling the view, check both private two-user isolation and a public
query/detail read, including incomplete extraction and a missing source. Record
the public corpus generation and source software revision alongside the running
release. Search does not invoke a model; a subsequent assistant question does
consume the ordinary model allowance. The public query is entered separately,
never filled from the private question or passages. Neither search path writes
private content into the guided hybrid catalog or gateway.

## 3. Start the reviewed components in order

Examples below use the sample prefix/paths; substitute the values you chose.
Review generated units and nginx syntax before starting. Release files and
virtual-environment executables must be readable/executable by their service
users. Keep the installed release immutable, owned by an administrator.

Run nginx validation as the proxy's service user, not as root. Even `nginx -t`
can create or change ownership of temporary directories. The generated `user`
directive also names that same service account and group. For a fresh install,
prepare the unit's dedicated runtime directory before checking the configuration:

```sh
sudo install -d -o courtos-pilot-proxy -g courtos-pilot-proxy -m 0755 /run/courtos-pilot-proxy
sudo -u courtos-pilot-proxy /usr/sbin/nginx -t -c /etc/courtos-pilot/public/nginx.conf
```

Use the same service-user validation before every later reload. It should pass
without repairing permissions as root after the check.

```sh
sudo systemctl enable --now courtos-pilot-containers.service
sudo python3 ops/courtos/native/datastore.py /etc/courtos-pilot start
sudo python3 ops/courtos/native/datastore.py /etc/courtos-pilot init-new-database
sudo systemctl start courtos-pilot-access-jwks.service
sudo systemctl enable --now courtos-pilot-access-jwks.timer
sudo systemctl enable --now courtos-pilot-proxy.service courtos-pilot-model.service
```

The database commands operate only on the dedicated daemon/socket and named
containers from your configuration. They use the pinned image digests, keep
Postgres/Auth/PostgREST listeners on loopback, apply `backend/schema.sql` only to
a fresh database, seed the included court workflows, and reload PostgREST's
schema cache. Existing databases use the upstream migration ledger instead.

If `hybrid_self_registration` is false, authorise each guided-app email in its
separate SQLite store, using the application identity. Skip the `allow-email`
command when self-registration is enabled. Do not create shared test accounts:

```sh
sudo runuser -u courtos-pilot-app -- \
  /srv/courtos/release/hybrid/.venv/bin/python /srv/courtos/release/hybrid/manage.py \
  --db /var/lib/courtos-pilot/hybrid/app.sqlite allow-email person@example.org --tenant pilot
sudo systemctl enable --now courtos-pilot-gateway.service courtos-pilot-hybrid.service
sudo systemctl enable --now courtos-pilot-backend.service courtos-pilot-frontend.service
```

The ordinary workspace establishes an HttpOnly application session from the
verified Access identity. New GoTrue accounts use its returned `signup` token;
existing accounts use `magiclink`. No additional email is sent by that internal
exchange. Both applications independently verify Access and their local
admission rules. Review the external provider's configured model and gateway
availability before enabling its UI.

## 4. Verify, publish source, and operate

Verify all public paths are gated, an admitted email-code login creates the
right personal workspace, and an unauthorised/mismatched identity fails. Test
two users through the actual application API for project, document and export
isolation. Confirm loopback binding with `ss`, and test that each local service
cannot reach a public IP from its own cgroup. Inspect the exact external packet
and ensure it excludes the local dossier, summaries and session history.

Run one synthetic PDF task, follow its references, reload the page, and check
that incomplete output is labelled. CPU jobs can take several minutes; the
pilot uses one shared model slot. The upstream automated database tests alone
do not prove a browser/Access deployment or every authorisation path.

Publish the exact modified source revision, these build/run files and retained
licence/credits, and make the in-app source link resolve to it. Record the
revision alongside deployed artifact hashes. Keep operator values, credentials,
case data, runtime SQLite files and test receipts out of that public source.

For updates, build a **new** release, review migrations/backups and unit path
changes, then deliberately switch the selected components. Do not run the
fresh installer over existing state. The static Node/Docker/llama.cpp binaries
and pinned container images do not update themselves. A code rollback does not
roll back database migrations. Back up and restore-test Postgres, filesystem
objects, the two hybrid SQLite databases, and protected configuration together.
Revoking Access is not deletion of stored drafts; define retention and account
removal separately.

For local renderer checks, run `python3 -m unittest discover -s ops/courtos/native -p "test_*.py"`. These tests do not start services or contact providers.

These generic examples were syntax/render tested locally. They describe the
observed pilot arrangement but have not themselves been executed as a fresh
production installation. Actual deployment checks and capacity remain the
operator's responsibility.
