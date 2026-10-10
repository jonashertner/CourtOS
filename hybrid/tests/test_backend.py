"""Run: python -m unittest discover -s tests -v (from app directory)."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
import hashlib
import hmac
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
import httpx
import jwt

import backend
import gateway
import manage


DATA = {
    "title": "Fiktiver Test", "fictional": True,
    "documents": [{"id": "D1", "title": "PRIVATE_CONTEXT", "fictional": True, "paragraphs": [{"id": "D1-P1", "text": "PRIVATE_CONTEXT: 4. März", "metadata": {"isolation_canary": "PRIVATE_CANARY"}}]}],
    "sources": [{"id": "S1", "title": "Öffentliche Quelle", "url": "https://example.org/law", "locator": "Art. 1", "passages": [{"id": "S1-P1", "text": "Unveränderter öffentlicher Wortlaut.", "kind": "quotation", "locator": "Art. 1 Abs. 1"}]}],
    "questions": [{"id": "Q1", "title": "Frage", "text": "Was steht in Art. 1?", "source_ids": ["S1"]}],
}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "data.json").write_text(json.dumps(DATA))
        (self.root / "hmac").write_bytes(b"S" * 48)
        self.cfg = backend.Settings(db=str(self.root / "app.sqlite"), data=str(self.root / "data.json"), secret_file=str(self.root / "hmac"), origin="https://testserver", base_path="", auth_mode="password", external_enabled=True, access_self_registration=False, local_daily_user_limit=3, local_daily_global_limit=30, frontier_daily_user_limit=1, frontier_daily_global_limit=10)
        backend.ensure_schema(self.cfg.db)
        encoded = backend.password_hash("a-long-test-password")
        with backend.database(self.cfg.db) as db:
            for name, tenant in [("alice", "one"), ("bob", "one"), ("carol", "two")]:
                db.execute("INSERT INTO users VALUES(?,?,?,?,1)", (name, name, tenant, encoded))
        self.local_calls, self.external_calls = [], []
        self.fail_local = False
        self.fail_external = False
        self.block_local = False

        async def local_call(cfg, payload):
            self.local_calls.append(payload)
            if self.block_local:
                await asyncio.sleep(60)
            if self.fail_local:
                raise RuntimeError("sensitive error not for UI")
            return {"text": "Chronologie [D1-P1]", "model": cfg.local_model}

        async def external_call(cfg, envelope):
            self.external_calls.append(envelope)
            if self.fail_external:
                raise RuntimeError("sensitive provider failure")
            return {"text": "Öffentliche Analyse [S1-P1]", "model": cfg.external_model}

        self.app = backend.create_app(self.cfg, local_caller=local_call, gateway_caller=external_call)
        self.client = TestClient(self.app, base_url="https://testserver")
        self.client.__enter__()
        self.headers = self.login(self.client, "alice")

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def login(self, client, username):
        response = client.post("/api/login", json={"username": username, "password": "a-long-test-password"}, headers={"Origin": "https://testserver"})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Origin": "https://testserver", "X-CSRF-Token": response.json()["csrf"]}

    def packet(self):
        response = self.client.post("/api/packets", json={"question_id": "Q1", "source_ids": ["S1"]}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def finish(self, job_id):
        for _ in range(100):
            response = self.client.get("/api/jobs/" + job_id)
            self.assertEqual(response.status_code, 200, response.text)
            if response.json()["status"] in {"succeeded", "failed"}:
                return response.json()
            time.sleep(.01)
        self.fail("Job did not finish")

    def resume(self, client=None):
        class ReadyHTTP:
            def __init__(self, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def get(self, url):
                return httpx.Response(200, request=httpx.Request("GET", url))

        # Bootstrap health probes stay local to this stub, never a live model.
        with patch("backend.httpx.AsyncClient", ReadyHTTP):
            response = (client or self.client).get("/api/bootstrap")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["resume"]

    def test_all_data_routes_require_session(self):
        anonymous = TestClient(self.app, base_url="https://testserver")
        for path in ["/api/me", "/api/bootstrap", "/api/jobs/none", "/api/packets/none", "/api/export/none"]:
            self.assertEqual(anonymous.get(path).status_code, 401, path)
        self.assertEqual(anonymous.post("/api/local", json={"action": "chronology"}).status_code, 401)

    def reviewed(self, **changes):
        body = {"text": "Öffentlicher Text zu Art. 29 BV.", "purpose": "Prüfe die Argumentationslücken.", "acknowledge_public": True} | changes
        return self.client.post("/api/packets/reviewed", json=body, headers=self.headers)

    def workbench(self, gateway_model=None, gateway_enabled=True):
        cfg = self.cfg
        class ReadyHTTP:
            def __init__(self, **kwargs): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def get(self, url):
                value = {"ready": True, "model": gateway_model or cfg.external_model, "reviewed_handoff": gateway_enabled} if url.endswith('/health') else {"data": []}
                return httpx.Response(200, json=value, request=httpx.Request("GET", url))
        with patch("backend.httpx.AsyncClient", ReadyHTTP):
            return self.client.get("/api/workbench")

    def test_reviewed_handoff_requires_opt_in_auth_and_explicit_public_confirmation(self):
        self.assertEqual(self.reviewed().status_code, 404)
        self.assertEqual(self.workbench().status_code, 404)
        self.cfg.reviewed_handoff_enabled = True
        anonymous = TestClient(self.app, base_url="https://testserver")
        body = {"text": "Public", "purpose": "Review", "acknowledge_public": True}
        self.assertEqual(anonymous.get("/api/workbench").status_code, 401)
        self.assertEqual(anonymous.post("/api/packets/reviewed", json=body).status_code, 401)
        self.assertEqual(self.client.post("/api/packets/reviewed", json=body).status_code, 403)
        self.assertEqual(self.client.post("/api/packets/reviewed", json=body, headers={**self.headers,"Origin":"https://evil.test"}).status_code, 403)
        for changes in [{"acknowledge_public":False},{"acknowledge_public":1},{"text":" "},{"purpose":" "},{"text":"ü"*6001},{"purpose":"ü"*501},{"text":"x\x00y"},{"files":[]},{"history":[]}]:
            self.assertEqual(self.reviewed(**changes).status_code, 422, changes.keys())
        self.assertEqual(self.external_calls, [])

    def test_reviewed_payload_is_exact_immutable_owned_and_uses_same_one_use_quota(self):
        self.cfg.reviewed_handoff_enabled = True
        packet = self.reviewed().json()
        self.assertEqual(packet['kind'], 'reviewed')
        self.assertEqual(backend.REVIEWED_SYSTEM, gateway.REVIEWED_SYSTEM)
        gateway.check_reviewed_payload(packet['payload'], self.cfg.external_model)
        content = json.loads(packet['payload']['messages'][0]['content'])
        self.assertEqual(content, {"purpose":"Prüfe die Argumentationslücken.","text":"Öffentlicher Text zu Art. 29 BV.","classification":"user_confirmed_public"})
        self.assertNotIn('PRIVATE_CONTEXT', json.dumps(packet))
        self.assertNotIn('PRIVATE_CANARY', json.dumps(packet))
        self.assertEqual(self.external_calls, [])
        self.assertEqual(self.reviewed().json()['id'], packet['id'])
        bob = TestClient(self.app, base_url='https://testserver')
        headers = self.login(bob,'bob')
        self.assertEqual(bob.get('/api/packets/'+packet['id']).status_code,404)
        self.assertEqual(bob.post('/api/packets/'+packet['id']+'/send',json={'hash':packet['hash']},headers=headers).status_code,404)
        wrong = self.client.post('/api/packets/'+packet['id']+'/send',json={'hash':'0'*64},headers=self.headers)
        self.assertEqual(wrong.status_code,409)
        sent = self.client.post('/api/packets/'+packet['id']+'/send',json={'hash':packet['hash']},headers=self.headers)
        self.assertEqual(sent.status_code,200,sent.text)
        self.assertEqual(self.finish(sent.json()['id'])['status'],'succeeded')
        exported=self.client.get('/api/export/'+sent.json()['id'])
        self.assertIn('CourtOS · Frontier-Prüfung',exported.text)
        self.assertNotIn('synthetischer Pilot',exported.text)
        self.assertIn('courtos-frontier-pruefung.md',exported.headers['content-disposition'])
        self.assertEqual(self.external_calls[0]['version'],2)
        self.assertEqual(self.external_calls[0]['payload'],packet['payload'])
        self.assertEqual(self.client.post('/api/packets/'+packet['id']+'/send',json={'hash':packet['hash']},headers=self.headers).status_code,409)
        another=self.reviewed(text='Anderer öffentlicher Text.').json()
        self.assertEqual(self.client.post('/api/packets/'+another['id']+'/send',json={'hash':another['hash']},headers=self.headers).status_code,429)
        self.assertEqual(len(self.external_calls),1)

    def test_workbench_only_resumes_reviewed_owner_packet_and_checks_model_readiness(self):
        self.packet()
        self.cfg.reviewed_handoff_enabled = True
        empty = self.workbench().json()
        self.assertEqual(empty['resume'],{'packet':None,'job':None})
        self.assertNotIn('documents',empty);self.assertNotIn('questions',empty)
        self.assertNotIn('PRIVATE_CONTEXT',json.dumps(empty))
        packet = self.reviewed().json()
        current = self.workbench().json()
        self.assertEqual(current['resume']['packet']['id'],packet['id'])
        self.assertTrue(current['frontier']['ready'])
        self.assertFalse(self.workbench(gateway_model='another-model').json()['frontier']['ready'])
        self.assertFalse(self.workbench(gateway_enabled=False).json()['frontier']['ready'])
        with backend.database(self.cfg.db) as db:
            db.execute("INSERT INTO packets(id,user_id,tenant,payload,hash,provider,model,status,created,expires,kind) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ('foreign','alice','another',json.dumps(packet['payload']),packet['hash'],'Anthropic',packet['model'],'prepared',time.time()+100,time.time()+10000,'reviewed'))
        self.assertEqual(self.workbench().json()['resume']['packet']['id'],packet['id'])
        sent=self.client.post('/api/packets/'+packet['id']+'/send',json={'hash':packet['hash']},headers=self.headers).json()
        self.finish(sent['id'])
        self.assertEqual(self.workbench().json()['resume']['job']['id'],sent['id'])

    def test_reviewed_preview_storage_admission_is_durable_and_atomic(self):
        self.cfg.reviewed_handoff_enabled = True
        with ThreadPoolExecutor(max_workers=12) as pool:
            responses=list(pool.map(lambda n:self.reviewed(text=f'Öffentlicher Text {n}.'),range(12)))
        self.assertEqual(sum(r.status_code==200 for r in responses),10)
        self.assertEqual(sum(r.status_code==429 for r in responses),2)
        accepted=next(r.json() for r in responses if r.status_code==200)
        approved_text=json.loads(accepted['payload']['messages'][0]['content'])['text']
        with backend.database(self.cfg.db) as db:
            initial=db.execute('SELECT created FROM packets WHERE id=?',(accepted['id'],)).fetchone()[0]
        self.assertEqual(self.reviewed(text=approved_text).json()['id'],accepted['id'])
        backend.ensure_schema(self.cfg.db)
        self.assertEqual(self.reviewed(text='Noch eine andere Vorschau.').status_code,429)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute('SELECT created FROM packets WHERE id=?',(accepted['id'],)).fetchone()[0],initial)
        self.assertEqual(self.external_calls,[])

    def test_reviewed_preview_global_limit_and_model_change_fail_before_inference(self):
        self.cfg.reviewed_handoff_enabled = True
        with patch('backend.REVIEWED_PREVIEWS_GLOBAL',1):
            packet=self.reviewed().json()
            bob=TestClient(self.app,base_url='https://testserver');headers=self.login(bob,'bob')
            denied=bob.post('/api/packets/reviewed',json={'text':'Public','purpose':'Review','acknowledge_public':True},headers=headers)
            self.assertEqual(denied.status_code,429)
        self.cfg.external_model='new-model'
        self.assertEqual(self.client.post('/api/packets/'+packet['id']+'/send',json={'hash':packet['hash']},headers=self.headers).status_code,409)
        self.assertEqual(self.external_calls,[])
        with backend.database(self.cfg.db) as db:self.assertEqual(db.execute('SELECT count(*) FROM jobs').fetchone()[0],0)

    def test_cookie_security_and_stored_token_hash(self):
        response = self.client.post("/api/login", json={"username": "alice", "password": "a-long-test-password"}, headers={"Origin": "https://testserver"})
        cookie = response.headers["set-cookie"]
        for part in ["HttpOnly", "Secure", "SameSite=strict"]:
            self.assertIn(part, cookie)
        token = self.client.cookies.get(backend.COOKIE)
        with backend.database(self.cfg.db) as db:
            hashes = [r[0] for r in db.execute("SELECT token_hash FROM sessions")]
        self.assertNotIn(token, hashes)
        self.assertIn(hashlib.sha256(token.encode()).hexdigest(), hashes)

    def test_csrf_origin_and_extra_fields(self):
        body = {"action": "chronology"}
        self.assertEqual(self.client.post("/api/local", json=body).status_code, 403)
        self.assertEqual(self.client.post("/api/local", json=body, headers={**self.headers, "Origin": "https://evil.test"}).status_code, 403)
        self.assertEqual(self.client.post("/api/local", json={**body, "document": "arbitrary"}, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post("/api/packets", json={"question_id": "Q1", "source_ids": ["S1"], "text": "arbitrary"}, headers=self.headers).status_code, 422)

    def test_exact_public_payload_and_one_time_approval(self):
        packet = self.packet()
        serialized = json.dumps(packet["payload"])
        self.assertNotIn("PRIVATE_CONTEXT", serialized)
        self.assertNotIn("PRIVATE_CANARY", serialized)
        self.assertNotIn("alice", serialized)
        public = json.loads(packet["payload"]["messages"][0]["content"])
        self.assertEqual(public["sources"][0]["passages"], DATA["sources"][0]["passages"])
        self.assertEqual(packet["hash"], backend.digest(packet["payload"]))
        bad = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": "0" * 64}, headers=self.headers)
        self.assertEqual(bad.status_code, 409)
        self.assertEqual(len(self.external_calls), 0)
        response = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        job = self.finish(response.json()["id"])
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(self.external_calls[0]["payload"], packet["payload"])
        self.assertEqual(self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).status_code, 409)
        self.assertEqual(len(self.external_calls), 1)
        stored = self.client.get(f"/api/packets/{packet['id']}").json()
        self.assertEqual(stored["job_id"], job["id"])
        self.assertEqual(stored["hash"], packet["hash"])

    def test_users_and_tenants_cannot_access_others_jobs_packets_exports(self):
        packet = self.packet()
        response = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
        job = self.finish(response.json()["id"])
        for name in ("bob", "carol"):
            other = TestClient(self.app, base_url="https://testserver")
            headers = self.login(other, name)
            for path in [f"/api/packets/{packet['id']}", f"/api/jobs/{job['id']}", f"/api/export/{job['id']}"]:
                self.assertEqual(other.get(path).status_code, 404, (name, path))
            self.assertEqual(other.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=headers).status_code, 404)
            self.assertEqual(other.post("/api/local", json={"action": "synthesis", "analysis_id": job["id"]}, headers=headers).status_code, 404)

    def test_local_failure_never_uses_external_service(self):
        self.fail_local = True
        response = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
        result = self.finish(response.json()["id"])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.external_calls, [])
        self.assertNotIn("sensitive error", result["error"])
        self.assertFalse(self.local_calls[0]["chat_template_kwargs"]["enable_thinking"])
        self.assertEqual(self.local_calls[0]["max_tokens"], 768)

    def test_synthesis_uses_owned_public_analysis_only_locally(self):
        packet = self.packet()
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.finish(sent["id"])
        response = self.client.post("/api/local", json={"action": "synthesis", "analysis_id": sent["id"]}, headers=self.headers)
        self.assertEqual(self.finish(response.json()["id"])["status"], "succeeded")
        content = self.local_calls[0]["messages"][1]["content"]
        self.assertIn("PRIVATE_CONTEXT", content)
        self.assertIn("Öffentliche Analyse", content)
        self.assertEqual(len(self.external_calls), 1)

    def test_bootstrap_resumes_running_job_and_results_for_owner_only(self):
        packet = self.packet()
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        external = self.finish(sent["id"])
        synthesis = self.client.post("/api/local", json={"action": "synthesis", "analysis_id": sent["id"]}, headers=self.headers).json()
        self.finish(synthesis["id"])
        self.block_local = True
        running = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).json()

        # A newer row with the same user id but another tenant must not win.
        with backend.database(self.cfg.db) as db:
            db.execute("INSERT INTO jobs(id,user_id,tenant,action,status,created,result) VALUES(?,?,?,?,?,?,?)", ("other-tenant-job", "alice", "two", "chronology", "succeeded", time.time() + 100, json.dumps({"text": "OTHER_TENANT"})))
            db.execute("INSERT INTO packets(id,user_id,tenant,payload,hash,provider,model,status,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?)", ("other-tenant-packet", "alice", "two", json.dumps(packet["payload"]), packet["hash"], "Anthropic", self.cfg.external_model, "prepared", time.time() + 100, time.time() + 600))

        resumed = self.resume()
        self.assertEqual(resumed["packet"]["id"], packet["id"])
        self.assertEqual(resumed["packet"]["job_id"], external["id"])
        self.assertEqual(resumed["jobs"]["external"], external)
        self.assertEqual(resumed["jobs"]["synthesis"]["id"], synthesis["id"])
        self.assertEqual(resumed["jobs"]["chronology"]["id"], running["id"])
        self.assertIn(resumed["jobs"]["chronology"]["status"], ("queued", "running"))
        self.assertNotIn("OTHER_TENANT", json.dumps(resumed))
        self.assertEqual(len(self.external_calls), 1)

        bob = TestClient(self.app, base_url="https://testserver")
        bob_headers = self.login(bob, "bob")
        bob_packet = bob.post("/api/packets", json={"question_id": "Q1", "source_ids": ["S1"]}, headers=bob_headers).json()
        bob_resume = self.resume(bob)
        self.assertEqual(bob_resume["packet"]["id"], bob_packet["id"])
        self.assertEqual(bob_resume["jobs"], {"chronology": None, "external": None, "synthesis": None})
        self.assertNotIn(packet["id"], json.dumps(bob_resume))
        self.assertNotIn(running["id"], json.dumps(bob_resume))
        self.assertEqual(self.resume()["packet"]["id"], packet["id"])

    def test_packet_previews_reuse_only_own_identical_unsubmitted_packet(self):
        packet = self.packet()
        with backend.database(self.cfg.db) as db:
            db.execute("UPDATE packets SET expires=0 WHERE id=?", (packet["id"],))
        with ThreadPoolExecutor(max_workers=8) as pool:
            previews = list(pool.map(lambda _: self.packet(), range(8)))
        self.assertEqual({p["id"] for p in previews}, {packet["id"]})
        self.assertTrue(all(p["expires_at"] > time.time() for p in previews))
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM packets").fetchone()[0], 1)
        bob = TestClient(self.app, base_url="https://testserver")
        headers = self.login(bob, "bob")
        other = bob.post("/api/packets", json={"question_id": "Q1", "source_ids": ["S1"]}, headers=headers).json()
        self.assertNotEqual(other["id"], packet["id"])
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.finish(sent["id"])
        fresh = self.packet()
        self.assertNotEqual(fresh["id"], packet["id"])
        self.assertEqual(self.client.get(f"/api/packets/{packet['id']}").json()["job_id"], sent["id"])
        self.assertEqual(len(self.external_calls), 1)

    def test_packet_source_order_does_not_create_duplicate_previews(self):
        self.app.state.demo["sources"].append({**DATA["sources"][0], "id": "S2"})
        self.app.state.demo["questions"][0]["source_ids"] = ["S1", "S2"]
        results = [self.client.post("/api/packets", json={"question_id": "Q1", "source_ids": ids}, headers=self.headers) for ids in [["S1", "S2"], ["S2", "S1"]]]
        self.assertTrue(all(r.status_code == 200 for r in results))
        self.assertEqual(results[0].json()["id"], results[1].json()["id"])
        self.assertEqual(results[0].json()["hash"], results[1].json()["hash"])
        self.assertEqual(len(self.external_calls), 0)

    def test_bootstrap_new_packet_does_not_resume_previous_analysis(self):
        # This recovery scenario deliberately exercises two approved analyses.
        self.cfg.frontier_daily_user_limit = 2
        chronology = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).json()
        self.finish(chronology["id"])
        old_packet = self.packet()
        old_external = self.client.post(f"/api/packets/{old_packet['id']}/send", json={"hash": old_packet["hash"]}, headers=self.headers).json()
        self.finish(old_external["id"])
        old_synthesis = self.client.post("/api/local", json={"action": "synthesis", "analysis_id": old_external["id"]}, headers=self.headers).json()
        self.finish(old_synthesis["id"])

        packet = self.packet()
        resumed = self.resume()
        self.assertEqual(resumed["packet"]["id"], packet["id"])
        self.assertEqual(resumed["jobs"]["chronology"]["id"], chronology["id"])
        self.assertIsNone(resumed["jobs"]["external"])
        self.assertIsNone(resumed["jobs"]["synthesis"])

        external = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.finish(external["id"])
        synthesis = self.client.post("/api/local", json={"action": "synthesis", "analysis_id": external["id"]}, headers=self.headers).json()
        self.finish(synthesis["id"])
        resumed = self.resume()
        self.assertEqual(resumed["packet"]["id"], packet["id"])
        self.assertEqual(resumed["packet"]["job_id"], external["id"])
        self.assertEqual(resumed["jobs"]["external"]["id"], external["id"])
        self.assertEqual(resumed["jobs"]["synthesis"]["id"], synthesis["id"])
        self.assertEqual(resumed["jobs"]["chronology"]["id"], chronology["id"])
        self.assertEqual(len(resumed["jobs"]), 3)

    def test_one_active_job_per_user_and_expired_packets(self):
        self.block_local = True
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).status_code, 429)
        packet = self.packet()
        with backend.database(self.cfg.db) as db:
            db.execute("UPDATE packets SET expires=0 WHERE id=?", (packet["id"],))
        self.assertEqual(self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).status_code, 409)

    def test_global_limit_across_three_users(self):
        self.block_local = True
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).status_code, 200)
        bob_headers = self.login(self.client, "bob")
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=bob_headers).status_code, 200)
        carol_headers = self.login(self.client, "carol")
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=carol_headers).status_code, 429)

    def test_disabled_external_does_not_consume_preview(self):
        self.cfg.external_enabled = False
        packet = self.packet()
        self.assertEqual(self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).status_code, 503)
        self.assertEqual(self.client.get(f"/api/packets/{packet['id']}").json()["status"], "prepared")
        self.assertEqual(self.external_calls, [])

    def test_actual_demo_matches_independent_public_catalogue(self):
        real = json.loads((backend.HERE / "data/demo.json").read_text())
        catalog = json.loads((backend.HERE / "data/public-catalog.json").read_text())
        self.app.state.demo = real
        for q in real["questions"]:
            for selected in [q["source_ids"], q["source_ids"][:1]]:
                response = self.client.post("/api/packets", json={"question_id": q["id"], "source_ids": selected}, headers=self.headers)
                self.assertEqual(response.status_code, 200, response.text)
                packet = response.json()
                gateway.check_payload(packet["payload"], self.cfg.external_model, catalog)
                public = json.loads(packet["payload"]["messages"][0]["content"])
                self.assertEqual(public["question"]["text"], q["text"])
                for source in public["sources"]:
                    original = next(s for s in real["sources"] if s["id"] == source["id"])
                    self.assertEqual(source["passages"], original["passages"])
                for document in real["documents"]:
                    for paragraph in document["paragraphs"]:
                        canary = paragraph.get("metadata", {}).get("isolation_canary")
                        if canary:
                            self.assertNotIn(canary, json.dumps(packet["payload"]))

    def test_login_rate_limit_and_logout(self):
        other = TestClient(self.app, base_url="https://testserver")
        for _ in range(5):
            self.assertEqual(other.post("/api/login", json={"username": "bob", "password": "incorrect"}, headers={"Origin": "https://testserver"}).status_code, 401)
        self.assertEqual(other.post("/api/login", json={"username": "bob", "password": "a-long-test-password"}, headers={"Origin": "https://testserver"}).status_code, 429)
        self.assertEqual(self.client.post("/api/logout", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/me").status_code, 401)

    def test_daily_local_quota_includes_failure_and_survives_restart(self):
        self.cfg.local_daily_user_limit = 2
        self.fail_local = True
        for _ in range(2):
            response = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
            self.assertEqual(self.finish(response.json()["id"])["status"], "failed")
        denied = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
        self.assertEqual(denied.status_code, 429)
        self.assertIn("2 pro UTC-Kalendertag", denied.json()["error"])
        self.assertEqual(len(self.local_calls), 2)
        # A new application instance reads the same durable admission history.
        with TestClient(backend.create_app(self.cfg), base_url="https://testserver") as restarted:
            headers = self.login(restarted, "alice")
            self.assertEqual(restarted.post("/api/local", json={"action": "chronology"}, headers=headers).status_code, 429)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jobs").fetchone()[0], 2)

    def test_chronology_and_synthesis_share_local_daily_quota(self):
        self.cfg.local_daily_user_limit = 1
        packet = self.packet()
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.finish(sent["id"])
        local = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).json()
        self.finish(local["id"])
        denied = self.client.post("/api/local", json={"action": "synthesis", "analysis_id": sent["id"]}, headers=self.headers)
        self.assertEqual(denied.status_code, 429)
        self.assertEqual(len(self.local_calls), 1)
        self.assertEqual(len(self.external_calls), 1)

    def test_frontier_failure_counts_but_preview_and_rejection_do_not(self):
        self.fail_external = True
        packet = self.packet()
        self.assertEqual(self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": "0" * 64}, headers=self.headers).status_code, 409)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jobs").fetchone()[0], 0)
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.assertEqual(self.finish(sent["id"])["status"], "failed")
        another = self.packet()
        denied = self.client.post(f"/api/packets/{another['id']}/send", json={"hash": another["hash"]}, headers=self.headers)
        self.assertEqual(denied.status_code, 429)
        self.assertIn("1 pro UTC-Kalendertag", denied.json()["error"])
        self.assertEqual(self.client.get(f"/api/packets/{another['id']}").json()["status"], "prepared")
        self.assertEqual(len(self.external_calls), 1)

    def test_global_frontier_quota_applies_across_users_and_tenants(self):
        self.cfg.frontier_daily_global_limit = 1
        packet = self.packet()
        sent = self.client.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=self.headers).json()
        self.finish(sent["id"])
        other = TestClient(self.app, base_url="https://testserver")
        headers = self.login(other, "carol")
        packet = other.post("/api/packets", json={"question_id": "Q1", "source_ids": ["S1"]}, headers=headers).json()
        denied = other.post(f"/api/packets/{packet['id']}/send", json={"hash": packet["hash"]}, headers=headers)
        self.assertEqual(denied.status_code, 429)
        self.assertIn("gemeinsame Tageskontingent", denied.json()["error"])
        self.assertEqual(len(self.external_calls), 1)

    def test_global_daily_admission_is_atomic_for_parallel_requests(self):
        self.cfg.local_daily_global_limit = 1
        other = TestClient(self.app, base_url="https://testserver")
        headers = self.login(other, "bob")
        calls = [(self.client, self.headers), (other, headers)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda pair: pair[0].post("/api/local", json={"action": "chronology"}, headers=pair[1]), calls))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 429])
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)
        self.assertLessEqual(len(self.local_calls), 1)

    def test_all_job_states_count_and_utc_day_boundary_resets_usage(self):
        self.cfg.local_daily_user_limit = 4
        today = int(time.time() // 86400) * 86400
        with backend.database(self.cfg.db) as db:
            for i, status in enumerate(("queued", "running", "succeeded", "failed")):
                db.execute("INSERT INTO jobs(id,user_id,tenant,action,status,created) VALUES(?,?,?,?,?,?)", (f"seed-{i}", "alice", "one", "chronology", status, today))
        denied = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
        self.assertEqual(denied.status_code, 429)
        self.assertIn("Tageskontingent", denied.json()["error"])
        with backend.database(self.cfg.db) as db:
            db.execute("UPDATE jobs SET created=?,status='failed'", (today - .001,))
        admitted = self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers)
        self.assertEqual(admitted.status_code, 200)
        self.finish(admitted.json()["id"])
        self.assertEqual(len(self.local_calls), 1)

    def test_daily_limit_configuration_can_pause_calls_but_not_be_negative(self):
        self.cfg.local_daily_user_limit = 0
        self.assertEqual(self.client.post("/api/local", json={"action": "chronology"}, headers=self.headers).status_code, 429)
        self.assertEqual(self.local_calls, [])
        with self.assertRaises(ValueError):
            backend.create_app(backend.Settings(frontier_daily_global_limit=-1))


class CloudflareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        p = Path(self.temp.name)
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        jwk["kid"] = "test-key"
        (p / "jwks.json").write_text(json.dumps({"keys": [jwk]}))
        (p / "data.json").write_text(json.dumps(DATA))
        (p / "hmac").write_bytes(b"S" * 48)
        self.cfg = backend.Settings(db=str(p / "db"), data=str(p / "data.json"), secret_file=str(p / "hmac"), origin="https://testserver", base_path="", auth_mode="cloudflare", access_issuer="https://team.cloudflareaccess.com", access_aud="our-app", access_jwks_file=str(p / "jwks.json"), access_self_registration=False)
        backend.ensure_schema(self.cfg.db)
        with backend.database(self.cfg.db) as db:
            db.execute("INSERT INTO users VALUES('alice','alice@example.org','one','disabled',1)")
        self.client = TestClient(backend.create_app(self.cfg), base_url="https://testserver")
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def token(self, **changes):
        claims = {"iss": self.cfg.access_issuer, "aud": self.cfg.access_aud, "exp": time.time() + 300, "email": "alice@example.org"}
        claims.update(changes)
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test-key"})

    def test_access_required_even_with_cookie_and_raw_email_header(self):
        good = {"Cf-Access-Jwt-Assertion": self.token()}
        response = self.client.get("/api/me", headers=good)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["auth_mode"], "cloudflare")
        self.assertEqual(self.client.get("/api/me").status_code, 401)
        self.assertEqual(self.client.get("/api/me", headers={"Cf-Access-Authenticated-User-Email": "alice@example.org"}).status_code, 401)
        for token in [self.token(aud="wrong"), self.token(iss="https://evil.test"), self.token(exp=0), self.token(email="not-allowed@example.org")]:
            self.assertIn(self.client.get("/api/me", headers={"Cf-Access-Jwt-Assertion": token}).status_code, (401, 403))
        claims = {"iss": self.cfg.access_issuer, "aud": self.cfg.access_aud, "exp": time.time()+100, "email": "alice@example.org"}
        forged = jwt.encode(claims, "attacker" * 8, algorithm="HS256", headers={"kid": "test-key"})
        self.assertEqual(self.client.get("/api/me", headers={"Cf-Access-Jwt-Assertion": forged}).status_code, 401)
        fake_rsa = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        forged = jwt.encode(claims, fake_rsa, algorithm="RS256", headers={"kid": "test-key"})
        self.assertEqual(self.client.get("/api/me", headers={"Cf-Access-Jwt-Assertion": forged}).status_code, 401)
        self.assertEqual(self.client.post("/api/login", json={"username": "alice@example.org", "password": "anything"}, headers={"Origin": "https://testserver"}).status_code, 403)

    def test_opt_in_registration_creates_personal_identity_and_preserves_isolation(self):
        self.cfg.access_self_registration = True
        first_headers = {"Cf-Access-Jwt-Assertion": self.token(email="new@example.org")}
        first = self.client.get("/api/me", headers=first_headers)
        self.assertEqual(first.status_code, 200, first.text)
        owner = first.json()["user"]
        self.assertEqual(owner["tenant"], "self-" + owner["id"])
        self.assertEqual(self.client.get("/api/me", headers=first_headers).json()["user"], owner)
        with backend.database(self.cfg.db) as db:
            db.execute("INSERT INTO jobs(id,user_id,tenant,action,status,created,result) VALUES(?,?,?,?,?,?,?)", ("owned-job", owner["id"], owner["tenant"], "chronology", "succeeded", time.time(), json.dumps({"text": "PRIVATE_OWNER_RESULT"})))
        other_headers = {"Cf-Access-Jwt-Assertion": self.token(email="other@example.org")}
        # A valid identity cannot use another identity's existing session.
        self.assertEqual(self.client.get("/api/jobs/owned-job", headers=other_headers).status_code, 401)
        second = self.client.get("/api/me", headers=other_headers).json()["user"]
        self.assertNotEqual(second["id"], owner["id"])
        self.assertNotEqual(second["tenant"], owner["tenant"])
        self.assertEqual(self.client.get("/api/jobs/owned-job", headers=other_headers).status_code, 404)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT password_hash FROM users WHERE id=?", (owner["id"],)).fetchone()[0], "disabled-password-login")

    def test_registration_requires_verified_jwt_even_when_opted_in(self):
        self.cfg.access_self_registration = True
        for headers in ({}, {"Cf-Access-Authenticated-User-Email": "new@example.org"}, {"Cf-Access-Jwt-Assertion": self.token(email="new@example.org", aud="wrong")}, {"Cf-Access-Jwt-Assertion": self.token(email="new@example.org", exp=0)}):
            self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 401)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM users").fetchone()[0], 1)

    def test_registration_does_not_restore_disabled_users_or_reserved_bans(self):
        self.cfg.access_self_registration = True
        alice_headers = {"Cf-Access-Jwt-Assertion": self.token()}
        self.assertEqual(self.client.get("/api/me", headers=alice_headers).status_code, 200)
        for email in ("alice@example.org", "blocked-before-registration@example.org"):
            with patch("sys.argv", ["manage.py", "--db", self.cfg.db, "disable-user", email]), redirect_stdout(io.StringIO()):
                manage.main()
            response = self.client.get("/api/me", headers={"Cf-Access-Jwt-Assertion": self.token(email=email)})
            self.assertEqual(response.status_code, 403)
            with backend.database(self.cfg.db) as db:
                row = db.execute("SELECT id,active FROM users WHERE username=?", (email,)).fetchone()
                self.assertEqual(row["active"], 0)
                self.assertEqual(db.execute("SELECT count(*) FROM sessions WHERE user_id=?", (row["id"],)).fetchone()[0], 0)

    def test_parallel_registration_reuses_one_identity(self):
        self.cfg.access_self_registration = True
        headers = {"Cf-Access-Jwt-Assertion": self.token(email="parallel@example.org")}
        clients = [TestClient(self.client.app, base_url="https://testserver") for _ in range(2)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda client: client.get("/api/me", headers=headers), clients))
        self.assertTrue(all(r.status_code == 200 for r in responses))
        self.assertEqual(responses[0].json()["user"], responses[1].json()["user"])
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM users WHERE username='parallel@example.org'").fetchone()[0], 1)


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        p = Path(self.temp.name)
        (p / "key").write_bytes(b"S" * 48)
        catalog = {"questions": [{"id": "Q1", "text": "Public?", "source_ids": ["S1"]}], "sources": DATA["sources"]}
        (p / "catalog.json").write_text(json.dumps(catalog))
        self.cfg = gateway.Settings(db=str(p / "gateway.db"), secret_file=str(p / "key"), model="test-model", provider_key="test-key", public_catalog=str(p / "catalog.json"))
        self.calls = []
        self.fail = False

        async def provider(cfg, payload):
            self.calls.append(payload)
            if self.fail:
                raise RuntimeError("secret provider detail")
            return {"text": "Public result", "model": cfg.model}

        self.client = TestClient(gateway.create_app(self.cfg, caller=provider))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def envelope(self, packet_id="packet1"):
        payload = {"model": "test-model", "max_tokens": 1600, "system": backend.PUBLIC_SYSTEM, "messages": [{"role": "user", "content": backend.canonical({"question": {"id": "Q1", "text": "Public?"}, "sources": DATA["sources"]}).decode()}]}
        value = {"version": 1, "packet_id": packet_id, "user_id": "alice", "tenant_id": "one", "expires_at": time.time()+300, "payload": payload, "hash": backend.digest(payload)}
        return self.sign(value)

    def sign(self, value):
        value.pop("signature", None)
        value["signature"] = hmac.new(b"S"*48, backend.canonical(value), hashlib.sha256).hexdigest()
        return value

    def test_signed_packet_replay_and_tamper(self):
        self.assertEqual(backend.PUBLIC_SYSTEM, gateway.PUBLIC_SYSTEM)
        packet = self.envelope()
        self.assertEqual(self.client.post("/v1/execute", json=packet).status_code, 200)
        self.assertEqual(self.client.post("/v1/execute", json=packet).status_code, 409)
        changed = self.envelope("packet2")
        changed["payload"]["max_tokens"] = 1
        self.assertEqual(self.client.post("/v1/execute", json=changed).status_code, 403)
        changed = self.envelope("packet3")
        changed["payload"]["tools"] = [{"name": "anything"}]
        changed["hash"] = backend.digest(changed["payload"])
        self.assertEqual(self.client.post("/v1/execute", json=self.sign(changed)).status_code, 403)
        changed = self.envelope("packet4")
        public = json.loads(changed["payload"]["messages"][0]["content"])
        public["question"]["text"] = "PRIVATE_CONTEXT"
        changed["payload"]["messages"][0]["content"] = backend.canonical(public).decode()
        changed["hash"] = backend.digest(changed["payload"])
        self.assertEqual(self.client.post("/v1/execute", json=self.sign(changed)).status_code, 403)
        self.assertEqual(len(self.calls), 1)

    def test_failed_provider_still_consumes_packet(self):
        self.fail = True
        packet = self.envelope()
        response = self.client.post("/v1/execute", json=packet)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("secret provider", response.text)
        self.assertEqual(self.client.post("/v1/execute", json=packet).status_code, 409)
        self.assertEqual(len(self.calls), 1)

    def test_reviewed_gateway_enforces_separate_opt_in_shape_model_and_replay(self):
        packet=self.envelope('reviewed')
        packet['version']=2
        packet['payload']['system']=backend.REVIEWED_SYSTEM
        packet['payload']['messages'][0]['content']=backend.canonical({'purpose':'Prüfen','text':'Öffentlicher Text.','classification':'user_confirmed_public'}).decode()
        packet['hash']=backend.digest(packet['payload']);self.sign(packet)
        self.assertEqual(self.client.post('/v1/execute',json=packet).status_code,403)
        self.cfg.reviewed_handoff_enabled=True
        for changes in [{'classification':'private'},{'history':[]},{'files':[]},{'text':'ü'*6001},{'purpose':' '},{'text':'x\x00y'}]:
            changed=json.loads(json.dumps(packet))
            content=json.loads(changed['payload']['messages'][0]['content']) | changes
            changed['payload']['messages'][0]['content']=backend.canonical(content).decode()
            changed['hash']=backend.digest(changed['payload']);self.sign(changed)
            self.assertEqual(self.client.post('/v1/execute',json=changed).status_code,403,changes.keys())
        changed=json.loads(json.dumps(packet));changed['payload']['model']='other-model'
        changed['hash']=backend.digest(changed['payload']);self.sign(changed)
        self.assertEqual(self.client.post('/v1/execute',json=changed).status_code,403)
        changed=json.loads(json.dumps(packet));changed['payload']['tools']=[]
        changed['hash']=backend.digest(changed['payload']);self.sign(changed)
        self.assertEqual(self.client.post('/v1/execute',json=changed).status_code,403)
        changed=json.loads(json.dumps(packet));changed['version']=1;self.sign(changed)
        self.assertEqual(self.client.post('/v1/execute',json=changed).status_code,403)
        self.assertEqual(self.calls,[])
        self.assertEqual(self.client.post('/v1/execute',json=packet).status_code,200)
        self.assertEqual(self.client.post('/v1/execute',json=packet).status_code,409)
        self.assertEqual(self.calls,[packet['payload']])

    def test_reviewed_failure_consumes_packet_without_retry_or_substitution(self):
        self.cfg.reviewed_handoff_enabled=True;self.fail=True
        packet=self.envelope('reviewed-failed');packet['version']=2
        packet['payload']['system']=backend.REVIEWED_SYSTEM
        packet['payload']['messages'][0]['content']=backend.canonical({'purpose':'Prüfen','text':'Öffentlicher Text.','classification':'user_confirmed_public'}).decode()
        packet['hash']=backend.digest(packet['payload']);self.sign(packet)
        self.assertEqual(self.client.post('/v1/execute',json=packet).status_code,502)
        self.assertEqual(self.client.post('/v1/execute',json=packet).status_code,409)
        self.assertEqual(len(self.calls),1)

    def test_provider_receives_exact_approved_bytes_at_fixed_endpoint(self):
        captured = {}

        class FakeHTTP:
            def __init__(self, **kwargs):
                captured["client"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def post(self, url, **kwargs):
                captured["url"], captured["request"] = url, kwargs
                return httpx.Response(200, json={"model":"test-model", "content": [{"type": "text", "text": "Public answer"}]}, request=httpx.Request("POST", url))

        packet = self.envelope()
        with patch("gateway.httpx.AsyncClient", FakeHTTP):
            result = asyncio.run(gateway.provider_call(self.cfg, packet["payload"]))
        self.assertEqual(result["text"], "Public answer")
        self.assertEqual(captured["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(hashlib.sha256(captured["request"]["content"]).hexdigest(), packet["hash"])
        self.assertFalse(captured["client"]["trust_env"])
        self.assertFalse(captured["client"]["follow_redirects"])
        self.assertNotIn(b"alice", captured["request"]["content"])

    def test_provider_model_mismatch_is_rejected_without_substitution(self):
        class FakeHTTP:
            def __init__(self, **kwargs): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def post(self, url, **kwargs):
                return httpx.Response(200,json={"model":"unexpected-model","content":[{"type":"text","text":"Answer"}]},request=httpx.Request('POST',url))
        with patch('gateway.httpx.AsyncClient',FakeHTTP):
            with self.assertRaises(ValueError):
                asyncio.run(gateway.provider_call(self.cfg,self.envelope()['payload']))


class InferenceResultTests(unittest.TestCase):
    def test_local_output_limit_is_reported(self):
        for reason, truncated in [("length", True), ("stop", False)]:
            class FakeHTTP:
                def __init__(self, **kwargs):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *args):
                    pass

                async def post(self, url, **kwargs):
                    return httpx.Response(200, json={"choices": [{"message": {"content": "Antwort"}, "finish_reason": reason}]}, request=httpx.Request("POST", url))

            with patch("backend.httpx.AsyncClient", FakeHTTP):
                result = asyncio.run(backend.local_inference(backend.Settings(), {}))
            self.assertEqual(result["truncated"], truncated)


if __name__ == "__main__":
    unittest.main()
