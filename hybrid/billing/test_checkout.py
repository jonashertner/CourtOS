"""Actual Stripe SDK signature checking, fake transport, no Stripe network."""
from dataclasses import replace
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import time
import unittest

from billing.checkout import CheckoutService, CheckoutSettings
from billing.ledger import Ledger
from billing.tariffs import BillingError


class FakeStripe:
    def __init__(self):
        self.parameters = None
        self.key = None
        self.sessions = {}
        self.account_id = "acct_synthetic"
        self.retrievals = 0
        self.refunds = []
        self.disputes = []
        self.has_more = False
        self.payment = {"id": "pi_synthetic", "livemode": False, "currency": "chf", "status": "succeeded",
                        "amount_received": 2_000, "latest_charge": "ch_synthetic"}
        self.charge = {"id": "ch_synthetic", "payment_intent": "pi_synthetic", "livemode": False,
                       "currency": "chf", "paid": True, "captured": True, "amount_captured": 2_000,
                       "created": 1_791_629_000, "receipt_url": "https://pay.stripe.com/receipts/payment/synthetic"}

    def account(self): return {"id": self.account_id}

    def create_session(self, parameters, idempotency_key):
        self.parameters, self.key = parameters, idempotency_key
        session = {"id": "cs_test_synthetic", "url": "https://checkout.stripe.com/c/pay/synthetic", "livemode": False,
                   "client_reference_id": parameters["client_reference_id"], "amount_total": 2_000, "currency": "chf",
                   "payment_intent": "pi_synthetic", "payment_status": "paid", "mode": "payment", "status": "complete",
                   "automatic_tax": {"enabled": True, "status": "complete"},
                   "customer_details": {"address": {"country": "CH"}, "email": "not-for-dto@example.test"},
                   "total_details": {"amount_tax": 150, "amount_discount": 0, "amount_shipping": 0,
                                     "breakdown": {"taxes": [{"amount": 150, "rate": {"id": "txr_synthetic", "percentage": 8.1, "inclusive": True}}]}}}
        self.sessions[session["id"]] = session
        return dict(session)

    def retrieve_session(self, sid):
        self.retrievals += 1
        return dict(self.sessions[sid])

    def retrieve_payment_intent(self, _pi): return dict(self.payment)
    def retrieve_charge(self, _charge): return dict(self.charge)
    def retrieve_refund(self, rid): return dict(next(r for r in self.refunds if r["id"] == rid))
    def retrieve_dispute(self, did): return dict(next(d for d in self.disputes if d["id"] == did))
    def list_refunds(self, _pi): return {"data": self.refunds, "has_more": self.has_more}
    def list_disputes(self, _pi): return {"data": self.disputes, "has_more": False}


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.tmp.name) / "db.sqlite")
        self.transport = FakeStripe()
        self.cfg = CheckoutSettings(account_id="acct_synthetic", origin="https://court.example",
                                    webhook_secret="whsec_only_synthetic_fixture", enabled=True,
                                    tax_ready=True, product_tax_code="txcd_10000000")
        self.service = CheckoutService(self.ledger, self.cfg, self.transport)

    def tearDown(self): self.tmp.cleanup()

    def create(self):
        return self.service.create("user-a", "tenant-a", purchase_id="purchase-a", minor_amount=2_000)

    def event(self, *, timestamp=None, patch=None):
        data = {"id": "evt_synthetic", "object": "event", "type": "checkout.session.completed", "livemode": False,
                "data": {"object": {"id": "cs_test_synthetic"}}} | (patch or {})
        raw = json.dumps(data).encode()
        timestamp = int(time.time()) if timestamp is None else timestamp
        signature = hmac.new(self.cfg.webhook_secret.encode(), str(timestamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
        return raw, f"t={timestamp},v1={signature}"

    def test_default_and_live_gate_prevent_api_calls(self):
        for cfg, code in ((replace(self.cfg, enabled=False), "billing_disabled"), (replace(self.cfg, live=True), "live_checkout_not_activated"),
                          (replace(self.cfg, tax_ready=False), "tax_setup_not_reviewed")):
            service = CheckoutService(self.ledger, cfg, self.transport)
            with self.assertRaisesRegex(BillingError, code):
                service.create("a", "b", purchase_id="p", minor_amount=2_000)
        self.assertIsNone(self.transport.parameters)

    def test_checkout_prices_and_destination_owned_by_server(self):
        result = self.create()
        self.assertEqual(result["purchase_id"], "purchase-a")
        self.assertEqual(self.transport.parameters["line_items"][0]["price_data"]["unit_amount"], 2_000)
        self.assertEqual(self.transport.parameters["automatic_tax"], {"enabled": True})
        self.assertEqual(self.transport.parameters["line_items"][0]["price_data"]["tax_behavior"], "inclusive")
        self.assertEqual(self.transport.parameters["line_items"][0]["price_data"]["product_data"]["tax_code"], "txcd_10000000")
        self.assertEqual(self.transport.parameters["billing_address_collection"], "required")
        self.assertEqual(self.transport.key, "courtos-topup:purchase-a")
        self.assertNotIn("customer_email", self.transport.parameters)
        self.assertNotIn("metadata", self.transport.parameters)
        self.assertEqual(self.create(), result)
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_wrong_merchant_rejected_before_create(self):
        self.transport.account_id = "acct_other"
        with self.assertRaisesRegex(BillingError, "stripe_account_mismatch"): self.create()
        self.assertIsNone(self.transport.parameters)

    def test_real_sdk_signature_and_durable_duplicate_fulfillment(self):
        self.create(); event = self.event()
        self.assertTrue(self.service.webhook(*event)["credited"])
        self.assertFalse(self.service.webhook(*event)["credited"])
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 20_000_000)

    def test_signature_tampering_expiry_and_wrong_secret_no_retrieval(self):
        self.create(); raw, sig = self.event()
        for body, signature in ((raw + b" ", sig), self.event(timestamp=int(time.time()) - 301), (raw, "t=1,v1=bad")):
            with self.assertRaisesRegex(BillingError, "invalid_webhook_signature"):
                self.service.webhook(body, signature)
        self.assertEqual(self.transport.retrievals, 0)

    def test_webhook_does_not_trust_signed_event_amount_or_owner(self):
        self.create()
        event = self.event(patch={"data": {"object": {"id": "cs_test_synthetic", "amount_total": 999_999,
                                                    "metadata": {"owner": "user-b"}}}})
        self.service.webhook(*event)
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 20_000_000)
        self.assertEqual(self.ledger.balance("user-b", "tenant-a")["balance_micros"], 0)

    def test_unpaid_completion_waits_for_async_success(self):
        self.create(); self.transport.sessions["cs_test_synthetic"]["payment_status"] = "unpaid"
        self.assertFalse(self.service.webhook(*self.event())["credited"])
        self.transport.sessions["cs_test_synthetic"]["payment_status"] = "paid"
        event = self.event(patch={"id": "evt_async", "type": "checkout.session.async_payment_succeeded"})
        self.assertTrue(self.service.webhook(*event)["credited"])

    def test_retrieval_failure_not_acknowledged_and_can_retry(self):
        self.create(); stored = self.transport.sessions.pop("cs_test_synthetic")
        with self.assertRaisesRegex(BillingError, "stripe_unavailable"):
            self.service.webhook(*self.event())
        self.transport.sessions[stored["id"]] = stored
        self.assertTrue(self.service.webhook(*self.event())["credited"])

    def test_cross_account_and_live_event_rejected_before_retrieval(self):
        self.create()
        for patch in ({"account": "acct_other"}, {"livemode": True}):
            with self.assertRaises(BillingError): self.service.webhook(*self.event(patch=patch))
        self.assertEqual(self.transport.retrievals, 0)

    def test_unrelated_checkout_event_is_acknowledged_without_provider_retrieval(self):
        event = self.event(patch={"data": {"object": {"id": "cs_other_business"}}})
        self.assertEqual(self.service.webhook(*event), {"received": True, "credited": False})
        self.assertEqual(self.transport.retrievals, 0)

    def test_expired_session_retry_marks_existing_purchase_without_new_checkout(self):
        self.create()
        self.transport.sessions["cs_test_synthetic"]["status"] = "expired"
        self.transport.sessions["cs_test_synthetic"]["url"] = None
        with self.assertRaisesRegex(BillingError, "checkout_expired"):
            self.create()
        self.assertEqual(self.ledger.list_purchases("user-a", "tenant-a")[0]["state"], "expired")
        self.assertEqual(len(self.transport.sessions), 1)
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_expiry_event_retrieves_state_and_does_not_overwrite_a_paid_purchase(self):
        self.create(); self.service.webhook(*self.event())
        expired = self.event(patch={"id": "evt_expiry", "type": "checkout.session.expired"})
        self.service.webhook(*expired)
        self.assertEqual(self.ledger.list_purchases("user-a", "tenant-a")[0]["state"], "paid")

    def refund(self, amount=500, status="succeeded", rid="re_synthetic"):
        return {"id": rid, "payment_intent": "pi_synthetic", "currency": "chf", "amount": amount, "status": status}

    def dispute(self, amount=2_000, status="lost"):
        return {"id": "du_synthetic", "payment_intent": "pi_synthetic", "currency": "chf", "livemode": False,
                "amount": amount, "status": status}

    def test_incomplete_tax_or_missing_breakdown_cannot_credit(self):
        self.create()
        session = self.transport.sessions["cs_test_synthetic"]
        session["automatic_tax"]["status"] = "requires_location_inputs"
        with self.assertRaisesRegex(BillingError, "tax_calculation_incomplete"):
            self.service.webhook(*self.event())
        session["automatic_tax"]["status"] = "complete"
        session["total_details"].pop("breakdown")
        with self.assertRaisesRegex(BillingError, "tax_breakdown_missing"):
            self.service.webhook(*self.event())
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_foreign_location_uses_actual_provider_tax_not_swiss_rate(self):
        self.create(); session = self.transport.sessions["cs_test_synthetic"]
        session["customer_details"]["address"]["country"] = "DE"
        session["total_details"]["amount_tax"] = 319
        session["total_details"]["breakdown"]["taxes"] = [{"amount": 319, "rate": {"id": "txr_foreign", "percentage": 19, "inclusive": True}}]
        self.service.webhook(*self.event())
        receipt = self.service.receipts("user-a", "tenant-a")[0]
        self.assertEqual((receipt["gross_minor"], receipt["net_minor"], receipt["tax_minor"], receipt["tax_country"]), (2000, 1681, 319, "DE"))
        self.assertEqual(receipt["tax_breakdown"][0]["percentage"], "19")

    def test_receipts_are_owner_scoped_and_strip_customer_and_payment_details(self):
        self.create(); self.service.webhook(*self.event())
        receipts = self.service.receipts("user-a", "tenant-a")
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0]["receipt_url"], self.transport.charge["receipt_url"])
        self.assertEqual(self.service.receipts("user-b", "tenant-a"), [])
        self.assertEqual(self.service.receipts("user-a", "tenant-b"), [])
        for text in ["not-for-dto", "pi_synthetic", "acct_synthetic", "cs_test_synthetic"]:
            self.assertNotIn(text, json.dumps(receipts))

    def test_receipt_link_or_payment_binding_mismatch_does_not_credit(self):
        self.create(); self.transport.charge["receipt_url"] = "https://attacker.example/receipt"
        with self.assertRaisesRegex(BillingError, "invalid_receipt_url"):
            self.service.webhook(*self.event())
        self.transport.charge["receipt_url"] = None
        self.transport.charge["payment_intent"] = "pi_other"
        with self.assertRaisesRegex(BillingError, "payment_binding_mismatch"):
            self.service.webhook(*self.event())
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_refunded_before_completion_is_never_available_credit(self):
        self.create(); self.transport.refunds = [self.refund(2000)]
        self.assertTrue(self.service.webhook(*self.event())["credited"])
        balance = self.ledger.balance("user-a", "tenant-a")
        self.assertEqual(balance["available_micros"], 0)
        self.assertTrue(balance["blocked"])
        self.assertFalse(self.service.webhook(*self.event())["credited"])
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_incomplete_reconciliation_history_prevents_initial_credit(self):
        self.create(); self.transport.has_more = True
        with self.assertRaisesRegex(BillingError, "payment_history_incomplete"):
            self.service.webhook(*self.event())
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_refund_webhook_retrieves_current_state_and_never_trusts_event_amount(self):
        self.create(); self.service.webhook(*self.event())
        self.transport.refunds = [self.refund()]
        event = self.event(patch={"id": "evt_refund", "type": "refund.updated", "data": {"object": {"id": "re_synthetic", "amount": 2000}}})
        self.assertTrue(self.service.webhook(*event)["reconciled"])
        self.service.webhook(*event)
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 15_000_000)

    def test_pending_failed_refunds_do_not_reverse_and_cross_payment_list_fails_closed(self):
        self.create(); self.service.webhook(*self.event())
        self.transport.refunds = [self.refund(status="pending"), self.refund(status="failed", rid="re_failed")]
        self.service.reconcile("pi_synthetic")
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 20_000_000)
        self.transport.refunds[0]["payment_intent"] = "pi_foreign"
        with self.assertRaisesRegex(BillingError, "payment_binding_mismatch"):
            self.service.reconcile("pi_synthetic")

    def test_open_dispute_blocks_without_debit_and_lost_plus_refund_cannot_double_reverse(self):
        self.create(); self.service.webhook(*self.event())
        self.transport.disputes = [self.dispute(status="needs_response")]
        self.service.reconcile("pi_synthetic")
        balance = self.ledger.balance("user-a", "tenant-a")
        self.assertTrue(balance["blocked"]); self.assertEqual(balance["balance_micros"], 20_000_000)
        self.transport.disputes[0]["status"] = "lost"
        self.transport.refunds = [self.refund(500)]
        self.service.reconcile("pi_synthetic"); self.service.reconcile("pi_synthetic")
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)
        self.transport.disputes[0]["status"] = "won"
        self.transport.refunds = []
        self.service.reconcile("pi_synthetic")
        # Reinstatement needs explicit operator reconciliation; never an
        # automatic new credit from a delayed or changed dispute event.
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 0)

    def test_unknown_purchase_and_duplicate_rows_do_not_mutate_known_wallet(self):
        self.create(); self.service.webhook(*self.event())
        self.assertFalse(self.service.reconcile("pi_unknown"))
        self.transport.refunds = [self.refund(), self.refund()]
        with self.assertRaisesRegex(BillingError, "payment_history_incomplete"):
            self.service.reconcile("pi_synthetic")
        self.assertEqual(self.ledger.balance("user-a", "tenant-a")["balance_micros"], 20_000_000)


if __name__ == "__main__": unittest.main()
