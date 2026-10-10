"""SQLite credit ledger owned by the sole gateway process.

The gateway exposes these operations through authenticated internal calls. All monetary changes and idempotency records commit together.
There is no Stripe/Anthropic network code and no browser-trusted identity here.
"""
from contextlib import closing, contextmanager
from dataclasses import asdict
import json
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Callable, Iterator
import uuid

from .tariffs import BillingError, CONFIRMED_TOPUPS_MINOR, MICROS_PER_MINOR, Tariff, Usage, canonical, integer

SCHEMA = """
CREATE TABLE IF NOT EXISTS wallets (
 owner TEXT NOT NULL, tenant TEXT NOT NULL, currency TEXT NOT NULL,
 balance INTEGER NOT NULL DEFAULT 0, held INTEGER NOT NULL DEFAULT 0 CHECK(held >= 0),
 blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN(0,1)),
 PRIMARY KEY(owner,tenant,currency)
);
CREATE TABLE IF NOT EXISTS journal (
 id INTEGER PRIMARY KEY, owner TEXT NOT NULL, tenant TEXT NOT NULL, currency TEXT NOT NULL,
 kind TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, balance_delta INTEGER NOT NULL,
 held_delta INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON journal
 BEGIN SELECT RAISE(ABORT,'journal is append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON journal
 BEGIN SELECT RAISE(ABORT,'journal is append-only'); END;
CREATE TABLE IF NOT EXISTS tariffs (version TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, tenant TEXT NOT NULL, currency TEXT NOT NULL,
 minor_amount INTEGER NOT NULL, account TEXT NOT NULL, live INTEGER NOT NULL,
 session TEXT UNIQUE, payment_intent TEXT UNIQUE, state TEXT NOT NULL DEFAULT 'created',
 reversed_minor INTEGER NOT NULL DEFAULT 0, receipt TEXT, created INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stripe_events (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, binding TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY, packet TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, tenant TEXT NOT NULL,
 currency TEXT NOT NULL, payload_hash TEXT NOT NULL, tariff TEXT NOT NULL,
 ceiling INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'prepared',
 charge INTEGER, measured_cost INTEGER, provider_message TEXT UNIQUE, provider_request TEXT,
 result_hash TEXT, usage TEXT, failure TEXT, result TEXT
);
"""


def identifier(value: Any) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 160 or any(ord(c) < 33 for c in value):
        raise BillingError("invalid_identifier")
    return value


def digest(value: Any) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[a-f0-9]{64}", value) is None:
        raise BillingError("invalid_digest")
    return value


