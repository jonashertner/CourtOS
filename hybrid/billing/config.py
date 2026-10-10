"""Strict activation switches: only an explicit false may opt out of billing."""
import os


def boolean_env(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value not in {"true", "false"}:
        # Do not echo the supplied value: configuration can contain secrets.
        raise ValueError(f"{name} must be true or false")
    return value == "true"
