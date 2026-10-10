"""Fixed-origin client for OpenCaseLaw's explicit, model-free research API.

No MCP tool selection, generic URL fetching, corpus copy or private source input.
Authentication and owner-specific rate limits remain in the native backend.
"""
from __future__ import annotations

import asyncio
import json
import re
import threading
from urllib.parse import quote

import httpx

ORIGIN = "https://mcp.opencaselaw.ch/api/research"
MAX_RESPONSE_BYTES = 150_000
TOTAL_TIMEOUT_SECONDS = 7
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:# -]{0,239}")


class RemoteUnavailable(Exception):
    def __init__(self, code="public_research_unavailable"):
        self.code = code
        super().__init__(code)


def generation(value):
    if value is None or type(value) is int or (isinstance(value, str) and len(value) <= 128):
        return value
    raise RemoteUnavailable()


class RemotePublicResearch:
    def __init__(self, max_concurrent, literal_terms, public_url, *, transport=None):
        self.slots = threading.BoundedSemaphore(max_concurrent)
        self.literal_terms = literal_terms
        self.public_url = public_url
        self.transport = transport  # MockTransport for isolated tests; never environment-configurable.

    async def request(self, method, path, body=None):
        if not self.slots.acquire(blocking=False):
            raise RemoteUnavailable("public_research_busy")
        try:
            # One new client per request: upstream cookies cannot persist or be
            # replayed. No caller headers, auth, environment proxy or redirects.
            async with asyncio.timeout(TOTAL_TIMEOUT_SECONDS):
                async with httpx.AsyncClient(trust_env=False, follow_redirects=False,
                                             timeout=TOTAL_TIMEOUT_SECONDS, transport=self.transport) as client:
                    async with client.stream(method, ORIGIN + path, json=body,
                                             headers={"Accept": "application/json", "Accept-Encoding": "identity"}) as response:
                        if response.status_code == 404:
                            return None
                        if response.status_code == 429:
                            raise RemoteUnavailable("public_research_busy")
                        if response.status_code not in {200, 503}:
                            raise RemoteUnavailable()
                        if response.headers.get("content-type", "").split(";")[0].strip() != "application/json":
                            raise RemoteUnavailable()
                        if response.headers.get("content-encoding", "identity") != "identity":
                            raise RemoteUnavailable()
                        announced = response.headers.get("content-length")
                        if announced is not None and (not announced.isdecimal() or int(announced) > MAX_RESPONSE_BYTES):
                            raise RemoteUnavailable()
                        chunks, size = [], 0
                        async for chunk in response.aiter_bytes(chunk_size=16_384):
                            size += len(chunk)
                            if size > MAX_RESPONSE_BYTES:
                                raise RemoteUnavailable()
                            chunks.append(chunk)
                        result = json.loads(b"".join(chunks).decode("utf-8", errors="strict"))
                        if response.status_code == 503:
                            code = result.get("code") if isinstance(result, dict) else None
                            raise RemoteUnavailable("public_research_timeout" if code == "public_research_timeout" else "public_research_unavailable")
                        if not isinstance(result, dict) or result.get("model_calls") is not False:
                            raise RemoteUnavailable()
                        return result
        except (TimeoutError, httpx.TimeoutException):
            raise RemoteUnavailable("public_research_timeout") from None
        except RemoteUnavailable:
            raise
        except (httpx.HTTPError, ValueError, UnicodeError):
            raise RemoteUnavailable() from None
        finally:
            self.slots.release()

    def metadata(self, row):
        if not isinstance(row, dict) or not isinstance(row.get("decision_id"), str) or not IDENTIFIER.fullmatch(row["decision_id"]):
            raise RemoteUnavailable()
        result = {"decision_id": row["decision_id"]}
        for key, limit in {"court":80,"canton":8,"docket_number":200,"decision_date":32,"language":8,
                           "title":1000,"content_hash":128,"scraped_at":64}.items():
            value = row.get(key)
            if value is not None and not isinstance(value, str):
                raise RemoteUnavailable()
            result[key] = value[:limit] if value is not None else None
        for key in ("source_url", "pdf_url"):
            result[key] = self.public_url(row.get(key))
        return result

    async def health(self):
        value = await self.request("GET", "/health")
        if not value or value.get("status") != "ready" or value.get("read_only") is not True or value.get("query_mode") != "literal_terms":
            raise RemoteUnavailable()
        return {"status":"ready", "read_only":True, "query_mode":"literal_terms", "model_calls":False,
                "database_generation":generation(value.get("database_generation")), "source":"opencaselaw_public_api"}

    async def search(self, request):
        self.literal_terms(request.query)  # Reject invalid inputs before any network request.
        body = request.model_dump(exclude_none=True)
        value = await self.request("POST", "/search", body)
        if not value or value.get("query_mode") != "literal_terms" or value.get("exhaustive") is not False:
            raise RemoteUnavailable()
        rows = value.get("results")
        if not isinstance(rows, list) or len(rows) > request.limit:
            raise RemoteUnavailable()
        results, seen = [], set()
        for row in rows:
            meta = self.metadata(row)
            if meta["decision_id"] in seen:
                raise RemoteUnavailable()
            seen.add(meta["decision_id"])
            for field in ("court", "canton", "language"):
                if getattr(request, field) is not None and meta[field] != getattr(request, field):
                    raise RemoteUnavailable()
            snippet = row.get("snippet")
            if not isinstance(snippet, str) or type(row.get("snippet_truncated")) is not bool:
                raise RemoteUnavailable()
            results.append({**meta, "snippet":snippet[:1200], "snippet_truncated":row["snippet_truncated"] or len(snippet)>1200})
        scope = {}
        if any(key in value for key in ("ranking", "candidate_limit", "candidates_examined")):
            ranking, limit, examined = (value.get(key) for key in ("ranking", "candidate_limit", "candidates_examined"))
            if (not isinstance(ranking, str) or len(ranking) > 120 or not re.fullmatch(r"[a-z0-9_]+", ranking) or
                type(limit) is not int or not 1 <= limit <= 4096 or type(examined) is not int or not 0 <= examined <= limit):
                raise RemoteUnavailable()
            scope = {"ranking":ranking, "candidate_limit":limit, "candidates_examined":examined}
        return {"results":results, **scope, "query_mode":"literal_terms", "database_generation":generation(value.get("database_generation")),
                "limit":request.limit, "exhaustive":False, "model_calls":False,
                "notice":"OpenCaseLaw · öffentliche Stichwortsuche. Suchauszüge sind gekürzt; Original und Kontext prüfen."}

    async def decision(self, decision_id, start, length):
        if not IDENTIFIER.fullmatch(decision_id):
            raise ValueError("Invalid public identifier")
        value = await self.request("GET", f"/decisions/{quote(decision_id, safe='')}?start={start}&length={length}")
        if value is None:
            return None
        meta = self.metadata(value)
        if meta["decision_id"] != decision_id:  # Never accept fuzzy/alias substitution.
            raise RemoteUnavailable()
        passage = value.get("passage")
        if not isinstance(passage, dict) or not isinstance(passage.get("text"), str):
            raise RemoteUnavailable()
        text, total = passage["text"], passage.get("total_chars")
        if (type(total) is not int or total < 0 or len(text) > length or
            type(passage.get("start")) is not int or type(passage.get("end")) is not int or
            passage["start"] != min(start, total) or passage["end"] != passage["start"] + len(text) or
            len(text) != min(length, max(0, total-start)) or type(passage.get("has_more")) is not bool or
            passage["has_more"] != (passage["end"] < total) or passage.get("locator_kind") != "unicode_character_offset"):
            raise RemoteUnavailable()
        return {**meta, "database_generation":generation(value.get("database_generation")), "model_calls":False,
                "passage":{key:passage[key] for key in ("start","end","text","total_chars","has_more","locator_kind")},
                "notice":"Zeichenpositionen beziehen sich auf den gespeicherten Text, nicht auf amtliche Randnummern oder PDF-Seiten."}
