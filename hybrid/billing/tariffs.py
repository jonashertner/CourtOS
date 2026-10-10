"""Integer-only, versioned retail pricing. Provider cost is a separate ledger."""
from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any

MICROS_PER_UNIT = 1_000_000
MICROS_PER_MINOR = 10_000  # CHF and EUR only; not a general currency converter.
MAX_INTEGER = 1_000_000_000_000


class BillingError(ValueError):
    """Safe domain code; adapters must map codes to fixed user-facing text."""


def integer(value: Any, name: str, *, minimum: int = 0, maximum: int = MAX_INTEGER) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise BillingError(name)
    return value


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            integer(value, "invalid_usage_" + name, maximum=10_000_000)

    @classmethod
    def from_anthropic(cls, data: Any) -> "Usage":
        # Never infer usage from visible text. Thinking is already included in
        # output_tokens; output_tokens_details must not be added a second time.
        if not isinstance(data, dict) or not {"input_tokens", "output_tokens"} <= data.keys():
            raise BillingError("usage_missing")
        for name in ("server_tool_use",):
            extra = data.get(name)
            if extra is not None and (not isinstance(extra, dict) or any(extra.values())):
                raise BillingError("unsupported_billable_usage")
        if data.get("service_tier") not in (None, "standard"):
            raise BillingError("unsupported_service_tier")
        return cls(data["input_tokens"], data["output_tokens"],
                   data.get("cache_read_input_tokens", 0),
                   data.get("cache_creation_input_tokens", 0))


@dataclass(frozen=True)
class Tariff:
    version: str
    model: str
    currency: str
    input_micros_per_million: int
    output_micros_per_million: int
    input_policy: str = "all_reported_input_tokens_same_rate"

    def __post_init__(self) -> None:
        if not self.version or not self.model or self.currency not in {"chf", "eur"}:
            raise BillingError("invalid_tariff")
        if self.input_policy != "all_reported_input_tokens_same_rate":
            raise BillingError("unsupported_input_policy")
        integer(self.input_micros_per_million, "invalid_input_rate", minimum=1)
        integer(self.output_micros_per_million, "invalid_output_rate", minimum=1)

    def price(self, usage: Usage) -> int:
        # Flat retail input price explicitly includes ordinary/cache read/write
        # input categories. These categories are disjoint in Anthropic usage.
        inputs = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
        numerator = inputs * self.input_micros_per_million + usage.output_tokens * self.output_micros_per_million
        return integer((numerator + MICROS_PER_UNIT - 1) // MICROS_PER_UNIT, "price_too_large")

    def snapshot(self) -> str:
        return canonical(asdict(self))

    def digest(self) -> str:
        return hashlib.sha256(self.snapshot().encode()).hexdigest()


# Confirmed by the owner on 2026-10-10. Importing this object does not activate
# billing. The confirmed retail ceiling includes applicable VAT; merchant/tax
# configuration and live activation remain separate gates.
CONFIRMED_CHF_TARIFF = Tariff(
    version="2026-10-10-chf-1", model="claude-opus-5-5", currency="chf",
    input_micros_per_million=12_000_000, output_micros_per_million=60_000_000,
)
CONFIRMED_TOPUPS_MINOR = (2_000, 5_000)


def billing_enabled(environment: dict[str, str]) -> bool:
    """Adapters must additionally check merchant/tax/webhook readiness."""
    return environment.get("BILLING_ENABLED", "false") == "true"
