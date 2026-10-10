"""Existing public OpenCaseLaw API; AI-assisted search, never private content."""
from __future__ import annotations

import asyncio
import codecs
import json
from urllib.parse import quote

import httpx

from remote import IDENTIFIER, RemotePublicResearch, RemoteUnavailable

ORIGIN = "https://mcp.opencaselaw.ch/api"
MCP_ORIGIN = "https://mcp.opencaselaw.ch/"
RPC_ID = "courtos-public-search"
TOTAL_TIMEOUT_SECONDS = 25
SEARCH_MAX_BYTES = 300_000
DECISION_MAX_BYTES = 2 * 1024 * 1024


class ExistingOpenCaseLaw(RemotePublicResearch):
    @staticmethod
    def mcp_payload(envelope):
        if not isinstance(envelope, dict) or envelope.get("jsonrpc") != "2.0":
            raise RemoteUnavailable()
        if envelope.get("id") != RPC_ID:
            return None  # Progress notifications are not search results.
        result = envelope.get("result")
        if envelope.get("error") or not isinstance(result, dict) or result.get("isError"):
            raise RemoteUnavailable()
        payload = result.get("structuredContent")
        if not isinstance(payload, dict):
            raise RemoteUnavailable()
        return payload

    def metadata(self, row):
        result = super().metadata(row)
        result["date_is_estimated"] = row.get("date_is_estimated") if type(row.get("date_is_estimated")) is bool else None
        defect = row.get("source_defect")
        note = defect.get("note") if isinstance(defect, dict) else None
        result["source_note"] = note[:1000] if isinstance(note, str) else None
        return result

    async def request(self, method, path, body=None):
        # Paths are constructed here, never accepted from the browser or a hit URL.
        maximum = SEARCH_MAX_BYTES if method == "POST" else DECISION_MAX_BYTES
        is_search = method == "POST"
        url = MCP_ORIGIN if is_search else ORIGIN + path
        payload = {"jsonrpc":"2.0", "id":RPC_ID, "method":"tools/call",
                   "params":{"name":"search_decisions", "arguments":body}} if is_search else None
        headers = {"Accept":"application/json, text/event-stream" if is_search else "application/json", "Accept-Encoding":"identity"}
        if is_search:
            headers["MCP-Protocol-Version"] = "2025-03-26"
        if not self.slots.acquire(blocking=False):
            raise RemoteUnavailable("public_research_busy")
        try:
            async with asyncio.timeout(TOTAL_TIMEOUT_SECONDS):
                async with httpx.AsyncClient(trust_env=False, follow_redirects=False,
                                             timeout=TOTAL_TIMEOUT_SECONDS, transport=self.transport) as client:
                    async with client.stream(method, url, json=payload, headers=headers) as response:
                        if response.status_code == 404:
                            return None
                        if response.status_code == 429:
                            raise RemoteUnavailable("public_research_busy")
                        if response.status_code != 200:
                            raise RemoteUnavailable()
                        content_type = response.headers.get("content-type", "").split(";")[0].strip()
                        is_sse = is_search and content_type == "text/event-stream"
                        if content_type != "application/json" and not is_sse:
                            raise RemoteUnavailable()
                        if response.headers.get("content-encoding", "identity") != "identity":
                            raise RemoteUnavailable()
                        announced = response.headers.get("content-length")
                        if announced is not None and (not announced.isdecimal() or int(announced) > maximum):
                            raise RemoteUnavailable()
                        chunks, size, buffer = [], 0, ""
                        decoder = codecs.getincrementaldecoder("utf-8")(errors="strict")
                        value = None
                        # No fixed chunk_size: it would buffer short SSE responses
                        # until EOF, despite the completed result being available.
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > maximum:
                                raise RemoteUnavailable()
                            if is_sse:
                                buffer = (buffer + decoder.decode(chunk)).replace("\r\n", "\n")
                                while "\n\n" in buffer:
                                    event, buffer = buffer.split("\n\n", 1)
                                    data = "\n".join(line[5:].lstrip(" ") for line in event.split("\n") if line.startswith("data:"))
                                    if not data:
                                        continue
                                    value = self.mcp_payload(json.loads(data))
                                    if value is not None:
                                        break
                                if value is not None:
                                    break  # Close this response; never wait for the SSE connection to end.
                            else:
                                chunks.append(chunk)
                        if not is_sse:
                            value = json.loads(b"".join(chunks).decode("utf-8", errors="strict"))
                            if is_search:
                                value = self.mcp_payload(value)
                        if not isinstance(value, dict) or value.get("error") or value.get("_is_error") or value.get("isError"):
                            raise RemoteUnavailable()
                        return value
        except (TimeoutError, httpx.TimeoutException):
            raise RemoteUnavailable("public_research_timeout") from None
        except RemoteUnavailable:
            raise
        except (httpx.HTTPError, ValueError, UnicodeError):
            raise RemoteUnavailable() from None
        finally:
            self.slots.release()

    async def health(self):
        # Readiness is local configuration only. Never issue an AI search as a
        # health check, prefetch or page-load side effect.
        return {"status":"ready", "read_only":True, "query_mode":"opencaselaw_ai",
                "ai_assisted":True, "model_calls":None, "database_generation":None,
                "source":"opencaselaw_public_service", "upstream_checked":False}

    async def search(self, request):
        self.literal_terms(request.query)  # Input size/term guard; no claim of literal upstream matching.
        arguments = request.model_dump(exclude_none=True)
        arguments.update({"fields":"full", "include_pinpoint":False})
        value = await self.request("POST", "/", arguments)
        if value is None:
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
            if snippet is None:
                snippet = ""
            if not isinstance(snippet, str):
                raise RemoteUnavailable()
            # The API's FTS highlight markers are presentation only; all other
            # source characters remain plain text, never interpreted as HTML.
            snippet = snippet.replace("<mark>", "").replace("</mark>", "")
            results.append({**meta, "snippet":snippet[:1200], "snippet_truncated":len(snippet)>1200})
        return {"results":results, "query_mode":"opencaselaw_ai", "database_generation":None,
                "limit":request.limit, "exhaustive":False, "ai_assisted":True, "model_calls":None,
                "degraded":value.get("degraded") is True,
                "source":"opencaselaw_public_service",
                "notice":"OpenCaseLaw · KI-gestützte Suche. Suchbegriffe werden an den öffentlichen Dienst übermittelt; Original und Kontext prüfen."}

    async def decision(self, decision_id, start, length):
        if not IDENTIFIER.fullmatch(decision_id):
            raise ValueError("Invalid public identifier")
        value = await self.request("GET", f"/decisions/{quote(decision_id, safe='')}?full_text=true")
        if value is None:
            return None
        meta = self.metadata(value)
        text = value.get("full_text")
        # Upstream accepts docket/alias lookups. CourtOS does not: a substituted
        # source would invalidate citations and any copied character positions.
        if (meta["decision_id"] != decision_id or not isinstance(text, str) or value.get("text_available") is False
                or value.get("full_text_truncated") or value.get("truncated")):
            raise RemoteUnavailable()
        total = len(text)
        offset = min(start, total)
        passage = text[offset:offset + length]
        return {**meta, "database_generation":None, "model_calls":None,
                "source":"opencaselaw_public_service",
                "passage":{"start":offset, "end":offset+len(passage), "text":passage,
                           "total_chars":total, "has_more":offset+len(passage)<total,
                           "locator_kind":"unicode_character_offset"},
                "notice":"Zeichenpositionen beziehen sich auf den von OpenCaseLaw gelieferten Text, nicht auf amtliche Randnummern oder PDF-Seiten."}
