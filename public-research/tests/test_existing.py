"""Existing API adaptation with mocked transport: no external or model calls."""
import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
import server
from existing import ExistingOpenCaseLaw, ORIGIN, MCP_ORIGIN, RPC_ID, DECISION_MAX_BYTES
from remote import RemoteUnavailable

ID = 'ow_gerichte_OGVE-2016-17-79.htm#'
ROW = {'decision_id':ID,'court':'ow_gerichte','canton':'OW','language':'de','title':'Synthetischer Entscheid',
       'source_url':'https://example.org/original','snippet':'Rechtliches <mark>Gehör</mark>. <script>Text</script>'}
SEARCH = {'results':[ROW],'total':1,'returned':1,'has_more':False}

def envelope(value, **changes):
    return {'jsonrpc':'2.0','id':RPC_ID,'result':{'structuredContent':value},**changes}


class ExistingTests(unittest.IsolatedAsyncioTestCase):
    def service(self, payload, status=200):
        self.requests=[]
        def handle(request):
            self.requests.append(request)
            return httpx.Response(status,json=envelope(payload) if request.method=='POST' else payload)
        return ExistingOpenCaseLaw(2,server.literal_terms,server.public_url,transport=httpx.MockTransport(handle))

    async def test_fixed_public_post_minimal_arguments_unknown_model_usage(self):
        service=self.service(SEARCH)
        result=await service.search(server.SearchInput(query='Rechtliches Gehör',language='de',limit=1))
        request=self.requests[0]
        self.assertEqual(str(request.url),MCP_ORIGIN)
        self.assertEqual(request.method,'POST')
        self.assertEqual(json.loads(request.content),{'jsonrpc':'2.0','id':RPC_ID,'method':'tools/call','params':{'name':'search_decisions','arguments':{'query':'Rechtliches Gehör','language':'de','limit':1,'fields':'full','include_pinpoint':False}}})
        for name in ['authorization','cookie','cf-access-jwt-assertion','x-user-id','referer']:
            self.assertNotIn(name,request.headers)
        self.assertEqual(result['query_mode'],'opencaselaw_ai');self.assertTrue(result['ai_assisted'])
        self.assertIsNone(result['model_calls']);self.assertIsNone(result['database_generation'])
        self.assertIsNone(result['results'][0]['content_hash']);self.assertIsNone(result['results'][0]['scraped_at'])
        self.assertEqual(result['results'][0]['snippet'],'Rechtliches Gehör. <script>Text</script>')

    async def test_health_never_searches_or_fetches_anything(self):
        result=await self.service(SEARCH).health()
        self.assertEqual(result['status'],'ready');self.assertFalse(result['upstream_checked'])
        self.assertTrue(result['ai_assisted']);self.assertIsNone(result['model_calls']);self.assertEqual(self.requests,[])

    async def test_sse_uses_matching_result_without_waiting_for_stream_close(self):
        wire=('event: message\r\ndata: '+json.dumps({'jsonrpc':'2.0','method':'notifications/progress','params':{}})+'\r\n\r\n'
              +'data: '+json.dumps(envelope({'results':[]},id='different'))+'\n\n'
              +'event: message\ndata: '+json.dumps(envelope(SEARCH),ensure_ascii=False)+'\n\n').encode()
        boundary=wire.index('ö'.encode())+1
        class Stream(httpx.AsyncByteStream):
            closed=False
            async def __aiter__(self):
                yield wire[:boundary];yield wire[boundary:]
                raise AssertionError('Must stop at completed event, not await SSE EOF')
            async def aclose(self):self.closed=True
        stream=Stream()
        service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(lambda request:httpx.Response(200,stream=stream,headers={'Content-Type':'text/event-stream'})))
        result=await service.search(server.SearchInput(query='Gehör'))
        self.assertEqual(result['results'][0]['decision_id'],ID);self.assertTrue(stream.closed)

    async def test_mcp_response_id_errors_and_missing_structured_data_fail_closed(self):
        for value in [envelope(SEARCH,id='wrong'),{'jsonrpc':'2.0','id':RPC_ID,'error':{'message':'raw private error'}},
                      {'jsonrpc':'2.0','id':RPC_ID,'result':{'content':[{'type':'text','text':'raw'}]}},
                      {'jsonrpc':'2.0','id':RPC_ID,'result':{'structuredContent':SEARCH,'isError':True}}]:
            service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(lambda request:httpx.Response(200,json=value)))
            with self.assertRaises(RemoteUnavailable):await service.search(server.SearchInput(query='Gehör'))

    async def test_exact_hash_id_and_unicode_passage_without_invented_metadata(self):
        text='É😀. Rechtliches Gehör.'
        result=await self.service({**ROW,'full_text':text,'private_unknown':'hidden'}).decision(ID,1,5)
        self.assertEqual(str(self.requests[0].url),ORIGIN+'/decisions/ow_gerichte_OGVE-2016-17-79.htm%23?full_text=true')
        self.assertEqual(self.requests[0].url.fragment,'')
        self.assertEqual(result['passage'],{'start':1,'end':6,'text':text[1:6],'total_chars':len(text),'has_more':True,'locator_kind':'unicode_character_offset'})
        self.assertNotIn('private_unknown',result);self.assertIsNone(result['content_hash'])
        eof=await self.service({**ROW,'full_text':text}).decision(ID,1000,5)
        self.assertEqual(eof['passage']['text'],'');self.assertEqual(eof['passage']['start'],len(text));self.assertFalse(eof['passage']['has_more'])

    async def test_rejects_alias_resolution_missing_or_explicitly_truncated_text(self):
        for value in [{**ROW,'decision_id':'alias','full_text':'text'},ROW,{**ROW,'full_text':None},
                      {**ROW,'full_text':'','text_available':False},
                      {**ROW,'full_text':'text','full_text_truncated':True},{**ROW,'full_text':'text','truncated':True}]:
            with self.subTest(value=value),self.assertRaises(RemoteUnavailable):
                await self.service(value).decision(ID,0,5)
        self.assertIsNone(await self.service({},404).decision(ID,0,5))

    async def test_source_warnings_preserved_as_plain_text(self):
        result=await self.service({**ROW,'full_text':'Text','date_is_estimated':True,'source_defect':{'note':'<b>Recovered source</b>','unknown':'drop'}}).decision(ID,0,5)
        self.assertTrue(result['date_is_estimated']);self.assertEqual(result['source_note'],'<b>Recovered source</b>')
        self.assertNotIn('source_defect',result)

    async def test_search_filters_duplicates_errors_and_limits_fail_closed(self):
        values=[{**SEARCH,'results':[ROW,ROW]},{'results':[{**ROW,'language':'fr'}]},
                {'results':[{'decision_id':'bad/id'}]},{'results':'bad'},
                {'error':'private','_is_error':True},{'_is_error':True},
                {'results':[{**ROW,'snippet':123}]}]
        for value in values:
            with self.subTest(value=value),self.assertRaises(RemoteUnavailable):
                await self.service(value).search(server.SearchInput(query='Gehör',language='de',limit=1))

    async def test_snippet_caps_safe_links_and_degraded_ranking_remain_explicit(self):
        result=await self.service({'results':[{**ROW,'snippet':'ü'*1500,'source_url':'javascript:alert(1)','pdf_url':'https://user:secret@example.org'}],'degraded':True}).search(server.SearchInput(query='Gehör'))
        self.assertTrue(result['degraded']);self.assertFalse(result['exhaustive'])
        self.assertEqual(len(result['results'][0]['snippet']),1200);self.assertTrue(result['results'][0]['snippet_truncated'])
        self.assertIsNone(result['results'][0]['source_url']);self.assertIsNone(result['results'][0]['pdf_url'])

    async def test_guard_rejects_invalid_input_before_network(self):
        service=self.service(SEARCH)
        for query in ['*','x '*9,'x'*61]:
            with self.assertRaises(ValueError):await service.search(server.SearchInput(query=query))
        for identifier in ['bad/id','bad\nother']:
            with self.assertRaises(ValueError):await service.decision(identifier,0,3)
        self.assertEqual(self.requests,[])

    async def test_bounded_transport_rejects_oversize_html_redirect_and_compression(self):
        for response in [httpx.Response(302,headers={'Location':'https://other.example'}),
                         httpx.Response(200,json=SEARCH,headers={'Content-Length':str(DECISION_MAX_BYTES+1)}),
                         httpx.Response(200,content=b'x'*(DECISION_MAX_BYTES+1),headers={'Content-Type':'application/json'}),
                         httpx.Response(200,json=SEARCH,headers={'Content-Encoding':'custom'}),
                         httpx.Response(200,content=b'<html>private</html>',headers={'Content-Type':'text/html'}),
                         httpx.Response(200,content=b'not json',headers={'Content-Type':'application/json'})]:
            calls=[]
            def handle(request):calls.append(request);return response
            service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(handle))
            with self.assertRaises(RemoteUnavailable):await service.decision(ID,0,3)
            self.assertEqual(len(calls),1);self.assertTrue(service.slots.acquire(False));service.slots.release()

    async def test_timeout_has_no_retry_and_releases_slot(self):
        calls=[]
        async def slow(request):calls.append(request);await asyncio.sleep(1);return httpx.Response(200,json=SEARCH)
        service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(slow))
        with patch('existing.SEARCH_TIMEOUT_SECONDS',.01):
            with self.assertRaises(RemoteUnavailable) as error:await service.search(server.SearchInput(query='Gehör'))
        self.assertEqual(error.exception.code,'public_research_timeout');self.assertEqual(len(calls),1)
        self.assertTrue(service.slots.acquire(False))

    async def test_search_has_more_time_than_detail_without_an_automatic_second_attempt(self):
        calls=[]
        async def delayed(request):
            calls.append(request)
            await asyncio.sleep(.03)
            return httpx.Response(200,json=envelope(SEARCH) if request.method=='POST' else {**ROW,'full_text':'Synthetic'})
        service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(delayed))
        # Scaled time preserves the relative gap without sleeping45s in a test.
        with patch('existing.SEARCH_TIMEOUT_SECONDS',.1),patch('existing.DETAIL_TIMEOUT_SECONDS',.01):
            result=await service.search(server.SearchInput(query='rechtliches Gehör'))
            self.assertEqual(result['results'][0]['decision_id'],ID)
            with self.assertRaises(RemoteUnavailable) as error:await service.decision(ID,0,10)
        self.assertEqual(error.exception.code,'public_research_timeout')
        self.assertEqual([request.method for request in calls],['POST','GET'])
        self.assertTrue(service.slots.acquire(False));service.slots.release()

    async def test_search_stream_deadline_covers_wait_after_headers_and_closes_response(self):
        calls=[]
        class SlowStream(httpx.AsyncByteStream):
            closed=False
            async def __aiter__(self):
                yield b': progress\n\n'
                await asyncio.sleep(1)
                yield ('data: '+json.dumps(envelope(SEARCH))+'\n\n').encode()
            async def aclose(self):self.closed=True
        stream=SlowStream()
        def handle(request):calls.append(request);return httpx.Response(200,stream=stream,headers={'Content-Type':'text/event-stream'})
        service=ExistingOpenCaseLaw(1,server.literal_terms,server.public_url,transport=httpx.MockTransport(handle))
        with patch('existing.SEARCH_TIMEOUT_SECONDS',.01):
            with self.assertRaises(RemoteUnavailable) as error:await service.search(server.SearchInput(query='Gehör'))
        self.assertEqual(error.exception.code,'public_research_timeout');self.assertTrue(stream.closed)
        self.assertEqual(len(calls),1);self.assertTrue(service.slots.acquire(False));service.slots.release()

    async def test_upstream_failures_and_capacity_are_safe(self):
        for status,code in [(429,'public_research_busy'),(503,'public_research_unavailable')]:
            with self.assertRaises(RemoteUnavailable) as error:await self.service({'detail':'private'},status).search(server.SearchInput(query='Gehör'))
            self.assertEqual(str(error.exception),code)
        service=self.service(SEARCH);service.slots.acquire(False);service.slots.acquire(False)
        with self.assertRaises(RemoteUnavailable) as error:await service.search(server.SearchInput(query='Gehör'))
        self.assertEqual(error.exception.code,'public_research_busy');self.assertEqual(self.requests,[])


class ExistingRouteTests(unittest.TestCase):
    def test_explicit_mode_no_sqlite_private_fields_rejected_before_egress(self):
        app=server.create_app(server.Settings(Path('/nonexistent/unused.db'),mode='existing_opencaselaw'))
        self.assertIsInstance(app.state.service,ExistingOpenCaseLaw)
        calls=[]
        def handle(request):calls.append(request);return httpx.Response(200,json=envelope(SEARCH))
        app.state.service.transport=httpx.MockTransport(handle)
        with patch('server.sqlite3.connect',side_effect=AssertionError('Unexpected local DB')),TestClient(app) as client:
            self.assertEqual(client.get('/health').status_code,200);self.assertEqual(calls,[])
            self.assertEqual(client.post('/search',json={'query':'Gehör','document_ids':['private']}).status_code,422)
            self.assertEqual(client.post('/search',json={'query':'Gehör','history':'private'}).status_code,422)
            self.assertEqual(calls,[])
            response=client.post('/search',json={'query':'Gehör'})
            self.assertEqual(response.status_code,200);self.assertEqual(response.json()['query_mode'],'opencaselaw_ai')
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
