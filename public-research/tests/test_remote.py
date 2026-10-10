"""Mocked official transport; no corpus, credentials, internet or model call."""
import asyncio
from copy import deepcopy
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx
import server
from remote import RemotePublicResearch, RemoteUnavailable, ORIGIN, MAX_RESPONSE_BYTES

ID = "ow_gerichte_VVGE 1976_77 Nr. 54"
META = {"decision_id":ID,"court":"ow_gerichte","canton":"OW","language":"de","title":"Synthetischer Entscheid",
        "source_url":"https://example.org/original","pdf_url":None,"content_hash":"a"*64,"scraped_at":"2026-10-10"}
SEARCH = {"results":[{**META,"snippet":"Rechtliches Gehör","snippet_truncated":False}],"query_mode":"literal_terms",
          "exhaustive":False,"database_generation":20261010,"model_calls":False}
DETAIL = {**META,"database_generation":20261010,"model_calls":False,
          "passage":{"start":1,"end":4,"text":"é😀b","total_chars":6,"has_more":True,"locator_kind":"unicode_character_offset"}}

class RemoteTests(unittest.IsolatedAsyncioTestCase):
    def service(self, result, status=200):
        self.requests=[]
        def handle(request):
            self.requests.append(request)
            return httpx.Response(status,json=result)
        return RemotePublicResearch(2,server.literal_terms,server.public_url,transport=httpx.MockTransport(handle))

    async def test_public_query_only_in_fixed_origin_post_body(self):
        service=self.service(SEARCH)
        with patch('server.sqlite3.connect', side_effect=AssertionError('No local database allowed')):
            response=await service.search(server.SearchInput(query="rechtliches Gehör",language="de",limit=1))
        request=self.requests[0]
        self.assertEqual(str(request.url),ORIGIN+'/search');self.assertEqual(request.method,'POST')
        self.assertIn('Gehör',request.content.decode());self.assertNotIn('Gehör',str(request.url))
        for name in ['authorization','cookie','cf-access-jwt-assertion','x-user-id','referer']:
            self.assertNotIn(name,request.headers)
        self.assertEqual(response['results'][0]['decision_id'],ID);self.assertEqual(response['results'][0]['source_url'],META['source_url'])
        self.assertEqual(response['database_generation'],20261010);self.assertFalse(response['model_calls'])

    async def test_exact_id_unicode_offsets_and_safe_metadata(self):
        service=self.service({**DETAIL,'source_url':'javascript:alert(1)','pdf_url':'https://user:secret@example.org','unknown_secret':'hidden'})
        value=await service.decision(ID,1,3)
        self.assertEqual(value['passage']['text'],'é😀b');self.assertEqual(value['passage']['end'],4)
        self.assertIsNone(value['source_url']);self.assertIsNone(value['pdf_url']);self.assertNotIn('unknown_secret',value)
        self.assertEqual(str(self.requests[0].url),ORIGIN+'/decisions/ow_gerichte_VVGE%201976_77%20Nr.%2054?start=1&length=3')

    async def test_literal_hash_id_roundtrip_and_explicit_candidate_scope(self):
        identifier='ow_gerichte_OGVE-2016-17-79.htm#'
        value=await self.service({**DETAIL,'decision_id':identifier}).decision(identifier,1,3)
        self.assertEqual(value['decision_id'],identifier)
        self.assertEqual(self.requests[0].url.fragment,'')
        self.assertIn('79.htm%23?start=',str(self.requests[0].url))
        scope={'ranking':'bm25_within_rowid_window','candidate_limit':256,'candidates_examined':200}
        result=await self.service({**SEARCH,**scope}).search(server.SearchInput(query='Gehör'))
        self.assertEqual({k:result[k] for k in scope},scope)
        for invalid in [{'candidate_limit':False},{'candidates_examined':257},{'ranking':'<html>'}]:
            with self.assertRaises(RemoteUnavailable):await self.service({**SEARCH,**scope,**invalid}).search(server.SearchInput(query='Gehör'))

    async def test_mismatched_id_and_inconsistent_passages_fail_closed(self):
        variants=[{**DETAIL,'decision_id':'different'}, {**DETAIL,'model_calls':True}]
        for change in [{'start':0},{'end':5},{'has_more':False},{'locator_kind':'page'},{'total_chars':False},{'text':'too long'}]:
            variants.append({**DETAIL,'passage':{**DETAIL['passage'],**change}})
        for value in variants:
            with self.subTest(value=value),self.assertRaises(RemoteUnavailable):
                await self.service(value).decision(ID,1,3)

    async def test_empty_end_and_not_found_preserve_semantics(self):
        result={**DETAIL,'passage':{'start':6,'end':6,'text':'','total_chars':6,'has_more':False,'locator_kind':'unicode_character_offset'}}
        self.assertFalse((await self.service(result).decision(ID,99,3))['passage']['has_more'])
        self.assertIsNone(await self.service({},404).decision(ID,0,3))

    async def test_search_rejects_models_filters_duplicates_and_oversized_rows(self):
        variants=[{**SEARCH,'model_calls':True},{**SEARCH,'query_mode':'hybrid'},{**SEARCH,'exhaustive':True},
                  {**SEARCH,'results':SEARCH['results']*2}, {**SEARCH,'results':[{**SEARCH['results'][0],'language':'fr'}]}]
        missing=deepcopy(SEARCH);del missing['model_calls'];variants.append(missing)
        for value in variants:
            with self.subTest(value=value),self.assertRaises(RemoteUnavailable):
                await self.service(value).search(server.SearchInput(query='Gehör',language='de',limit=1))

    async def test_invalid_query_and_id_do_not_reach_network(self):
        service=self.service(SEARCH)
        for query in ['*','x '*9,'x'*61]:
            with self.assertRaises(ValueError):await service.search(server.SearchInput(query=query))
        with self.assertRaises(ValueError):await service.decision('bad/id',0,3)
        self.assertEqual(self.requests,[])

    async def test_bounded_response_redirect_errors_timeout_and_slot_release(self):
        for response in [httpx.Response(302,headers={'Location':'https://evil.example'}),
                         httpx.Response(200,headers={'Content-Length':str(MAX_RESPONSE_BYTES+1)},json=SEARCH),
                         httpx.Response(200,content=b'x'*(MAX_RESPONSE_BYTES+1),headers={'Content-Type':'application/json'}),
                         httpx.Response(200,content=b'not json',headers={'Content-Type':'application/json'}),
                         httpx.Response(200,content=b'<html>private</html>',headers={'Content-Type':'text/html'})]:
            calls=[]
            def handle(request):calls.append(request);return response
            service=RemotePublicResearch(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(handle))
            with self.assertRaises(RemoteUnavailable):await service.search(server.SearchInput(query='Gehör'))
            self.assertEqual(len(calls),1);self.assertTrue(service.slots.acquire(False));service.slots.release()
        async def slow(_request):await asyncio.sleep(1);return httpx.Response(200,json=SEARCH)
        service=RemotePublicResearch(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(slow))
        with patch('remote.TOTAL_TIMEOUT_SECONDS',.01):
            with self.assertRaises(RemoteUnavailable) as error:await service.search(server.SearchInput(query='Gehör'))
        self.assertEqual(error.exception.code,'public_research_timeout');self.assertTrue(service.slots.acquire(False))

    async def test_upstream_errors_expose_only_fixed_codes(self):
        for status,result,code in [(429,{'detail':'private'},'public_research_busy'),(503,{'code':'public_research_timeout','detail':'private'},'public_research_timeout'),(503,{'code':'private','detail':'private'},'public_research_unavailable')]:
            with self.assertRaises(RemoteUnavailable) as error:await self.service(result,status).search(server.SearchInput(query='Gehör'))
            self.assertEqual(str(error.exception),code)

    async def test_health_and_capacity(self):
        service=self.service({'status':'ready','read_only':True,'query_mode':'literal_terms','model_calls':False,'database_generation':None})
        self.assertEqual((await service.health())['source'],'opencaselaw_public_api')
        service.slots.acquire(False);service.slots.acquire(False)
        with self.assertRaises(RemoteUnavailable) as error:await service.health()
        self.assertEqual(error.exception.code,'public_research_busy')

class RemoteRouteTests(unittest.TestCase):
    def test_environment_mode_has_no_sqlite_and_keeps_input_guard(self):
        app=server.create_app(server.Settings(Path('/nonexistent/unused.db'),mode='opencaselaw'))
        self.assertIsInstance(app.state.service,RemotePublicResearch)
        calls=[]
        def handle(request):calls.append(request);return httpx.Response(200,json=SEARCH)
        app.state.service.transport=httpx.MockTransport(handle)
        with patch('server.sqlite3.connect',side_effect=AssertionError('Unexpected localDB')),TestClient(app) as client:
            self.assertEqual(client.post('/search',json={'query':'Gehör'}).status_code,200)
            self.assertEqual(client.post('/search',json={'query':'Gehör','owner':'private'}).status_code,422)
            self.assertEqual(client.post('/search',json={'query':'*'}).status_code,422)
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
