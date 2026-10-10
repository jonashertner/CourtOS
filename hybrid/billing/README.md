# Prepaid Frontier credit — integration and activation boundary

This module adds a gateway-owned CHF ledger to the reviewed Frontier flow. The
application retains authentication, tenant isolation, Origin/CSRF checks,
reviewed-packet limits and model admission limits. Only the gateway has the Stripe
and Anthropic credentials. Importing the package does not contact either service.

**Live Checkout is deliberately disabled in source.** Tests exercise real ASGI
routes, SQLite transactions and Stripe's signature verifier with synthetic
transports. They do not establish that the merchant's restricted key, Stripe Tax,
receipt or real Checkout return flow works. Do not advertise credit purchase until
those checks and the explicit live activation review are complete.

## Price and approval

The owner confirmed gross, VAT-inclusive CHF 20/50 top-ups and CHF 12 per million
input tokens / CHF 60 per million output tokens on 10 October 2026. The immutable
tariff version is `2026-10-10-chf-1` for `claude-opus-5-5`. All arithmetic uses
integer microCHF (CHF 1 = 1,000,000); no per-call rounding to whole cents.

Preparing a quote transmits nothing to the provider. Its input allowance is the
byte length of the full canonical UTF-8 request, including system text. One token
per byte is an engineering allowance, **not a proved tokenizer upper bound**.
The accepted money ceiling is contractual: actual reported usage is priced at the
saved tariff and the customer is charged the lesser of that amount and the
accepted maximum. The operator absorbs any excess. Output thinking tokens are
already part of the provider's `output_tokens` and are not counted twice. The
flat retail input rate applies to ordinary, cache-read and cache-creation input
categories; it is not a pass-through of the provider's different cache prices.
This endpoint requests no caching or provider tools.

The quote, owner, tenant, immutable packet, SHA-256, model, tariff and exact
accepted money/currency are bound together. An explicit refresh can replace an
expired unused quote ID; the old approval stays invalid. Submitted quotes cannot
renew. The browser must require renewed acceptance after every refresh/change.

## Application contract

The existing session and CSRF checks apply to every mutation below, except the
exact raw Stripe webhook route whose signature is checked separately.

- `GET /api/billing`: `{required,enabled,currency,balance_micros,held_micros,
  available_micros,blocked,tariff,topups_minor,purchases}`. Disabled mode returns
  `{required,enabled:false}`. Purchases are owner-scoped `{purchase_id,
  amount_minor,currency,status,reversed_minor,receipt}`; status can be `created`,
  `paid` or server-confirmed `expired`.
- `POST /api/billing/checkout`: `{purchase_id:<fresh UUID>,amount_minor:2000|5000}`
  returns a fixed Stripe Checkout URL and purchase ID. Repeated attempts retain
  the same UUID until paid or confirmed expired; the redirect itself never
  credits an account. At most ten new purchases per owner and one hundred globally
  are admitted in a rolling 24 hours; idempotent retries do not add purchases.
- `POST /api/packets/:id/quote`: `{hash}` returns `quote_id`, `currency`,
  `max_charge_micros`, `tariff_version`, ISO8601 `expires_at`,
  `input_allowance_tokens`, `max_output_tokens`, `vat_included:true`.
- `POST /api/packets/:id/send`: `{hash,billing:{quote_id,max_charge_micros,
  currency:"chf"}}`. The existing quota is admitted only after monetary funds are
  reserved. A quota rejection releases the reservation without a provider call.
- Successful `job.result.billing` gives actual `charged_micros`, the approved
  `reserved_micros`, `released_micros`, token categories, tariff version and
  `vat_included:true`. A failed job may have a separate `job.billing` with
  `status:"released"`, zero charge and the confirmed released hold. Absence of
  that field is not proof of a refund or debit.
- `POST /api/billing/webhook`: raw Stripe body, bounded to 256 KiB, forwarded only to
  the fixed loopback gateway endpoint. Configure the external reverse proxy and
  Cloudflare Access exemption for this **exact route only**. All other billing
  paths remain authenticated.

`workbench.billing` always states `{required,enabled}`. Required but unavailable
billing makes `frontier.ready=false` and rejects sends; it never falls back to a
free provider call. The legacy quota-only path requires the operator's explicit
isolated `BILLING_REQUIRED=false` / `BILLING_ENABLED=false` configuration.

## Ledger and recovery

Run exactly one gateway process against its private local SQLite file. `BEGIN
IMMEDIATE` serializes fund checks/reservations/settlement/reversals. The journal
is append-only. Quote dispatch is committed before the one provider attempt;
replays cannot start a second call. The complete usable result and its digest
commit with the debit. If the gateway reply is lost, the application can recover
that owner-bound result without another provider request. Approved public text
results remain subject to the operator's retention policy, like application jobs.

Provider failure, missing/unsupported usage, unknown outcome and unusable results
release the hold and never retrospectively debit the customer. On startup, before
accepting requests, the sole gateway releases interrupted holds from its former
process. Runtime recovery also releases holds older than quote expiry plus five
minutes, beyond the bounded ten-second queue and 155-second provider deadline.
Neither recovery path retries generation. Do not start a second gateway writer:
its startup recovery would conflict with the first process's live requests.

