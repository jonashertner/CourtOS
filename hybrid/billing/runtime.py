"""Gateway-owned billing boundary. No customer input can select an identity/rate.

A single gateway process owns the ledger. Startup releases interrupted holds;
settled results commit with the debit so a lost HTTP reply can be recovered.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .ledger import Ledger
from .config import boolean_env
from .tariffs import BillingError, CONFIRMED_CHF_TARIFF, CONFIRMED_TOPUPS_MINOR, canonical, integer


@dataclass(frozen=True)
class BillingConfig:
    required: bool = True
    enabled: bool = False
    db: str = ""
    account_id: str = ""
    live: bool = False
    origin: str = ""
    secret_key: str = ""
    webhook_secret: str = ""
    tax_ready: bool = False
    product_tax_code: str = ""

    @classmethod
    def from_env(cls):
        return cls(required=boolean_env("BILLING_REQUIRED", default=True),
                   enabled=boolean_env("BILLING_ENABLED", default=False),
                   db=os.environ.get("BILLING_DB", ""),
                   account_id=os.environ.get("STRIPE_EXPECTED_ACCOUNT", ""),
                   live=boolean_env("STRIPE_LIVE_MODE", default=False),
                   origin=os.environ.get("APP_ORIGIN", ""),
                   secret_key=os.environ.get("STRIPE_SECRET_KEY", ""),
                   webhook_secret=os.environ.get("STRIPE_WEBHOOK_SECRET", ""),
                   tax_ready=boolean_env("STRIPE_TAX_REVIEWED", default=False),
                   product_tax_code=os.environ.get("STRIPE_PRODUCT_TAX_CODE", ""))


class BillingRuntime:
    def __init__(self, cfg: BillingConfig, ledger: Ledger | None = None, checkout=None):
        self.cfg, self.ledger, self.checkout = cfg, ledger, checkout
        self.tariff = CONFIRMED_CHF_TARIFF
        self._merchant_checked = False

    @classmethod
    def configured(cls, cfg: BillingConfig):
        if not cfg.enabled:
            return cls(cfg)
        if not all((cfg.db, cfg.account_id, cfg.origin, cfg.secret_key, cfg.webhook_secret)):
            return cls(cfg)  # Explicit fail closed, no free provider fallback.
        from .checkout import CheckoutService, CheckoutSettings, OfficialStripeTransport
        ledger = Ledger(Path(cfg.db))
        checkout = CheckoutService(ledger, CheckoutSettings(
            cfg.account_id, cfg.origin, cfg.webhook_secret, enabled=True, live=cfg.live,
            tax_ready=cfg.tax_ready, product_tax_code=cfg.product_tax_code),
            OfficialStripeTransport(cfg.secret_key))
        return cls(cfg, ledger, checkout)

    @property
    def ready(self) -> bool:
        if not self.cfg.enabled or not self.ledger or not self.checkout or not self._merchant_checked:
            return False
        try:
            self.checkout._ready()
            return True
        except BillingError:
            return False

    def require_ready(self):
        if not self.ready:
            raise BillingError("billing_unavailable")

    def startup(self):
        if self.ledger:
            self.ledger.recover_interrupted(startup=True)
        if self.cfg.enabled and self.checkout:
            try:
                self.checkout._ready()
                self.checkout._account()
                self._merchant_checked = True
            except BillingError:
                self._merchant_checked = False

    def status(self, owner: str, tenant: str):
        balance = {"currency": "chf", "balance_micros": 0, "held_micros": 0,
                   "available_micros": 0, "blocked": False}
        purchases = []
        if self.ledger:
            self.ledger.recover_interrupted()
            balance = self.ledger.balance(owner, tenant)
            purchases = [{"purchase_id": p["id"], "amount_minor": p["minor_amount"],
                          "currency": p["currency"], "status": p["state"],
                          "reversed_minor": p["reversed_minor"],
                          "receipt": json.loads(p["receipt"]) if p.get("receipt") else None}
                         for p in self.ledger.list_purchases(owner, tenant)]
        return {"required": self.cfg.required, "enabled": self.ready, **balance,
                "tariff": {**asdict(self.tariff), "vat_included": True},
                "topups_minor": list(CONFIRMED_TOPUPS_MINOR), "purchases": purchases}

    def quote(self, owner: str, tenant: str, data: dict):
        self.require_ready()
        if set(data) != {"packet_id", "hash", "payload"}:
            raise BillingError("invalid_quote")
        payload = data["payload"]
        raw = canonical(payload).encode()
        if (not isinstance(payload, dict) or payload.get("model") != self.tariff.model
                or type(payload.get("max_tokens")) is not int or payload["max_tokens"] != 1600
                or not 1 <= len(raw) <= 100_000
                or hashlib.sha256(raw).hexdigest() != data["hash"]):
            raise BillingError("invalid_quote")
        # Engineering allowance, not a claim about the provider's tokenizer.
        # Full serialized payload includes system, user content and envelope.
        # The accepted maximum is binding even if actual billed usage exceeds it.
        row = self.ledger.prepare_quote(owner, tenant, packet_id=data["packet_id"],
            payload_hash=data["hash"], tariff=self.tariff, input_token_allowance=len(raw),
            max_output_tokens=payload["max_tokens"])
        if row["state"] != "prepared":
            raise BillingError("quote_already_used")
        return {"quote_id": row["id"], "currency": row["currency"],
                "max_charge_micros": row["ceiling"], "tariff_version": self.tariff.version,
                "expires_at": datetime.fromtimestamp(row["expires"], timezone.utc).isoformat(),
                "input_allowance_tokens": len(raw), "max_output_tokens": payload["max_tokens"],
                "vat_included": True}

    def approve(self, owner: str, tenant: str, data: dict):
        self.require_ready()
        if set(data) != {"packet_id", "hash", "billing"} or not isinstance(data["billing"], dict):
            raise BillingError("invalid_approval")
        approval = data["billing"]
        if set(approval) != {"quote_id", "max_charge_micros", "currency"}:
            raise BillingError("invalid_approval")
        row = self.ledger.get_quote(owner, tenant, approval["quote_id"])
        if row["packet"] != data["packet_id"]:
            raise BillingError("approval_changed")
        return self.ledger.reserve(owner, tenant, row["id"], approved_hash=data["hash"],
            approved_ceiling=approval["max_charge_micros"], approved_currency=approval["currency"])

    @staticmethod
    def receipt(row):
        usage = json.loads(row["usage"])
        return {"currency": row["currency"], "charged_micros": row["charge"],
                "reserved_micros": row["ceiling"], "released_micros": row["ceiling"] - row["charge"],
                "tariff_version": json.loads(row["tariff"])["version"], **usage, "vat_included": True}

    def outcome(self, owner: str, tenant: str, packet_id: str):
        if not self.ledger:
            raise BillingError("billing_unavailable")
        row = self.ledger.packet_outcome(owner, tenant, packet_id)
        if not row:
            raise BillingError("quote_not_found")
        result = {"state": row["state"]}
        if row["state"] == "settled" and row["result"]:
            result["result"] = json.loads(row["result"]) | {"billing": self.receipt(row)}
        elif row["state"] == "released":
            result["billing"] = {"currency": row["currency"], "status": "released", "charged_micros": 0, "vat_included": True,
                "reserved_micros": row["ceiling"], "released_micros": row["ceiling"]}
        return result

    def command(self, owner: str, tenant: str, action: str, data: dict):
        if action == "status" and not data:
            return self.status(owner, tenant)
        if action == "quote":
            return self.quote(owner, tenant, data)
        if action == "reserve":
            row = self.approve(owner, tenant, data)
            if row["state"] != "reserved":
                raise BillingError("quote_already_used")
            return {"reserved": True}
        if action == "release" and set(data) == {"quote_id"}:
            if not self.ledger:
                raise BillingError("billing_unavailable")
            self.ledger.release_failed(owner, tenant, data["quote_id"], reason="before_dispatch")
            return {"released": True}
        if action == "result" and set(data) == {"packet_id"}:
            return self.outcome(owner, tenant, data["packet_id"])
        if action == "checkout" and set(data) == {"purchase_id", "amount_minor"}:
            self.require_ready()
            return self.checkout.create(owner, tenant, purchase_id=data["purchase_id"], minor_amount=data["amount_minor"])
        raise BillingError("invalid_billing_command")