class Ledger:
    def __init__(self, path: Path, clock: Callable[[], int] | None = None):
        self.path = Path(path)
        self.clock = clock or (lambda: int(time.time()))
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        os.chmod(self.path, 0o600)
        with closing(self.connect()) as db:
            db.executescript(SCHEMA)
            if "created" not in {row[1] for row in db.execute("PRAGMA table_info(purchases)")} :
                db.execute("ALTER TABLE purchases ADD COLUMN created INTEGER NOT NULL DEFAULT 0")
            for table, column in (("purchases", "receipt"), ("quotes", "result")):
                if column not in {row[1] for row in db.execute(f"PRAGMA table_info({table})")}:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        return db

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _wallet(db: sqlite3.Connection, owner: str, tenant: str, currency: str) -> sqlite3.Row:
        identifier(owner); identifier(tenant)
        if currency not in {"chf", "eur"}:
            raise BillingError("unsupported_currency")
        db.execute("INSERT OR IGNORE INTO wallets(owner,tenant,currency) VALUES(?,?,?)", (owner, tenant, currency))
        return db.execute("SELECT * FROM wallets WHERE owner=? AND tenant=? AND currency=?", (owner, tenant, currency)).fetchone()

    def _entry(self, db: sqlite3.Connection, owner: str, tenant: str, currency: str,
               kind: str, reference: str, balance_delta: int, held_delta: int) -> None:
        wallet = self._wallet(db, owner, tenant, currency)
        balance, held = wallet["balance"] + balance_delta, wallet["held"] + held_delta
        integer(abs(balance), "balance_overflow"); integer(held, "hold_overflow")
        db.execute("INSERT INTO journal(owner,tenant,currency,kind,reference,balance_delta,held_delta,created) VALUES(?,?,?,?,?,?,?,?)",
                   (owner, tenant, currency, kind, reference, balance_delta, held_delta, self.clock()))
        db.execute("UPDATE wallets SET balance=?,held=? WHERE owner=? AND tenant=? AND currency=?",
                   (balance, held, owner, tenant, currency))

    def balance(self, owner: str, tenant: str, currency: str = "chf") -> dict[str, Any]:
        with self.transaction() as db:
            row = self._wallet(db, owner, tenant, currency)
            return {"currency": currency, "balance_micros": row["balance"], "held_micros": row["held"],
                    "available_micros": max(0, row["balance"] - row["held"]), "blocked": bool(row["blocked"])}

    def create_purchase(self, owner: str, tenant: str, *, purchase_id: str, minor_amount: int,
                        stripe_account: str, live: bool, currency: str = "chf") -> dict[str, Any]:
        identifier(purchase_id); identifier(stripe_account)
        integer(minor_amount, "invalid_topup")
        if currency != "chf" or minor_amount not in CONFIRMED_TOPUPS_MINOR or type(live) is not bool:
            raise BillingError("unsupported_topup")
        values = (purchase_id, owner, tenant, currency, minor_amount, stripe_account, int(live))
        with self.transaction() as db:
            if self._wallet(db, owner, tenant, currency)["blocked"]:
                raise BillingError("wallet_blocked")
            old = db.execute("SELECT * FROM purchases WHERE id=?", (purchase_id,)).fetchone()
            if old:
                if tuple(old[k] for k in ("id", "owner", "tenant", "currency", "minor_amount", "account", "live")) != values:
                    raise BillingError("purchase_conflict")
                return dict(old)
            total, own = db.execute("SELECT count(*),coalesce(sum(owner=? AND tenant=?),0) FROM purchases WHERE created>?", (owner, tenant, self.clock() - 86400)).fetchone()
            if own >= 10 or total >= 100:
                raise BillingError("checkout_rate_limited")
            db.execute("INSERT INTO purchases(id,owner,tenant,currency,minor_amount,account,live,created) VALUES(?,?,?,?,?,?,?,?)", (*values, self.clock()))
            return dict(db.execute("SELECT * FROM purchases WHERE id=?", (purchase_id,)).fetchone())

    def bind_checkout(self, purchase_id: str, session_id: str) -> None:
        identifier(session_id)
        with self.transaction() as db:
            row = db.execute("SELECT * FROM purchases WHERE id=?", (purchase_id,)).fetchone()
            if not row or row["session"] not in (None, session_id):
                raise BillingError("checkout_binding_conflict")
            db.execute("UPDATE purchases SET session=? WHERE id=?", (session_id, purchase_id))

    def credit_verified_checkout(self, *, event_id: str, account: str, live: bool, session: dict[str, Any],
                                 confirmed_loss_minor: int = 0, payment_blocked: bool = False) -> bool:
        """Only for SDK-verified events plus a fresh server-retrieved Session.

        No caller-supplied owner, amount or metadata can choose the credit target.
        The pre-existing local purchase/session binding is authoritative.
        """
        identifier(event_id); identifier(account)
        integer(confirmed_loss_minor, "invalid_reversal")
        if type(payment_blocked) is not bool:
            raise BillingError("invalid_payment_block")
        sid, pi = identifier(session.get("id")), identifier(session.get("payment_intent"))
        amount = integer(session.get("amount_total"), "invalid_paid_amount", minimum=1)
        if confirmed_loss_minor > amount:
            raise BillingError("invalid_reversal")
        if type(live) is not bool or session.get("livemode") is not live:
            raise BillingError("stripe_mode_mismatch")
        if session.get("mode") != "payment" or session.get("payment_status") != "paid" or session.get("status") != "complete":
            raise BillingError("payment_not_completed")
        binding = canonical([account, live, sid, pi, amount, session.get("currency"), session.get("client_reference_id")])
        with self.transaction() as db:
            row = db.execute("SELECT * FROM purchases WHERE session=?", (sid,)).fetchone()
            if (not row or row["account"] != account or bool(row["live"]) is not live
                    or row["minor_amount"] != amount or row["currency"] != session.get("currency")
                    or row["id"] != session.get("client_reference_id")):
                raise BillingError("payment_binding_mismatch")
            old = db.execute("SELECT * FROM stripe_events WHERE id=?", (event_id,)).fetchone()
            if old and old["binding"] != binding:
                raise BillingError("event_conflict")
            if not old:
                db.execute("INSERT INTO stripe_events(id,session,binding) VALUES(?,?,?)", (event_id, sid, binding))
            credited = row["state"] != "paid"
            if not credited and row["payment_intent"] != pi:
                raise BillingError("payment_intent_conflict")
            if credited:
                db.execute("UPDATE purchases SET state='paid',payment_intent=? WHERE id=?", (pi, row["id"]))
                self._entry(db, row["owner"], row["tenant"], row["currency"], "topup", "topup:" + row["id"], amount * MICROS_PER_MINOR, 0)
            # Fresh provider reconciliation can precede an out-of-order completion
            # event. Credit, reversal and spending freeze become visible together.
            delta = confirmed_loss_minor - row["reversed_minor"]
            if delta > 0:
                self._entry(db, row["owner"], row["tenant"], row["currency"], "payment_reversal",
                            f"reversal:{row['id']}:{confirmed_loss_minor}", -delta * MICROS_PER_MINOR, 0)
                db.execute("UPDATE purchases SET reversed_minor=? WHERE id=?", (confirmed_loss_minor, row["id"]))
            if payment_blocked or confirmed_loss_minor > 0:
                db.execute("UPDATE wallets SET blocked=1 WHERE owner=? AND tenant=? AND currency=?", (row["owner"], row["tenant"], row["currency"]))
            return credited

    def reverse_purchase(self, purchase_id: str, *, confirmed_total_minor: int) -> None:
        """Operator/webhook adapter supplies the reconciled cumulative loss.

        Never call once per event amount: out-of-order duplicate refunds and a
        chargeback must first be reconciled against the same Stripe payment.
        """
        integer(confirmed_total_minor, "invalid_reversal")
        with self.transaction() as db:
            row = db.execute("SELECT * FROM purchases WHERE id=? AND state='paid'", (purchase_id,)).fetchone()
            if not row or confirmed_total_minor > row["minor_amount"]:
                raise BillingError("invalid_reversal")
            delta = confirmed_total_minor - row["reversed_minor"]
            if delta <= 0:
                return
            self._entry(db, row["owner"], row["tenant"], row["currency"], "payment_reversal",
                        f"reversal:{purchase_id}:{confirmed_total_minor}", -delta * MICROS_PER_MINOR, 0)
            db.execute("UPDATE purchases SET reversed_minor=? WHERE id=?", (confirmed_total_minor, purchase_id))
            db.execute("UPDATE wallets SET blocked=1 WHERE owner=? AND tenant=? AND currency=?", (row["owner"], row["tenant"], row["currency"]))

    def prepare_quote(self, owner: str, tenant: str, *, packet_id: str, payload_hash: str,
                      tariff: Tariff, input_token_allowance: int, max_output_tokens: int,
                      ttl_seconds: int = 600) -> dict[str, Any]:
        identifier(packet_id); digest(payload_hash)
        integer(ttl_seconds, "invalid_quote_ttl", minimum=1, maximum=600)
        ceiling = tariff.price(Usage(input_token_allowance, max_output_tokens))
        integer(ceiling, "empty_quote", minimum=1)
        snapshot = tariff.snapshot()
        with self.transaction() as db:
            self._wallet(db, owner, tenant, tariff.currency)
            old_tariff = db.execute("SELECT snapshot FROM tariffs WHERE version=?", (tariff.version,)).fetchone()
            if old_tariff and old_tariff["snapshot"] != snapshot:
                raise BillingError("tariff_version_conflict")
            db.execute("INSERT OR IGNORE INTO tariffs(version,snapshot) VALUES(?,?)", (tariff.version, snapshot))
            old = db.execute("SELECT * FROM quotes WHERE packet=?", (packet_id,)).fetchone()
            if old:
                if (old["owner"], old["tenant"], old["payload_hash"], old["tariff"], old["ceiling"]) != (owner, tenant, payload_hash, snapshot, ceiling):
                    raise BillingError("quote_conflict")
                if old["state"] == "prepared" and old["expires"] <= self.clock():
                    # Renew explicitly; an old accepted quote ID must not regain validity.
                    new_id = str(uuid.uuid4())
                    db.execute("UPDATE quotes SET id=?,expires=? WHERE id=?", (new_id, self.clock() + ttl_seconds, old["id"]))
                    return dict(db.execute("SELECT * FROM quotes WHERE id=?", (new_id,)).fetchone())
                return dict(old)
            quote_id = str(uuid.uuid4())
            db.execute("INSERT INTO quotes(id,packet,owner,tenant,currency,payload_hash,tariff,ceiling,expires) VALUES(?,?,?,?,?,?,?,?,?)",
                       (quote_id, packet_id, owner, tenant, tariff.currency, payload_hash, snapshot, ceiling, self.clock() + ttl_seconds))
            return dict(db.execute("SELECT * FROM quotes WHERE id=?", (quote_id,)).fetchone())

    @staticmethod
    def _owned_quote(db: sqlite3.Connection, owner: str, tenant: str, quote_id: str) -> sqlite3.Row:
        row = db.execute("SELECT * FROM quotes WHERE id=? AND owner=? AND tenant=?", (quote_id, owner, tenant)).fetchone()
        if not row:
            raise BillingError("quote_not_found")
        return row

    def reserve(self, owner: str, tenant: str, quote_id: str, *, approved_hash: str,
                approved_ceiling: int, approved_currency: str) -> dict[str, Any]:
        digest(approved_hash); integer(approved_ceiling, "invalid_approval", minimum=1)
        with self.transaction() as db:
            row = self._owned_quote(db, owner, tenant, quote_id)
            if (approved_hash, approved_ceiling, approved_currency) != (row["payload_hash"], row["ceiling"], row["currency"]):
                raise BillingError("approval_changed")
            if row["state"] != "prepared":
                return dict(row)  # Idempotent status only; never another dispatch.
            if row["expires"] <= self.clock():
                raise BillingError("quote_expired")
            wallet = self._wallet(db, owner, tenant, row["currency"])
            if wallet["blocked"]:
                raise BillingError("wallet_blocked")
            if wallet["balance"] - wallet["held"] < row["ceiling"]:
                raise BillingError("insufficient_credit")
            self._entry(db, owner, tenant, row["currency"], "reserve", "reserve:" + quote_id, 0, row["ceiling"])
            db.execute("UPDATE quotes SET state='reserved' WHERE id=?", (quote_id,))
            return dict(db.execute("SELECT * FROM quotes WHERE id=?", (quote_id,)).fetchone())

    def claim_dispatch(self, owner: str, tenant: str, quote_id: str) -> bool:
        """Commit BEFORE the one network attempt; a crash never permits replay."""
        with self.transaction() as db:
            row = self._owned_quote(db, owner, tenant, quote_id)
            if row["state"] != "reserved":
                return False
            wallet = self._wallet(db, owner, tenant, row["currency"])
            if wallet["blocked"]:
                raise BillingError("wallet_blocked")
            if row["expires"] <= self.clock():
                raise BillingError("quote_expired")
            db.execute("UPDATE quotes SET state='dispatched' WHERE id=?", (quote_id,))
            return True

    def settle(self, owner: str, tenant: str, quote_id: str, *, usage: Usage,
               response_model: str, provider_message_id: str, provider_request_id: str,
               result_hash: str, result: dict[str, Any] | None = None) -> dict[str, Any]:
        identifier(provider_message_id); identifier(provider_request_id); digest(result_hash)
        result_json = canonical(result) if result is not None else None
        if result_json is not None and (len(result_json.encode()) > 120_000 or hashlib.sha256(result_json.encode()).hexdigest() != result_hash):
            raise BillingError("invalid_result_binding")
        usage_json = canonical(asdict(usage))
        with self.transaction() as db:
            row = self._owned_quote(db, owner, tenant, quote_id)
            tariff = Tariff(**json.loads(row["tariff"]))
            if response_model != tariff.model:
                raise BillingError("response_model_changed")
            if row["state"] == "settled":
                if (row["usage"], row["provider_message"], row["provider_request"], row["result_hash"]) != (usage_json, provider_message_id, provider_request_id, result_hash):
                    raise BillingError("settlement_conflict")
                return dict(row)
            if row["state"] != "dispatched":
                raise BillingError("settlement_not_dispatched")
            measured = tariff.price(usage)
            charge = min(measured, row["ceiling"])  # The operator absorbs any overrun.
            self._entry(db, owner, tenant, row["currency"], "settle", "settle:" + quote_id, -charge, -row["ceiling"])
            db.execute("UPDATE quotes SET state='settled',charge=?,measured_cost=?,provider_message=?,provider_request=?,result_hash=?,usage=?,result=? WHERE id=?",
                       (charge, measured, provider_message_id, provider_request_id, result_hash, usage_json, result_json, quote_id))
            return dict(db.execute("SELECT * FROM quotes WHERE id=?", (quote_id,)).fetchone())

    def release_failed(self, owner: str, tenant: str, quote_id: str, *, reason: str) -> dict[str, Any]:
        """Failed/unknown execution is never retrospectively customer-charged.

        Caller must not use this for an already delivered successful result.
        Unknown upstream cost needs operator reconciliation, not a second call.
        """
        if reason not in {"before_dispatch", "provider_failure", "usage_missing", "outcome_unknown", "unusable_result"}:
            raise BillingError("invalid_failure_reason")
        with self.transaction() as db:
            row = self._owned_quote(db, owner, tenant, quote_id)
            if row["state"] == "released":
                return dict(row)
            if row["state"] not in {"reserved", "dispatched"}:
                raise BillingError("release_not_reserved")
            if reason == "before_dispatch" and row["state"] == "dispatched":
                raise BillingError("dispatch_already_attempted")
            self._entry(db, owner, tenant, row["currency"], "release", "release:" + quote_id, 0, -row["ceiling"])
            db.execute("UPDATE quotes SET state='released',charge=0,failure=? WHERE id=?", (reason, quote_id))
            return dict(db.execute("SELECT * FROM quotes WHERE id=?", (quote_id,)).fetchone())

    def get_quote(self, owner: str, tenant: str, quote_id: str) -> dict[str, Any]:
        with closing(self.connect()) as db:
            return dict(self._owned_quote(db, owner, tenant, quote_id))


    def list_purchases(self, owner: str, tenant: str, limit: int = 20) -> list[dict[str, Any]]:
        integer(limit, "invalid_limit", minimum=1, maximum=100)
        with closing(self.connect()) as db:
            return [dict(row) for row in db.execute("SELECT * FROM purchases WHERE owner=? AND tenant=? ORDER BY rowid DESC LIMIT ?", (owner, tenant, limit))]

    def purchase_for_payment_intent(self, payment_intent: str) -> dict[str, Any] | None:
        identifier(payment_intent)
        with closing(self.connect()) as db:
            row = db.execute("SELECT * FROM purchases WHERE payment_intent=?", (payment_intent,)).fetchone()
            return dict(row) if row else None

    def update_purchase_receipt(self, purchase_id: str, receipt: dict[str, Any]) -> None:
        # Adapter supplies validated Stripe URLs/tax details, never browser fields.
        value = canonical(receipt)
        if len(value.encode()) > 16_384:
            raise BillingError("receipt_too_large")
        with self.transaction() as db:
            db.execute("UPDATE purchases SET receipt=? WHERE id=?", (value, purchase_id))

    def packet_outcome(self, owner: str, tenant: str, packet_id: str) -> dict[str, Any] | None:
        with closing(self.connect()) as db:
            row = db.execute("SELECT * FROM quotes WHERE owner=? AND tenant=? AND packet=?", (owner, tenant, packet_id)).fetchone()
            return dict(row) if row else None

    def recover_interrupted(self, *, startup: bool = False) -> int:
        """Sole gateway writer: release interrupted holds, never replay or debit.

        Startup is called before accepting traffic, with the former process gone.
        Runtime recovery only covers reservations older than the quote expiry plus
        5 minutes, beyond the hard provider timeout and bounded queue wait.
        """
        with self.transaction() as db:
            rows = db.execute("SELECT * FROM quotes WHERE state IN ('reserved','dispatched') AND (? OR expires < ?)", (int(startup), self.clock() - 300)).fetchall()
            for row in rows:
                reason = "before_dispatch" if row["state"] == "reserved" else "outcome_unknown"
                self._entry(db, row["owner"], row["tenant"], row["currency"], "release", "release:" + row["id"], 0, -row["ceiling"])
                db.execute("UPDATE quotes SET state='released',charge=0,failure=? WHERE id=?", (reason, row["id"]))
            return len(rows)

    def block_purchase(self, purchase_id: str) -> None:
        """Verified open dispute freezes spending without inventing a loss."""
        with self.transaction() as db:
            row = db.execute("SELECT * FROM purchases WHERE id=?", (purchase_id,)).fetchone()
            if not row:
                raise BillingError("purchase_not_found")
            db.execute("UPDATE wallets SET blocked=1 WHERE owner=? AND tenant=? AND currency=?", (row["owner"], row["tenant"], row["currency"]))

    def purchase_for_session(self, session_id: str) -> dict[str, Any] | None:
        identifier(session_id)
        with closing(self.connect()) as db:
            row = db.execute("SELECT * FROM purchases WHERE session=?", (session_id,)).fetchone()
            return dict(row) if row else None

    def mark_purchase_expired(self, purchase_id: str) -> None:
        """Only after retrieving an actually expired bound Stripe session."""
        with self.transaction() as db:
            db.execute("UPDATE purchases SET state='expired' WHERE id=? AND state='created'", (purchase_id,))
