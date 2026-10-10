"""Checkout adapter. Live creation remains deliberately unavailable.

Only enable live checkout after the actual merchant account, tax treatment and
customer terms have been reviewed. Importing this module creates no products or Checkout sessions. Webhook destinations
and merchant receipt settings are configured separately; browser payment proofs
never grant credit.
"""
from dataclasses import dataclass
import json
import re
from typing import Any, Protocol
from urllib.parse import urlsplit

import stripe

from .ledger import Ledger, identifier
from .tariffs import BillingError, integer


class StripeTransport(Protocol):
    def account(self) -> dict[str, Any]: ...
    def create_session(self, parameters: dict[str, Any], idempotency_key: str) -> dict[str, Any]: ...
    def retrieve_session(self, session_id: str) -> dict[str, Any]: ...
    def retrieve_payment_intent(self, payment_intent: str) -> dict[str, Any]: ...
    def retrieve_charge(self, charge: str) -> dict[str, Any]: ...
    def retrieve_refund(self, refund: str) -> dict[str, Any]: ...
    def retrieve_dispute(self, dispute: str) -> dict[str, Any]: ...
    def list_refunds(self, payment_intent: str) -> dict[str, Any]: ...
    def list_disputes(self, payment_intent: str) -> dict[str, Any]: ...


