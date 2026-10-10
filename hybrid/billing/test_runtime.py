"""Real ASGI/SQLite boundary tests with synthetic accounts and fake providers."""
import asyncio
from dataclasses import replace
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import time
import unittest
from fastapi.testclient import TestClient
import backend
import gateway
from billing.ledger import Ledger
from billing.runtime import BillingConfig, BillingRuntime
from billing.tariffs import BillingError, CONFIRMED_CHF_TARIFF as TARIFF


class ReadyCheckout:
    def _account(self):
        pass

    def _ready(self):
        pass


class GatewayBillingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.secret = b'synthetic-key-' * 4
        (self.root / 'key').write_bytes(self.secret)
        (self.root / 'catalog').write_text('{"questions":[],"sources":[]}')
        self.ledger = Ledger(self.root / 'money.sqlite')
        self.bc = BillingConfig(required=True, enabled=True)
        self.runtime = BillingRuntime(self.bc, self.ledger, ReadyCheckout())
        self.cfg = gateway.Settings(db=str(self.root / 'replay.sqlite'), secret_file=str(self.root / 'key'),
            public_catalog=str(self.root / 'catalog'), model=TARIFF.model, provider_key='synthetic',
            reviewed_handoff_enabled=True, billing=self.bc)
        self.calls, self.fail, self.missing_usage, self.overrun = [], False, False, False
        async def provider(cfg, payload):
            self.calls.append(payload)
            if self.fail:
                raise ValueError('synthetic secret must never escape')
            return {'text':'Öffentliche Prüfung.', 'model':cfg.model, 'truncated':False,
                    'usage': None if self.missing_usage else {'input_tokens':999999 if self.overrun else 100, 'output_tokens':200},
                    'provider_message_id':'msg_synthetic', 'provider_request_id':'req_synthetic'}
        self.client = TestClient(gateway.create_app(self.cfg, caller=provider, billing_runtime=self.runtime))
        self.client.__enter__()
        self.ledger.create_purchase('alice','one',purchase_id='buy1',minor_amount=2000,stripe_account='acct_test',live=False)
        self.ledger.bind_checkout('buy1','cs_test')
        self.ledger.credit_verified_checkout(event_id='evt_test',account='acct_test',live=False,session={
            'id':'cs_test','payment_intent':'pi_test','amount_total':2000,'currency':'chf',
            'client_reference_id':'buy1','mode':'payment','payment_status':'paid','status':'complete','livemode':False})

    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.temp.cleanup()

    def signed(self, value):
        return value | {'signature':hmac.new(self.secret,gateway.canonical(value),hashlib.sha256).hexdigest()}

    def command(self, action, data=None, owner='alice', tenant='one'):
        value={'domain':'courtos.billing.v1','user_id':owner,'tenant_id':tenant,
               'expires_at':time.time()+60,'action':action,'data':data or {}}
        return self.client.post('/v1/billing',json=self.signed(value))

    def envelope(self):
        content={'text':'Öffentliche Quelle und Äusserung.','purpose':'Prüfen','classification':'user_confirmed_public'}
        payload={'model':TARIFF.model,'max_tokens':1600,'system':gateway.REVIEWED_SYSTEM,
                 'messages':[{'role':'user','content':gateway.canonical(content).decode()}]}
        return {'version':2,'packet_id':'packet1','user_id':'alice','tenant_id':'one','expires_at':time.time()+600,
                'payload':payload,'hash':hashlib.sha256(gateway.canonical(payload)).hexdigest()}

    def approved(self):
        envelope=self.envelope()
        response=self.command('quote',{k:envelope[k] for k in ('packet_id','hash','payload')})
        self.assertEqual(response.status_code,200,response.text)
        q=response.json()
        envelope['billing']={'quote_id':q['quote_id'],'max_charge_micros':q['max_charge_micros'],'currency':'chf'}
        return envelope,q

    def execute(self, envelope):
        return self.client.post('/v1/execute',json=self.signed(envelope))

    def test_quote_full_utf8_local_only_and_iso_expiry(self):
        envelope,q=self.approved()
        self.assertEqual(q['input_allowance_tokens'],len(gateway.canonical(envelope['payload'])))
        self.assertIn('+00:00',q['expires_at'])
        self.assertTrue(q['vat_included'])
        self.assertEqual(self.calls,[])
        self.assertEqual(self.ledger.balance('alice','one')['held_micros'],0)

    def test_required_disabled_blocks_even_valid_signed_packet(self):
        self.runtime.cfg=replace(self.bc,enabled=False)
        self.assertEqual(self.client.get('/health').status_code,503)
        self.assertEqual(self.execute(self.envelope()).status_code,503)
        self.assertEqual(self.calls,[])

    def test_no_quote_wrong_owner_changed_ceiling_fail_before_provider(self):
        self.assertNotEqual(self.execute(self.envelope()).status_code,200)
        env,q=self.approved()
        env['billing']['max_charge_micros']+=1
        self.assertEqual(self.execute(env).status_code,409)
        env['billing']['max_charge_micros']-=1
        env['user_id']='bob'
        self.assertEqual(self.execute(env).status_code,404)
        self.assertEqual(self.calls,[])

    def test_paid_settlement_and_reply_recovery_never_repeat_provider(self):
        env,q=self.approved()
        first=self.execute(env)
        self.assertEqual(first.status_code,200,first.text)
        receipt=first.json()['billing']
        self.assertEqual(receipt['charged_micros'],13200)
        self.assertEqual(receipt['reserved_micros'],q['max_charge_micros'])
        self.assertEqual(self.ledger.balance('alice','one')['held_micros'],0)
        self.assertEqual(self.execute(env).json(),first.json())
        recovered=self.command('result',{'packet_id':'packet1'}).json()['result']
        self.assertEqual(recovered,first.json())
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.command('result',{'packet_id':'packet1'},owner='bob').status_code,404)

    def test_operator_absorbs_usage_above_accepted_contractual_cap(self):
        env,q=self.approved();self.overrun=True
        receipt=self.execute(env).json()['billing']
        self.assertEqual(receipt['charged_micros'],q['max_charge_micros'])
        self.assertEqual(receipt['released_micros'],0)

    def test_provider_failure_and_missing_usage_release_no_debit_no_retry(self):
        for missing in (False,True):
            with self.subTest(missing=missing):
                if missing:
                    # Separate isolated database/packet from the failure case.
                    self.tearDown();self.setUp()
                env,q=self.approved();self.fail=not missing;self.missing_usage=missing
                r=self.execute(env)
                self.assertEqual(r.status_code,502)
                self.assertNotIn('synthetic secret',r.text)
                self.assertEqual(self.ledger.balance('alice','one')['balance_micros'],20000000)
                self.assertEqual(self.ledger.balance('alice','one')['held_micros'],0)
                outcome=self.command('result',{'packet_id':'packet1'}).json()
                self.assertEqual(outcome['billing']['charged_micros'],0)
                self.assertEqual(outcome['billing']['released_micros'],q['max_charge_micros'])
                self.assertEqual(self.execute(env).status_code,409)
                self.assertEqual(len(self.calls),1)

    def test_signed_command_domain_and_identity_not_client_forgable(self):
        r=self.client.post('/v1/billing',json={'action':'status','user_id':'alice'})
        self.assertEqual(r.status_code,403)
        self.assertEqual(self.command('status',owner='bob').json()['balance_micros'],0)

    def test_restart_releases_inflight_without_debit_or_replay(self):
        env,q=self.approved()
        self.runtime.approve('alice','one',{k:env[k] for k in ('packet_id','hash','billing')})
        self.assertTrue(self.ledger.claim_dispatch('alice','one',q['quote_id']))
        self.runtime.startup()
        self.assertEqual(self.ledger.balance('alice','one')['held_micros'],0)
        self.assertEqual(self.ledger.balance('alice','one')['balance_micros'],20000000)
        self.assertEqual(self.execute(env).status_code,409)
        self.assertEqual(self.calls,[])

    def test_expired_preview_renewal_does_not_revalidate_old_acceptance(self):
        now=int(time.time()); self.ledger.clock=lambda:now
        env,q=self.approved()
        self.ledger.clock=lambda:now+601
        fresh=self.command('quote',{k:env[k] for k in ('packet_id','hash','payload')}).json()
        self.assertNotEqual(fresh['quote_id'],q['quote_id'])
        self.assertEqual(self.execute(env).status_code,404)