Stripe completion is verified by raw-body signature and then fresh server-side
retrieval of the stored Checkout/session/payment/charge binding. Current complete
refund/dispute state is reconciled **before** the initial credit becomes
spendable. Duplicates and out-of-order events cannot add credit. Confirmed refunds
or lost disputes cause a capped cumulative reversal; an open dispute freezes the
wallet. Won/reinstated disputes do not automatically unblock/re-credit: an
operator must reconcile that state deliberately. No refund, payout, dispute
response or merchant mutation is initiated by this code.

## Runtime configuration

Install the pinned dependencies with `python -m pip install -r hybrid/requirements.txt`.
Use the existing separate service identities and loopback bindings. Keep all keys,
merchant identifiers and tax/private address details outside the public repository.

Application and gateway:

```dotenv
BILLING_REQUIRED=true
BILLING_ENABLED=false
```

Gateway only (blank fields must be supplied by the operator):

```dotenv
BILLING_DB=/var/lib/courtos-gateway/billing.sqlite
STRIPE_EXPECTED_ACCOUNT=
STRIPE_LIVE_MODE=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_TAX_REVIEWED=false
STRIPE_PRODUCT_TAX_CODE=
APP_ORIGIN=https://your-courtos.example
```

`BILLING_ENABLED=true` additionally needs a reviewed tax configuration and a
successful expected-account check. `STRIPE_LIVE_MODE=true` still fails the source
activation gate. Test/live webhook secrets and keys are distinct. Permit gateway
HTTPS to the fixed Stripe API in addition to the fixed Anthropic API; do not grant
the application arbitrary external egress. Back up the ledger consistently with
its journal and protect it with the gateway account; never reset it to clear a
quota or user error.

## Stripe setup before activation

Use the intended merchant's own Stripe account. Required endpoints are one write
(`POST /v1/checkout/sessions`) and reads of Account, Checkout Sessions, Payment
Intents, Charges, Refunds and Disputes. Start with restricted permissions:
Checkout Sessions **Write**; Account, Payment Intents, Charges, Refunds and
Disputes **Read**; everything else **None**. Test the exact key in test mode.
Nested inline `price_data/product_data` and expanded tax rates may have additional
permission dependencies; investigate an actual 403 instead of granting broad
Products/Prices/Tax write permission. No Customer write, PaymentIntent write,
Refund write, transfer/payout or webhook-configuration permission is needed by
these implemented calls. SDK 16.0.0 pins API version `2026-09-30.endive`; use the
matching snapshot webhook shape and test it.

Configure Stripe Tax with the merchant's actual active registrations/effective
dates and reviewed service tax classification. Prices are inclusive, automatic
Tax is enabled, and billing address is required. Address collection **does not
restrict checkout to Switzerland**. Stripe calculates the retrieved tax amount
from configured registrations and customer location; the code does not apply an
invented 8.1% foreign rate. Confirm the jurisdiction policy before launch, including
whether foreign sales should be permitted. If a CH-only restriction is required,
this Checkout does not yet enforce it. Do not accept foreign payments and then
withhold credit as a substitute for an eligibility gate.

Review merchant details, VAT identifiers, receipt settings and the actual test
receipt. The app keeps an owner-scoped gross/net/tax breakdown and the retrieved
Stripe receipt URL, without storing the customer's address, email or card in its
ledger DTO. A Stripe charge receipt is not silently labelled an invoice; if a
formal invoice is needed, implement and test that separately. No invoice-creation
or invoice-write API has been enabled here.

Subscribe the exact webhook endpoint to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

Verify test-mode paid/unpaid/duplicate/expired/refund/dispute cases, account and
mode mismatch, invoice/receipt content and return-to-wallet behaviour. Only then
review the explicit source activation gate and production configuration.

## Verification and primary references

From `hybrid/`:

```sh
python -m unittest billing.test_billing billing.test_checkout billing.test_runtime -v
python -m unittest discover -s tests -v
```

The tests use synthetic identities, isolated SQLite and fake network transports.
They neither create Stripe products/sessions nor charge a card or invoke a model.

Primary documentation checked 10 October 2026:
[Stripe restricted keys](https://docs.stripe.com/keys/restricted-api-keys),
[Checkout creation](https://docs.stripe.com/api/checkout/sessions/create),
[fulfilment](https://docs.stripe.com/checkout/fulfillment),
[webhook signatures/retries](https://docs.stripe.com/webhooks),
[Stripe Tax with Checkout](https://docs.stripe.com/tax/checkout/page),
[receipts](https://docs.stripe.com/receipts),
[refunds](https://docs.stripe.com/api/refunds/list),
[disputes](https://docs.stripe.com/api/disputes/list),
[Opus 5.5 pricing](https://platform.claude.com/docs/en/models/opus-5-5/overview),
[thinking-token accounting](https://platform.claude.com/docs/en/build-with-claude/thinking).
