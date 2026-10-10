"""Synthetic SQLite/ASGI checks. No production DB, internet or model calls."""
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote
from fastapi.testclient import TestClient
import server

class PublicResearchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.db=Path(self.temp.name)/'decisions.db'
        with sqlite3.connect(self.db) as conn:
            conn.executescript("""
            CREATE TABLE decisions(decision_id TEXT PRIMARY KEY,court TEXT,canton TEXT,docket_number TEXT,
              decision_date TEXT,language TEXT,title TEXT,regeste TEXT,full_text TEXT,source_url TEXT,
              pdf_url TEXT,content_hash TEXT,scraped_at TEXT);
            CREATE VIRTUAL TABLE decisions_fts USING fts5(decision_id UNINDEXED,court,canton,docket_number,
              language,title,regeste,full_text,content=decisions,content_rowid=rowid,tokenize='unicode61 remove_diacritics 2');
            PRAGMA user_version=20261009;
            """)
            rows=[('bger_1C_123_2026','bger','CH','1C 123/2026','2026-10-01','de','Fiktiver Entscheid',None,
              'Äpfel. Rechtliches Gehör vor der Baubewilligung. '+'Fiktive Erwägung. '*500,
              'https://example.org/decision/1?exact=1','https://example.org/decision/1.pdf','a'*64,'2026-10-09'),
              ('vd_tc_2','vd_tc','VD','AC.2','2026-09-01','fr','Arrêt fictif',None,
              'Droit être entendu, permis construire. OR est ici un mot littéral.',
              'https://example.org/decision/2',None,'b'*64,'2026-10-09'),
              ('unsafe_url','bger','CH','3','2026-09-02','de',None,None,'Rechtliches Gehör <script>alert(1)</script>',
              'javascript:alert(1)','https://user:secret@example.org/no','c'*64,'2026-10-09')]
            conn.executemany('INSERT INTO decisions VALUES('+','.join('?'*13)+')',rows)
            conn.execute("INSERT INTO decisions_fts(decisions_fts) VALUES('rebuild')")
        self.before=hashlib.sha256(self.db.read_bytes()).hexdigest()
        self.app=server.create_app(server.Settings(self.db));self.client=TestClient(self.app)
    def tearDown(self):
        self.client.close();self.temp.cleanup()
    def test_real_fts_unicode_filters_limits_and_exact_metadata(self):
        r=self.client.post('/search',json={'query':'rechtliches Gehör','court':'bger','canton':'CH','language':'de','limit':1})
        self.assertEqual(r.status_code,200,r.text);result=r.json()
        self.assertEqual(len(result['results']),1);self.assertEqual(result['database_generation'],20261009)
        self.assertFalse(result['exhaustive']);self.assertEqual(result['query_mode'],'literal_terms')
        self.assertLessEqual(len(result['results'][0]['snippet']),1200)
        hit=self.client.post('/search',json={'query':'Baubewilligung'}).json()['results'][0]
        self.assertEqual(hit['source_url'],'https://example.org/decision/1?exact=1');self.assertEqual(hit['content_hash'],'a'*64)
        self.assertEqual(self.client.post('/search',json={'query':'être entendu','language':'fr'}).json()['results'][0]['decision_id'],'vd_tc_2')
    def test_fts_operators_and_sql_are_literals(self):
        self.assertEqual(server.literal_terms('a" OR * b:NEAR'),'"a" AND "OR" AND "b" AND "NEAR"')
        self.assertEqual([x['decision_id'] for x in self.client.post('/search',json={'query':'OR'}).json()['results']],['vd_tc_2'])
        r=self.client.post('/search',json={'query':"x'); DROP TABLE decisions;--"})
        self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['results'],[])
        self.assertEqual(self.client.get('/health').status_code,200)
    def test_rank_cursor_preserves_filtered_bm25_without_global_sort(self):
        # Several highly ranked foreign-language hits must not consume the
        # result limit before the exact metadata filter is applied.
        with sqlite3.connect(self.db) as conn:
            for index in range(8):
                language='fr' if index<5 else 'de'
                conn.execute('INSERT INTO decisions VALUES('+','.join('?'*13)+')',
                    (f'ranked_{index}','bger','CH',str(index),'2026-10-01',language,
                     'Rechtliches Gehör' if index==7 else 'Synthetic title',None,
                     'Rechtliches Gehör. '+'Kontext. '*index,
                     'https://example.org/ranked',None,'d'*64,'2026-10-09'))
            conn.execute("INSERT INTO decisions_fts(decisions_fts) VALUES('rebuild')")
            # A publisher's persistent custom rank must not silently alter this
            # service's established, unweighted BM25 relevance semantics.
            conn.execute("INSERT INTO decisions_fts(decisions_fts,rank) VALUES('rank','bm25(0,0,0,0,0,100,0,0)')")
            expected=conn.execute("""SELECT d.decision_id FROM decisions_fts
                JOIN decisions d ON d.rowid=decisions_fts.rowid
                WHERE decisions_fts MATCH ? AND d.language='de'
                ORDER BY bm25(decisions_fts) LIMIT 3""",
                (server.literal_terms('rechtliches gehör'),)).fetchall()
        statements=[]
        original_connect=sqlite3.connect
        def traced_connect(*args,**kwargs):
            conn=original_connect(*args,**kwargs)
            conn.set_trace_callback(statements.append)
            return conn
        with patch('server.sqlite3.connect',side_effect=traced_connect):
            response=self.client.post('/search',json={'query':'rechtliches gehör','language':'de','limit':3})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([row['decision_id'] for row in response.json()['results']],[row[0] for row in expected])
        select=next(sql for sql in statements if 'snippet(decisions_fts' in sql)
        with original_connect(self.db) as conn:
            plan=[row[3] for row in conn.execute('EXPLAIN QUERY PLAN '+select)]
        self.assertFalse(any('TEMP B-TREE' in detail for detail in plan),plan)
        self.assertTrue(all(row['language']=='de' for row in response.json()['results']))
        upper=self.client.post('/search',json={'query':'Rechtliches Gehör','language':'de','limit':3})
        self.assertEqual(upper.json()['results'],response.json()['results'])
    def test_narrow_input_and_body_limits(self):
        for body in [{'query':'*'},{'query':'x '*9},{'query':'x'*181},{'query':'Gehör','limit':9},
          {'query':'Gehör','limit':True},{'query':'Gehör','court':"bger' OR 1=1"},
          {'query':'Gehör','path':'/etc/passwd'},{'query':'Gehör','url':'http://localhost/private'}]:
            self.assertEqual(self.client.post('/search',json=body).status_code,422,body)
        self.assertEqual(self.client.post('/search',content='x'*4097).status_code,413)
    def test_exact_id_and_bounded_unicode_passage(self):
        r=self.client.get('/decisions/bger_1C_123_2026',params={'start':7,'length':20})
        self.assertEqual(r.status_code,200,r.text);p=r.json()['passage']
        self.assertEqual(p['text'],'Rechtliches Gehör vo');self.assertEqual(p['start'],7);self.assertEqual(p['end'],27)
        self.assertTrue(p['has_more']);self.assertEqual(p['locator_kind'],'unicode_character_offset')
        for params in [{'length':6001},{'start':-1},{'start':10000001}]:
            self.assertEqual(self.client.get('/decisions/bger_1C_123_2026',params=params).status_code,422)
        self.assertEqual(self.client.get('/decisions/missing').status_code,404)
        self.assertEqual(self.client.get('/decisions/not%20an%20id').status_code,404)
        ending=self.client.get('/decisions/vd_tc_2',params={'start':1000000}).json()['passage']
        self.assertEqual(ending['text'],'');self.assertEqual(ending['start'],ending['total_chars']);self.assertFalse(ending['has_more'])
    def test_urls_are_links_only_and_text_is_not_html(self):
        row=self.client.get('/decisions/unsafe_url').json()
        self.assertIsNone(row['source_url']);self.assertIsNone(row['pdf_url']);self.assertIn('<script>',row['passage']['text'])
        r=self.client.get('/decisions/unsafe_url')
        self.assertEqual(r.headers['x-content-type-options'],'nosniff');self.assertEqual(r.headers['cache-control'],'no-store')
    def test_public_identifiers_preserve_spaces_and_encoded_colons(self):
        ids=['ow_gerichte_VVGE 1976_77 Nr. 54','test_court:decision.2026-01','ow_gerichte_OGVE-2016-17-79.htm#']
        with sqlite3.connect(self.db) as conn:
            for identifier in ids:
                conn.execute('INSERT INTO decisions SELECT ?,court,canton,docket_number,decision_date,language,title,regeste,full_text,source_url,pdf_url,content_hash,scraped_at FROM decisions WHERE decision_id=?',
                    (identifier,'bger_1C_123_2026'))
        for identifier in ids:
            response=self.client.get('/decisions/'+quote(identifier,safe=''))
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['decision_id'],identifier)
        for identifier in ['bad/id','bad\\id','bad\x00id','bad\nid','x'*241]:
            self.assertIn(self.client.get('/decisions/'+quote(identifier,safe='')).status_code,[404,422])
    def test_read_only_and_atomic_replacement_visible(self):
        with self.app.state.service.connection() as conn:
            with self.assertRaises(sqlite3.OperationalError):conn.execute('DELETE FROM decisions')
        self.client.post('/search',json={'query':'Gehör'})
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).hexdigest(),self.before)
        self.assertFalse(Path(str(self.db)+'-journal').exists())
        new=self.db.with_name('new.db');new.write_bytes(self.db.read_bytes())
        with sqlite3.connect(new) as conn:conn.execute('PRAGMA user_version=20261010')
        new.replace(self.db);self.assertEqual(self.client.get('/health').json()['database_generation'],20261010)
    def test_capacity_and_errors_are_safe(self):
        slots=self.app.state.service.slots;self.assertTrue(slots.acquire(False));self.assertTrue(slots.acquire(False))
        try:self.assertEqual(self.client.post('/search',json={'query':'Gehör'}).status_code,429)
        finally:slots.release();slots.release()
        missing=TestClient(server.create_app(server.Settings(self.db.with_name('secret-path.db'))))
        r=missing.get('/health');self.assertEqual(r.status_code,503);self.assertNotIn('secret-path',r.text);missing.close()
    def test_sqlite_deadline_interrupts_work(self):
        with patch('server.time.monotonic',side_effect=[0]+[100]*1000):
            with self.assertRaises(server.QueryTimedOut):
                with self.app.state.service.connection() as conn:
                    conn.execute('WITH RECURSIVE counter(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM counter WHERE x<1000000) SELECT sum(x) FROM counter').fetchone()
        self.assertEqual(self.client.get('/health').status_code,200)
    def test_no_outbound_connection_or_provider_key_needed(self):
        with patch('socket.socket.connect',side_effect=AssertionError('Unexpected network egress')):
            self.assertEqual(self.client.post('/search',json={'query':'Gehör'}).status_code,200)
            self.assertEqual(self.client.get('/decisions/bger_1C_123_2026').status_code,200)

if __name__=='__main__':unittest.main()
