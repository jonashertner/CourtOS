"""Application-to-gateway calls: fixed loopback URL and signed owner-bound DTO."""
import hashlib
import hmac
import json
import time
import httpx
from fastapi import HTTPException
from .tariffs import canonical


async def command(settings, secret: bytes, owner: dict, action: str, data: dict):
    value = {"domain": "courtos.billing.v1", "user_id": owner["id"], "tenant_id": owner["tenant"],
             "expires_at": time.time() + 60, "action": action, "data": data}
    value["signature"] = hmac.new(secret, canonical(value).encode(), hashlib.sha256).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=25, trust_env=False, follow_redirects=False) as client:
            response = await client.post(settings.gateway_url + "/v1/billing", json=value)
        if response.status_code != 200:
            body = response.json()
            known = {
                "insufficient_credit": (402, "Das Guthaben reicht für die bestätigte Obergrenze nicht aus."),
                "quote_expired": (409, "Die Kostenobergrenze ist abgelaufen. Bitte neu vorbereiten und bestätigen."),
                "approval_changed": (409, "Kostenfreigabe oder Text haben sich geändert. Bitte erneut prüfen."),
                "wallet_blocked": (409, "Das Guthabenkonto ist vorübergehend gesperrt."),
                "quote_already_used": (409, "Diese Kostenfreigabe wurde bereits verwendet."),
                "quote_not_found": (404, "Kostenfreigabe nicht gefunden."),
                "checkout_expired": (409, "Der Zahlungsvorgang ist abgelaufen. Bitte Guthaben aktualisieren und eine neue Aufladung beginnen."),
                "checkout_rate_limited": (429, "Zu viele neue Zahlungsvorgänge. Bitte einen bestehenden Vorgang fortsetzen oder später erneut versuchen."),
            }
            status, message = known.get(body.get("code"), (503, "Die Abrechnung ist derzeit nicht verfügbar."))
            raise HTTPException(status, message)
        return response.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Die Abrechnung ist derzeit nicht verfügbar.") from None
