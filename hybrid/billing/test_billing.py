"""Offline tests: synthetic identities, real SQLite transactions, zero APIs."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import replace
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from billing.ledger import Ledger
from billing.tariffs import BillingError, CONFIRMED_CHF_TARIFF as TARIFF, Usage, billing_enabled

OWNER, TENANT, ACCOUNT = "synthetic-a", "tenant-a", "acct_synthetic"
HASH = "a" * 64


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 1_000
        self.path = Path(self.tmp.name) / "billing.sqlite"
        self.ledger = Ledger(self.path, lambda: self.now)

    def tearDown(self):
        self.tmp.cleanup()

    def session(self, purchase="purchase-a", session="cs_synthetic_a", intent="pi_synthetic_a"):
        return {"id": session, "payment_intent": intent, "amount_total": 2_000,
                "currency": "chf", "client_reference_id": purchase, "mode": "payment",
                "payment_status": "paid", "status": "complete", "livemode": False}

    def purchase(self, purchase="purchase-a", session="cs_synthetic_a", owner=OWNER, tenant=TENANT):
        self.ledger.create_purchase(owner, tenant, purchase_id=purchase, minor_amount=2_000,
                                    stripe_account=ACCOUNT, live=False)
        self.ledger.bind_checkout(purchase, session)

    def fund(self):
        self.purchase()
        self.ledger.credit_verified_checkout(event_id="evt_a", account=ACCOUNT, live=False, session=self.session())

    def quote(self, packet="packet-a", inputs=1_000, outputs=1_600, tariff=TARIFF):
        return self.ledger.prepare_quote(OWNER, TENANT, packet_id=packet, payload_hash=HASH, tariff=tariff,
                                         input_token_allowance=inputs, max_output_tokens=outputs)

    def reserve(self, quote):
        return self.ledger.reserve(OWNER, TENANT, quote["id"], approved_hash=HASH,
                                   approved_ceiling=quote["ceiling"], approved_currency="chf")

    def settle(self, quote, usage=Usage(1_000, 200), **overrides):
        args = {"usage": usage, "response_model": TARIFF.model, "provider_message_id": "msg_a",
                "provider_request_id": "req_a", "result_hash": "b" * 64}
        args.update(overrides)
        return self.ledger.settle(OWNER, TENANT, quote["id"], **args)

    def test_checkout_admission_is_bounded_but_retry_keeps_same_purchase(self):
        for i in range(10):
            self.ledger.create_purchase(OWNER,TENANT,purchase_id=f"purchase-{i}",minor_amount=2000,stripe_account=ACCOUNT,live=False)
        self.ledger.create_purchase(OWNER,TENANT,purchase_id="purchase-0",minor_amount=2000,stripe_account=ACCOUNT,live=False)
        with self.assertRaisesRegex(BillingError,"checkout_rate_limited"):
            self.ledger.create_purchase(OWNER,TENANT,purchase_id="excess",minor_amount=2000,stripe_account=ACCOUNT,live=False)

    def test_blocked_wallet_cannot_create_new_checkout(self):
        self.fund()
        self.ledger.block_purchase("purchase-a")
        with self.assertRaisesRegex(BillingError,"wallet_blocked"):
            self.ledger.create_purchase(OWNER,TENANT,purchase_id="excess",minor_amount=2000,stripe_account=ACCOUNT,live=False)

    def test_activation_is_explicit_and_off_by_default(self):
        self.assertFalse(billing_enabled({}))
        self.assertFalse(billing_enabled({"BILLING_ENABLED": "TRUE"}))
        self.assertTrue(billing_enabled({"BILLING_ENABLED": "true"}))

    def test_actual_input_output_and_thinking_not_double_counted(self):
        usage = Usage.from_anthropic({"input_tokens": 1_000, "output_tokens": 200,
                                    "output_tokens_details": {"thinking_tokens": 170}})
        self.assertEqual(TARIFF.price(usage), 24_000)  # CHF 0.024, not CHF 0.03 per-call rounding.
        self.assertEqual(TARIFF.price(Usage(1, 0)), 12)

    def test_cache_categories_use_disclosed_flat_input_rate(self):
        self.assertEqual(TARIFF.price(Usage(100, 0, 200, 300)), 7_200)

    def test_missing_malformed_or_new_billable_usage_rejected(self):
        cases = [None, {}, {"input_tokens": 5}, {"input_tokens": True, "output_tokens": 1},
                 {"input_tokens": 1.1, "output_tokens": 1}, {"input_tokens": -1, "output_tokens": 1},
                 {"input_tokens": 1, "output_tokens": 1, "server_tool_use": {"web_search_requests": 1}},
                 {"input_tokens": 1, "output_tokens": 1, "service_tier": "priority"}]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(BillingError):
                Usage.from_anthropic(value)

    def test_arbitrary_topup_or_currency_or_rebound_owner_rejected(self):
        for value in (0, 1, 2_000.0, True, 10_000):
            with self.subTest(value=value), self.assertRaises(BillingError):
                self.ledger.create_purchase(OWNER, TENANT, purchase_id="p", minor_amount=value, stripe_account=ACCOUNT, live=False)
        self.purchase()
        with self.assertRaisesRegex(BillingError, "purchase_conflict"):
            self.ledger.create_purchase("other", TENANT, purchase_id="purchase-a", minor_amount=2_000, stripe_account=ACCOUNT, live=False)

    def test_duplicate_webhook_and_different_events_credit_once(self):
        self.fund()
        for event in ("evt_a", "evt_b"):
            self.assertFalse(self.ledger.credit_verified_checkout(event_id=event, account=ACCOUNT, live=False, session=self.session()))
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 20_000_000)

    def test_parallel_fulfillment_credits_once(self):
        self.purchase()
        barrier = threading.Barrier(8)
        def work(i):
            barrier.wait()
            return self.ledger.credit_verified_checkout(event_id="evt_" + str(i), account=ACCOUNT, live=False, session=self.session())
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(work, range(8))), 1)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 20_000_000)

    def test_unpaid_redirect_wrong_amount_owner_account_or_mode_cannot_credit(self):
        self.purchase()
        patches = [{"payment_status": "unpaid"}, {"payment_status": "no_payment_required"},
                   {"amount_total": 5_000}, {"currency": "eur"}, {"status": "open"},
                   {"client_reference_id": "forged-owner"}, {"livemode": True}, {"id": "cs_other"}]
        for patch in patches:
            with self.subTest(patch=patch), self.assertRaises(BillingError):
                self.ledger.credit_verified_checkout(event_id="evt_a", account=ACCOUNT, live=False, session=self.session() | patch)
        with self.assertRaises(BillingError):
            self.ledger.credit_verified_checkout(event_id="evt_a", account="acct_other", live=False, session=self.session())
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 0)

    def test_payment_intent_cannot_credit_second_purchase(self):
        self.fund()
        self.purchase("purchase-b", "cs_b")
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.credit_verified_checkout(event_id="evt_b", account=ACCOUNT, live=False,
                                                  session=self.session("purchase-b", "cs_b"))
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 20_000_000)

    def test_quote_owner_and_tenant_are_both_required(self):
        self.fund(); quote = self.quote()
        for owner, tenant in (("other", TENANT), (OWNER, "other")):
            with self.assertRaisesRegex(BillingError, "quote_not_found"):
                self.ledger.get_quote(owner, tenant, quote["id"])
            with self.assertRaisesRegex(BillingError, "quote_not_found"):
                self.ledger.reserve(owner, tenant, quote["id"], approved_hash=HASH,
                                    approved_ceiling=quote["ceiling"], approved_currency="chf")

    def test_tariff_snapshot_is_immutable_by_version(self):
        quote = self.quote()
        changed = replace(TARIFF, input_micros_per_million=20_000_000)
        with self.assertRaisesRegex(BillingError, "tariff_version_conflict"):
            self.quote("packet-b", tariff=changed)
        new = self.quote("packet-c", tariff=replace(changed, version="future-version"))
        self.assertNotEqual(new["tariff"], quote["tariff"])

    def test_approved_payload_ceiling_currency_cannot_change(self):
        self.fund(); quote = self.quote()
        for h, ceiling, cur in (("b" * 64, quote["ceiling"], "chf"), (HASH, quote["ceiling"] + 1, "chf"), (HASH, quote["ceiling"], "eur")):
            with self.assertRaisesRegex(BillingError, "approval_changed"):
                self.ledger.reserve(OWNER, TENANT, quote["id"], approved_hash=h, approved_ceiling=ceiling, approved_currency=cur)

    def test_expiry_and_no_credit_fail_before_dispatch(self):
        quote = self.quote()
        with self.assertRaisesRegex(BillingError, "insufficient_credit"):
            self.reserve(quote)
        self.fund(); self.now += 600
        with self.assertRaisesRegex(BillingError, "quote_expired"):
            self.reserve(quote)

    def test_real_parallel_reservations_cannot_overspend(self):
        self.fund()
        quotes = [self.quote("packet-" + str(i), inputs=1_000_000, outputs=100_000) for i in range(8)]  # CHF18 each.
        barrier = threading.Barrier(8)
        def work(q):
            barrier.wait()
            try:
                self.reserve(q); return True
            except BillingError as error:
                self.assertEqual(str(error), "insufficient_credit"); return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(work, quotes)), 1)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["held_micros"], 18_000_000)

    def test_reserve_retry_and_dispatch_claim_allow_one_network_attempt(self):
        self.fund(); quote = self.quote()
        self.reserve(quote); self.reserve(quote)
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: self.ledger.claim_dispatch(OWNER, TENANT, quote["id"]), range(6)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["held_micros"], quote["ceiling"])

    def test_settlement_bills_actual_and_releases_unused_reservation(self):
        self.fund(); quote = self.quote(); self.reserve(quote)
        self.ledger.claim_dispatch(OWNER, TENANT, quote["id"])
        result = self.settle(quote)
        self.assertEqual(result["charge"], 24_000)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["available_micros"], 19_976_000)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["held_micros"], 0)
        self.assertEqual(self.settle(quote)["charge"], 24_000)

    def test_settlement_replay_cannot_change_usage_model_or_result(self):
        self.fund(); quote = self.quote(); self.reserve(quote)
        self.ledger.claim_dispatch(OWNER, TENANT, quote["id"]); self.settle(quote)
        for extra in ({"usage": Usage(2, 3)}, {"result_hash": "c" * 64}, {"response_model": "other-model"}):
            with self.assertRaises(BillingError): self.settle(quote, **extra)

    def test_estimate_overrun_never_exceeds_customer_approved_maximum(self):
        self.fund(); quote = self.quote(); self.reserve(quote)
        self.ledger.claim_dispatch(OWNER, TENANT, quote["id"])
        result = self.settle(quote, Usage(1_000_000, 1_600))
        self.assertEqual(result["charge"], quote["ceiling"])
        self.assertGreater(result["measured_cost"], result["charge"])

    def test_failure_missing_usage_or_timeout_releases_without_later_debit(self):
        self.fund()
        for i, reason in enumerate(("before_dispatch", "provider_failure", "usage_missing", "outcome_unknown", "unusable_result")):
            quote = self.quote("packet-" + str(i)); self.reserve(quote)
            if reason != "before_dispatch": self.ledger.claim_dispatch(OWNER, TENANT, quote["id"])
            result = self.ledger.release_failed(OWNER, TENANT, quote["id"], reason=reason)
            self.assertEqual(result["charge"], 0)
            self.assertFalse(self.ledger.claim_dispatch(OWNER, TENANT, quote["id"]))
            with self.assertRaises(BillingError): self.settle(quote)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["available_micros"], 20_000_000)

    def test_restart_preserves_dispatch_no_automatic_retry(self):
        self.fund(); quote = self.quote(); self.reserve(quote)
        self.ledger.claim_dispatch(OWNER, TENANT, quote["id"])
        reopened = Ledger(self.path, lambda: self.now)
        self.assertFalse(reopened.claim_dispatch(OWNER, TENANT, quote["id"]))
        reopened.release_failed(OWNER, TENANT, quote["id"], reason="outcome_unknown")
        self.assertEqual(reopened.balance(OWNER, TENANT)["held_micros"], 0)

    def test_reversals_monotonic_no_duplicate_debit_and_block_new_calls(self):
        self.fund(); quote = self.quote(); self.reserve(quote)
        self.ledger.reverse_purchase("purchase-a", confirmed_total_minor=500)
        self.ledger.reverse_purchase("purchase-a", confirmed_total_minor=200)
        self.ledger.reverse_purchase("purchase-a", confirmed_total_minor=500)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 15_000_000)
        with self.assertRaisesRegex(BillingError, "wallet_blocked"):
            self.ledger.claim_dispatch(OWNER, TENANT, quote["id"])
        self.ledger.release_failed(OWNER, TENANT, quote["id"], reason="before_dispatch")
        self.ledger.reverse_purchase("purchase-a", confirmed_total_minor=2_000)
        self.assertEqual(self.ledger.balance(OWNER, TENANT)["balance_micros"], 0)

    def test_journal_is_append_only_and_db_private(self):
        self.fund()
        with closing(self.ledger.connect()) as db:
            with self.assertRaises(sqlite3.IntegrityError): db.execute("DELETE FROM journal")
            with self.assertRaises(sqlite3.IntegrityError): db.execute("UPDATE journal SET balance_delta=0")
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