if __name__=='__main__':
    unittest.main()

class BackendBillingTests(unittest.TestCase):
    """Authenticated real FastAPI routes joined to the real gateway boundary."""
    def setUp(self):
        self.g = GatewayBillingTests()
        self.g.setUp()
        self.root = self.g.root
        data={'documents':[], 'sources':[], 'questions':[]}
        (self.root/'data.json').write_text(json.dumps(data))
        self.cfg=backend.Settings(db=str(self.root/'app.sqlite'),data=str(self.root/'data.json'),
            secret_file=str(self.root/'key'),origin='https://testserver',base_path='',auth_mode='password',
            reviewed_handoff_enabled=True,external_enabled=True,external_model=TARIFF.model,
            billing_required=True,billing_enabled=True)
        backend.ensure_schema(self.cfg.db)
        encoded=backend.password_hash('a-long-test-password')
        with backend.database(self.cfg.db) as db:
            for owner,tenant in [('alice','one'),('bob','two')]:
                db.execute('INSERT INTO users VALUES(?,?,?,?,1)',(owner,owner,tenant,encoded))
        self.lose_reply=False
        async def billing_call(cfg,secret,u,action,data):
            r=self.g.command(action,data,owner=u['id'],tenant=u['tenant'])
            if r.status_code!=200:
                raise backend.HTTPException(r.status_code,r.json()['error'])
            return r.json()
        async def external_call(cfg,envelope):
            r=self.g.client.post('/v1/execute',json=envelope)
            if r.status_code!=200 or self.lose_reply:
                raise ValueError('safe fake transport failure')
            return r.json()
        self.app=backend.create_app(self.cfg,gateway_caller=external_call,billing_caller=billing_call)
        self.client=TestClient(self.app,base_url='https://testserver');self.client.__enter__()
        self.headers=self.login('alice')

    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.g.tearDown()

    def login(self,owner):
        r=self.client.post('/api/login',json={'username':owner,'password':'a-long-test-password'},headers={'Origin':self.cfg.origin})
        self.assertEqual(r.status_code,200)
        return {'Origin':self.cfg.origin,'X-CSRF-Token':r.json()['csrf']}

    def packet(self):
        r=self.client.post('/api/packets/reviewed',json={'text':'Öffentliche Quelle.','purpose':'Prüfen','acknowledge_public':True},headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        return r.json()

    def quote(self,p):
        r=self.client.post('/api/packets/'+p['id']+'/quote',json={'hash':p['hash']},headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        return r.json()

    def send(self,p,q):
        return self.client.post('/api/packets/'+p['id']+'/send',headers=self.headers,json={'hash':p['hash'],
            'billing':{'quote_id':q['quote_id'],'max_charge_micros':q['max_charge_micros'],'currency':'chf'}})

    def poll(self,job):
        for _ in range(30):
            r=self.client.get('/api/jobs/'+job).json()
            if r['status'] in ('failed','succeeded'):
                return r
            time.sleep(.01)
        self.fail('fake job did not finish')

    def test_auth_csrf_owner_and_no_quote_enforced(self):
        p=self.packet();q=self.quote(p)
        self.assertEqual(self.client.post('/api/packets/'+p['id']+'/quote',json={'hash':p['hash']}).status_code,403)
        self.assertEqual(self.client.post('/api/packets/'+p['id']+'/send',headers=self.headers,json={'hash':p['hash']}).status_code,422)
        self.headers=self.login('bob')
        self.assertEqual(self.send(p,q).status_code,404)
        self.assertEqual(self.g.calls,[])
        self.assertEqual(self.client.get('/api/billing').json()['balance_micros'],0)

    def test_insufficient_credit_reserves_neither_daily_job_nor_provider(self):
        self.headers=self.login('bob');p=self.packet();q=self.quote(p)
        self.assertEqual(self.send(p,q).status_code,402)
        with backend.database(self.cfg.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM jobs').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT status FROM packets WHERE id=?',(p['id'],)).fetchone()[0],'prepared')
        self.assertEqual(self.g.calls,[])

    def test_success_actual_receipt_and_lost_http_reply_recoverable(self):
        p=self.packet();q=self.quote(p);self.lose_reply=True
        response=self.send(p,q)
        self.assertEqual(response.status_code,200,response.text)
        result=self.poll(response.json()['id'])
        self.assertEqual(result['status'],'succeeded')
        self.assertEqual(result['result']['billing']['charged_micros'],13200)
        self.assertEqual(len(self.g.calls),1)
        self.assertEqual(self.send(p,q).status_code,409)

    def test_failed_job_reports_only_confirmed_zero_charge_release(self):
        p=self.packet();q=self.quote(p);self.g.fail=True
        r=self.send(p,q);result=self.poll(r.json()['id'])
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['billing']['charged_micros'],0)
        self.assertIs(result['billing']['vat_included'],True)
        self.assertEqual(result['billing']['released_micros'],q['max_charge_micros'])
        self.assertEqual(self.client.get('/api/billing').json()['available_micros'],20000000)

    def test_required_disabled_never_uses_legacy_free_path(self):
        self.cfg.billing_enabled=False
        p=self.packet()
        r=self.client.post('/api/packets/'+p['id']+'/send',headers=self.headers,json={'hash':p['hash']})
        self.assertEqual(r.status_code,503)
        self.assertEqual(self.client.get('/api/billing').json(),{'required':True,'enabled':False})
        self.assertEqual(self.g.calls,[])

    def test_daily_admission_failure_releases_hold_without_model(self):
        p=self.packet();q=self.quote(p);self.cfg.frontier_daily_user_limit=0
        r=self.send(p,q)
        self.assertEqual(r.status_code,429)
        self.assertEqual(self.g.ledger.balance('alice','one')['held_micros'],0)
        self.assertEqual(self.g.calls,[])


    def test_expired_packet_explicit_quote_refresh_requires_new_acceptance(self):
        p=self.packet();q=self.quote(p)
        with backend.database(self.cfg.db) as db:
            db.execute("UPDATE packets SET expires=? WHERE id=?", (time.time()-1,p['id']))
        with self.g.ledger.transaction() as db:
            db.execute("UPDATE quotes SET expires=? WHERE id=?", (int(time.time())-1,q['quote_id']))
        fresh=self.quote(p)
        self.assertNotEqual(fresh['quote_id'],q['quote_id'])
        self.assertEqual(self.send(p,q).status_code,404)
        r=self.send(p,fresh)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.poll(r.json()['id'])['status'],'succeeded')