class OfficialStripeTransport:
    """Explicit construction only; no import-time reads of keys or API calls."""
    def __init__(self, secret_key: str):
        self.client = stripe.StripeClient(
            secret_key, max_network_retries=1,
            http_client=stripe.RequestsClient(timeout=(5, 10)),
        )

    def account(self) -> dict[str, Any]:
        return self.client.raw_request("get", "/v1/account").to_dict()

    def create_session(self, parameters: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        return self.client.v1.checkout.sessions.create(parameters, {"idempotency_key": idempotency_key}).to_dict()

    def retrieve_session(self, session_id: str) -> dict[str, Any]:
        return self.client.v1.checkout.sessions.retrieve(session_id, {"expand": ["total_details.breakdown"]}).to_dict()

    def retrieve_payment_intent(self, payment_intent: str) -> dict[str, Any]:
        return self.client.v1.payment_intents.retrieve(payment_intent).to_dict()

    def retrieve_charge(self, charge: str) -> dict[str, Any]:
        return self.client.v1.charges.retrieve(charge).to_dict()

    def retrieve_refund(self, refund: str) -> dict[str, Any]:
        return self.client.v1.refunds.retrieve(refund).to_dict()

    def retrieve_dispute(self, dispute: str) -> dict[str, Any]:
        return self.client.v1.disputes.retrieve(dispute).to_dict()

    def list_refunds(self, payment_intent: str) -> dict[str, Any]:
        return self.client.v1.refunds.list({"payment_intent": payment_intent, "limit": 100}).to_dict()

    def list_disputes(self, payment_intent: str) -> dict[str, Any]:
        return self.client.v1.disputes.list({"payment_intent": payment_intent, "limit": 100}).to_dict()


@dataclass(frozen=True)
class CheckoutSettings:
    account_id: str
    origin: str
    webhook_secret: str
    enabled: bool = False
    live: bool = False
    tax_ready: bool = False
    product_tax_code: str = ""

    def __post_init__(self):
        identifier(self.account_id)
        if any(type(flag) is not bool for flag in (self.enabled, self.live, self.tax_ready)):
            raise BillingError("invalid_checkout_flag")
        url = urlsplit(self.origin)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
            raise BillingError("invalid_checkout_origin")
        if self.tax_ready and re.fullmatch(r"txcd_[0-9]{8}", self.product_tax_code) is None:
            raise BillingError("product_tax_code_required")


class CheckoutService:
    def __init__(self, ledger: Ledger, settings: CheckoutSettings, transport: StripeTransport):
        self.ledger, self.settings, self.transport = ledger, settings, transport

    def _ready(self) -> None:
        if not self.settings.enabled:
            raise BillingError("billing_disabled")
        # A future activation patch must deliberately remove this gate after
        # merchant/tax approval; a stray environment variable cannot charge.
        if self.settings.live:
            raise BillingError("live_checkout_not_activated")
        if not self.settings.tax_ready:
            raise BillingError("tax_setup_not_reviewed")

    def create(self, owner: str, tenant: str, *, purchase_id: str, minor_amount: int) -> dict[str, str]:
        """Owner/tenant come from the existing session+CSRF check, never JSON."""
        self._ready()
        cfg = self.settings
        try:
            account = self.transport.account()
        except Exception:
            raise BillingError("stripe_unavailable") from None
        if account.get("id") != cfg.account_id:
            raise BillingError("stripe_account_mismatch")
        purchase = self.ledger.create_purchase(owner, tenant, purchase_id=purchase_id,
                                              minor_amount=minor_amount, stripe_account=cfg.account_id, live=cfg.live)
        if purchase["session"]:
            try:
                session = self.transport.retrieve_session(purchase["session"])
            except Exception:
                raise BillingError("stripe_unavailable") from None
        else:
            # Server-owned prices and destinations; no quantity, currency,
            # return URL, owner, discount or reusable card instruction from JSON.
            parameters = {
                "mode": "payment", "payment_method_types": ["card"],
                # Address collection does not restrict the customer's country.
                # Stripe Tax uses the reviewed account registrations/product code.
                "automatic_tax": {"enabled": True}, "billing_address_collection": "required",
                "client_reference_id": purchase_id,
                "line_items": [{"price_data": {"currency": "chf", "unit_amount": minor_amount,
                                                "tax_behavior": "inclusive",
                                                "product_data": {"name": "CourtOS Rechercheguthaben", "tax_code": cfg.product_tax_code}}, "quantity": 1}],
                "success_url": cfg.origin + "/hybrid/?billing=return",
                "cancel_url": cfg.origin + "/hybrid/?billing=cancelled",
                "locale": "de",
            }
            try:
                session = self.transport.create_session(parameters, "courtos-topup:" + purchase_id)
            except Exception:
                raise BillingError("stripe_unavailable") from None
        session_id = identifier(session.get("id"))
        if session.get("livemode") is not cfg.live:
            raise BillingError("stripe_mode_mismatch")
        if session.get("client_reference_id") != purchase_id:
            raise BillingError("checkout_binding_conflict")
        if session.get("status") == "expired":
            self.ledger.mark_purchase_expired(purchase_id)
            raise BillingError("checkout_expired")
        url = urlsplit(session.get("url") or "")
        if url.scheme != "https" or url.hostname != "checkout.stripe.com" or url.username or url.password or url.port not in (None, 443):
            raise BillingError("invalid_checkout_url")
        self.ledger.bind_checkout(purchase_id, session_id)
        return {"purchase_id": purchase_id, "checkout_url": session["url"]}

    def _retrieve(self, operation, *args) -> dict[str, Any]:
        try:
            value = operation(*args)
        except Exception:
            raise BillingError("stripe_unavailable") from None
        if not isinstance(value, dict):
            raise BillingError("stripe_invalid_response")
        return value

    def _account(self) -> None:
        if self._retrieve(self.transport.account).get("id") != self.settings.account_id:
            raise BillingError("stripe_account_mismatch")

    def _payment(self, payment_intent: str, *, gross: int, currency: str) -> dict[str, Any]:
        value = self._retrieve(self.transport.retrieve_payment_intent, payment_intent)
        if (value.get("id") != payment_intent or value.get("livemode") is not self.settings.live
                or value.get("currency") != currency or value.get("status") != "succeeded"
                or integer(value.get("amount_received"), "invalid_paid_amount") != gross):
            raise BillingError("payment_binding_mismatch")
        return value

    def _receipt(self, session: dict[str, Any]) -> dict[str, Any]:
        automatic = session.get("automatic_tax")
        customer = session.get("customer_details")
        address = customer.get("address") if isinstance(customer, dict) else None
        country = address.get("country") if isinstance(address, dict) else None
        details = session.get("total_details") or {}
        if (not isinstance(automatic, dict) or automatic.get("enabled") is not True
                or automatic.get("status") != "complete" or not isinstance(country, str)
                or re.fullmatch(r"[A-Z]{2}", country) is None):
            raise BillingError("tax_calculation_incomplete")
        gross = integer(session.get("amount_total"), "invalid_paid_amount", minimum=1)
        tax = integer(details.get("amount_tax"), "invalid_tax_amount", maximum=gross)
        if details.get("amount_discount") != 0 or details.get("amount_shipping") != 0:
            raise BillingError("unexpected_checkout_adjustment")
        payment_intent = identifier(session.get("payment_intent"))
        payment = self._payment(payment_intent, gross=gross, currency=session.get("currency"))
        charge_id = identifier(payment.get("latest_charge"))
        charge = self._retrieve(self.transport.retrieve_charge, charge_id)
        if (charge.get("id") != charge_id or charge.get("payment_intent") != payment_intent
                or charge.get("livemode") is not self.settings.live or charge.get("currency") != session.get("currency")
                or charge.get("paid") is not True or charge.get("captured") is not True
                or integer(charge.get("amount_captured"), "invalid_paid_amount") != gross):
            raise BillingError("payment_binding_mismatch")
        receipt_url = charge.get("receipt_url")
        if receipt_url is not None:
            if not isinstance(receipt_url, str) or len(receipt_url) > 2048:
                raise BillingError("invalid_receipt_url")
            url = urlsplit(receipt_url)
            if (url.scheme != "https" or url.hostname != "pay.stripe.com" or not url.path.startswith("/receipts/")
                    or url.username or url.password or url.port not in (None, 443)):
                raise BillingError("invalid_receipt_url")
        breakdown = []
        taxes = (details.get("breakdown") or {}).get("taxes", [])
        if not isinstance(taxes, list) or len(taxes) > 20:
            raise BillingError("invalid_tax_breakdown")
        for item in taxes:
            if not isinstance(item, dict) or not isinstance(item.get("rate"), dict):
                raise BillingError("invalid_tax_breakdown")
            rate = item["rate"]
            percentage = str(rate.get("percentage"))
            if re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,4})?", percentage) is None:
                raise BillingError("invalid_tax_breakdown")
            breakdown.append({"amount_minor": integer(item.get("amount"), "invalid_tax_amount", maximum=gross),
                              "rate_id": identifier(rate.get("id")), "percentage": percentage,
                              "inclusive": rate.get("inclusive") is True})
        if sum(item["amount_minor"] for item in breakdown) != tax:
            raise BillingError("tax_breakdown_missing")
        return {"currency": session["currency"], "gross_minor": gross, "net_minor": gross - tax,
                "tax_minor": tax, "tax_country": country, "tax_status": "complete", "tax_breakdown": breakdown,
                "payment_created_at": integer(charge.get("created"), "invalid_payment_date", minimum=1),
                "receipt_url": receipt_url, "status": "paid"}

    def receipts(self, owner: str, tenant: str, *, limit: int = 20) -> list[dict[str, Any]]:
        """Authenticated caller supplies identity; never return the internal row."""
        result = []
        allowed = {"currency", "gross_minor", "net_minor", "tax_minor", "tax_country", "tax_status",
                   "tax_breakdown", "payment_created_at", "receipt_url", "status"}
        for row in self.ledger.list_purchases(owner, tenant, limit):
            if row["state"] != "paid":
                continue
            value = json.loads(row["receipt"]) if row.get("receipt") else {}
            result.append({"purchase_id": row["id"], "reversed_minor": row["reversed_minor"],
                           **{key: value[key] for key in allowed if key in value}})
        return result

    @staticmethod
    def _complete_list(page: dict[str, Any]) -> list[dict[str, Any]]:
        # Small fixed top-ups: oversized histories require operator reconciliation.
        # Never apply a partial sum or follow unbounded pagination.
        values = page.get("data")
        if page.get("has_more") is not False or not isinstance(values, list) or len(values) > 100:
            raise BillingError("payment_history_incomplete")
        if any(not isinstance(value, dict) for value in values):
            raise BillingError("payment_history_incomplete")
        ids = [identifier(value.get("id")) for value in values]
        if len(set(ids)) != len(ids):
            raise BillingError("payment_history_incomplete")
        return values

    def _loss_state(self, payment_intent: str, gross: int, currency: str) -> tuple[int, bool]:
        refunds = self._complete_list(self._retrieve(self.transport.list_refunds, payment_intent))
        disputes = self._complete_list(self._retrieve(self.transport.list_disputes, payment_intent))
        loss, blocked = 0, False
        for kind, values in (("refund", refunds), ("dispute", disputes)):
            for value in values:
                if value.get("payment_intent") != payment_intent or value.get("currency") != currency:
                    raise BillingError("payment_binding_mismatch")
                if kind == "dispute" and value.get("livemode") is not self.settings.live:
                    raise BillingError("stripe_mode_mismatch")
                amount = integer(value.get("amount"), "invalid_reversal", maximum=gross)
                status = value.get("status")
                permitted = ({"succeeded", "pending", "requires_action", "failed", "canceled"} if kind == "refund"
                             else {"warning_needs_response", "warning_under_review", "warning_closed", "needs_response", "under_review", "won", "lost"})
                if status not in permitted:
                    raise BillingError("payment_history_incomplete")
                if status == ("succeeded" if kind == "refund" else "lost"):
                    loss += amount
                if kind == "dispute" and status in {"needs_response", "under_review"}:
                    blocked = True
        return min(loss, gross), blocked

    def reconcile(self, payment_intent: str) -> bool:
        """Server-retrieved cumulative loss; no refund creation or event amounts."""
        self._ready()
        purchase = self.ledger.purchase_for_payment_intent(payment_intent)
        if purchase is None:
            return False
        if purchase["account"] != self.settings.account_id or bool(purchase["live"]) is not self.settings.live:
            raise BillingError("payment_binding_mismatch")
        self._account()
        self._payment(payment_intent, gross=purchase["minor_amount"], currency=purchase["currency"])
        loss, blocked = self._loss_state(payment_intent, purchase["minor_amount"], purchase["currency"])
        if blocked:
            self.ledger.block_purchase(purchase["id"])
        if loss:
            # A refund and chargeback can concern the same paid credit. Cap the
            # total reversal, rather than subtracting the same top-up twice.
            self.ledger.reverse_purchase(purchase["id"], confirmed_total_minor=loss)
        return True

    def _reconcile_event(self, kind: str, object_id: str) -> bool:
        getter = (self.transport.retrieve_dispute if kind.startswith("charge.dispute.") else
                  self.transport.retrieve_charge if kind == "charge.refunded" else self.transport.retrieve_refund)
        value = self._retrieve(getter, object_id)
        if value.get("id") != object_id:
            raise BillingError("payment_binding_mismatch")
        payment_intent = value.get("payment_intent")
        if payment_intent is None and kind.startswith("charge.dispute."):
            charge_id = identifier(value.get("charge"))
            charge = self._retrieve(self.transport.retrieve_charge, charge_id)
            if charge.get("id") != charge_id:
                raise BillingError("payment_binding_mismatch")
            payment_intent = charge.get("payment_intent")
        return self.reconcile(identifier(payment_intent))

    def webhook(self, raw_body: bytes, signature: str) -> dict[str, Any]:
        """Call before any JSON/body middleware; only this route bypasses CSRF.

        Caller maps unavailable retrieval/storage to non-2xx so Stripe retries.
        The returned dict is safe only after credit/dedup committed.
        """
        self._ready()
        if not self.settings.webhook_secret or len(raw_body) > 262_144:
            raise BillingError("invalid_webhook")
        try:
            event = stripe.Webhook.construct_event(raw_body, signature, self.settings.webhook_secret, tolerance=300).to_dict()
        except (ValueError, stripe.SignatureVerificationError):
            raise BillingError("invalid_webhook_signature") from None
        if event.get("livemode") is not self.settings.live:
            raise BillingError("stripe_mode_mismatch")
        if event.get("account") not in (None, self.settings.account_id):
            raise BillingError("stripe_account_mismatch")
        kind = event.get("type")
        if kind in {"refund.created", "refund.updated", "refund.failed", "charge.refunded", "charge.dispute.created",
                    "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"}:
            reconciled = self._reconcile_event(kind, identifier(event.get("data", {}).get("object", {}).get("id")))
            return {"received": True, "credited": False, "reconciled": reconciled}
        if kind not in {"checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"}:
            return {"received": True, "credited": False}
        session_id = identifier(event.get("data", {}).get("object", {}).get("id"))
        bound = self.ledger.purchase_for_session(session_id)
        if bound is None:
            # This merchant account can have other Checkout integrations.
            # Only sessions already bound by CourtOS may create CourtOS credit.
            return {"received": True, "credited": False}
        try:
            session = self.transport.retrieve_session(session_id)
        except Exception:
            raise BillingError("stripe_unavailable") from None
        if session.get("id") != session_id:
            raise BillingError("checkout_binding_conflict")
        if kind == "checkout.session.expired":
            if (session.get("client_reference_id") != bound["id"] or session.get("livemode") is not self.settings.live
                    or bound["account"] != self.settings.account_id):
                raise BillingError("checkout_binding_conflict")
            self._account()
            if session.get("status") == "expired":
                self.ledger.mark_purchase_expired(bound["id"])
            return {"received": True, "credited": False}
        if session.get("payment_status") == "unpaid":
            return {"received": True, "credited": False}  # Await async success.
        self._account()
        receipt = self._receipt(session)
        loss, blocked = self._loss_state(identifier(session.get("payment_intent")), receipt["gross_minor"], receipt["currency"])
        credited = self.ledger.credit_verified_checkout(
            event_id=identifier(event.get("id")), account=self.settings.account_id,
            live=self.settings.live, session=session, confirmed_loss_minor=loss, payment_blocked=blocked,
        )
        purchase_id = identifier(session.get("client_reference_id"))
        self.ledger.update_purchase_receipt(purchase_id, receipt)
        return {"received": True, "credited": credited}
