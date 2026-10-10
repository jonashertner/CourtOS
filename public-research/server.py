"""Bounded local retrieval of public OpenCaseLaw decisions. No model/network client."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field


@dataclass(frozen=True)
class Settings:
    db: Path
    query_timeout_ms: int = 1500
    max_concurrent: int = 2

    def __post_init__(self):
        if not self.db.is_absolute():
            raise ValueError("PUBLIC_RESEARCH_DB must be an absolute file path")
        if not 1 <= self.query_timeout_ms <= 2000 or not 1 <= self.max_concurrent <= 4:
            raise ValueError("Public research resource limits are outside safe bounds")

    @classmethod
    def environment(cls):
        return cls(Path(os.environ.get("PUBLIC_RESEARCH_DB", "/srv/courtos-public-data/decisions.db")),
                   int(os.environ.get("PUBLIC_RESEARCH_TIMEOUT_MS", "1500")),
                   int(os.environ.get("PUBLIC_RESEARCH_CONCURRENCY", "2")))


class SearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    query: str = Field(min_length=2, max_length=180)
    limit: int = Field(default=5, ge=1, le=8)
    language: Literal["de", "fr", "it"] | None = None
    court: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    canton: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")


class QueryBusy(Exception):
    pass


class QueryTimedOut(Exception):
    pass


def literal_terms(query: str) -> str:
    # No caller-supplied FTS operators, prefixes, phrases, column selectors or
    # SQL fragments. Unicode words/numbers are quoted and combined with AND.
    words = re.findall(r"[^\W_]+", query, flags=re.UNICODE)
    if not words or len(words) > 8 or any(len(word) > 60 for word in words):
        raise ValueError("Use one to eight short search terms")
    return " AND ".join('"' + word + '"' for word in words)


def public_url(value):
    # URLs come only from the public database, never from request parameters.
    # This validates link syntax, not source authority or current availability.
    if not isinstance(value, str) or len(value) > 4096 or any(ord(ch) < 32 for ch in value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
            return None
    except ValueError:
        return None
    return value


METADATA_SQL = """d.decision_id,d.court,d.canton,d.docket_number,d.decision_date,d.language,
    substr(d.title,1,1000) AS title,substr(d.source_url,1,4097) AS source_url,
    substr(d.pdf_url,1,4097) AS pdf_url,substr(d.content_hash,1,128) AS content_hash,
    substr(d.scraped_at,1,64) AS scraped_at"""


def metadata(row):
    if not isinstance(row["decision_id"], str) or len(row["decision_id"]) > 240:
        raise sqlite3.DataError("Unsupported public decision identifier")
    return {
        "decision_id": str(row["decision_id"]),
        "court": str(row["court"])[:80], "canton": str(row["canton"])[:8],
        "docket_number": str(row["docket_number"])[:200],
        "decision_date": (row["decision_date"] or "")[:32] or None,
        "language": (row["language"] or "")[:8],
        "title": row["title"], "source_url": public_url(row["source_url"]),
        "pdf_url": public_url(row["pdf_url"]), "content_hash": row["content_hash"],
        "scraped_at": row["scraped_at"],
    }


class PublicResearch:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.slots = threading.BoundedSemaphore(settings.max_concurrent)

    @contextmanager
    def connection(self):
        if not self.slots.acquire(blocking=False):
            raise QueryBusy()
        conn = None
        deadline = time.monotonic() + self.settings.query_timeout_ms / 1000
        try:
            # Reopen each request, so atomic publisher replacements are visible.
            # mode=ro preserves SQLite locking/journal semantics; immutable=1 is
            # deliberately not used against a database the publisher can update.
            conn = sqlite3.connect(self.settings.db.as_uri() + "?mode=ro", uri=True, timeout=.1)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA query_only=ON")
            conn.execute("PRAGMA trusted_schema=OFF")
            conn.execute("PRAGMA cache_size=-4096")
            conn.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 16 * 1024 * 1024)
            conn.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
            conn.execute("BEGIN")
            yield conn
        except sqlite3.OperationalError as error:
            if "interrupted" in str(error).lower() or time.monotonic() >= deadline:
                raise QueryTimedOut() from None
            raise
        finally:
            if conn is not None:
                conn.close()
            self.slots.release()

    def health(self):
        with self.connection() as conn:
            conn.execute("SELECT decision_id FROM decisions LIMIT 1").fetchone()
            generation = conn.execute("PRAGMA user_version").fetchone()[0]
            return {"status": "ready", "database_generation": generation,
                    "read_only": True, "query_mode": "literal_terms", "model_calls": False}

    def search(self, request: SearchInput):
        query = literal_terms(request.query)
        filters, parameters = [], [query]
        for column in ("language", "court", "canton"):
            value = getattr(request, column)
            if value is not None:
                filters.append(f"d.{column}=?")
                parameters.append(value)
        where = "".join(" AND " + clause for clause in filters)
        parameters.append(request.limit)
        with self.connection() as conn:
            generation = conn.execute("PRAGMA user_version").fetchone()[0]
            # FTS5's rank cursor can stop once LIMIT matching, filtered rows are
            # found. ORDER BY bm25(...), decision_id instead sorts every hit.
            # Pin the same unweighted BM25 function even if the publisher has
            # configured a different default rank. Equal-score order is unspecified.
            rows = conn.execute(f"""SELECT {METADATA_SQL},
                snippet(decisions_fts,7,'','',' … ',40) AS snippet
                FROM decisions_fts JOIN decisions d ON d.rowid=decisions_fts.rowid
                WHERE decisions_fts MATCH ? AND rank MATCH 'bm25()'{where}
                ORDER BY decisions_fts.rank LIMIT ?""", parameters).fetchall()
            results = []
            for row in rows:
                snippet = row["snippet"] or ""
                results.append({**metadata(row), "snippet": snippet[:1200], "snippet_truncated": len(snippet) > 1200})
            return {"results": results, "query_mode": "literal_terms", "database_generation": generation,
                    "limit": request.limit, "exhaustive": False,
                    "notice": "Lokale Stichwortsuche. Suchauszüge sind gekürzt; Original und Kontext prüfen."}

    def decision(self, decision_id: str, start: int, length: int):
        with self.connection() as conn:
            generation = conn.execute("PRAGMA user_version").fetchone()[0]
            row = conn.execute(f"""SELECT {METADATA_SQL},
                substr(coalesce(d.full_text,''),?,?) AS passage,
                length(coalesce(d.full_text,'')) AS total_chars
                FROM decisions d WHERE d.decision_id=?""", (start + 1, length, decision_id)).fetchone()
            if row is None:
                return None
            text, total = row["passage"], row["total_chars"]
            actual_start = min(start, total)
            return {**metadata(row), "database_generation": generation,
                    "passage": {"start": actual_start, "end": actual_start + len(text), "text": text,
                                "total_chars": total, "has_more": actual_start + len(text) < total,
                                "locator_kind": "unicode_character_offset"},
                    "notice": "Zeichenpositionen beziehen sich auf den gespeicherten Text, nicht auf amtliche Randnummern oder PDF-Seiten."}


def create_app(settings: Settings | None = None):
    service = PublicResearch(settings or Settings.environment())
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.service = service

    @app.middleware("http")
    async def headers(request: Request, call_next):
        if request.method == "POST":
            # The loopback proxy sends one small JSON body with Content-Length.
            # Do not accept unbounded chunked streams on this narrow interface.
            try:
                size = int(request.headers.get("content-length", "-1"))
            except ValueError:
                size = -1
            if size < 0:
                return JSONResponse(status_code=411, content={"detail": "Content-Length required"})
            if size > 4096:
                return JSONResponse(status_code=413, content={"detail": "Search request is too large"})
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(QueryBusy)
    async def busy(_request, _error):
        return JSONResponse(status_code=429, content={"code": "public_research_busy", "detail": "Die lokale Suche ist ausgelastet. Bitte kurz warten."}, headers={"Retry-After": "2"})

    @app.exception_handler(QueryTimedOut)
    async def timeout(_request, _error):
        return JSONResponse(status_code=503, content={"code": "public_research_timeout", "detail": "Diese Suche ist zu breit. Bitte gezieltere Begriffe oder einen Gerichtsfilter verwenden."})

    @app.exception_handler(sqlite3.Error)
    async def database_error(_request, _error):
        return JSONResponse(status_code=503, content={"code": "public_research_unavailable", "detail": "Die öffentliche Suchdatenbank ist vorübergehend nicht verfügbar."})

    @app.get("/health")
    def health():
        return service.health()

    @app.post("/search")
    def search(body: SearchInput):
        try:
            return service.search(body)
        except ValueError:
            raise HTTPException(422, "Bitte ein bis acht kurze Suchbegriffe verwenden.") from None

    @app.get("/decisions/{decision_id}")
    def decision(decision_id: str, start: int = Query(default=0, ge=0, le=10000000),
                 length: int = Query(default=4000, ge=1, le=6000)):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.: -]{0,239}", decision_id):
            raise HTTPException(422, "Ungültige Entscheidkennung.")
        result = service.decision(decision_id, start, length)
        if result is None:
            raise HTTPException(404, "Entscheid nicht gefunden.")
        return result

    return app


app = create_app()
