import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
const calls=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock("../../../lib/supabase",()=>({createServerSupabase:()=>({rpc:calls.rpc})}));
vi.mock("../../../middleware/auth",()=>({requireAuth:(req:Request,res:Response,next:NextFunction)=>{
  calls.auth();const user=req.get("x-test-owner");if(!user)return void res.status(401).json({detail:"Invalid session"});res.locals.userId=user;next();
}}));
import { knowledgeRouter } from "../knowledge.routes";
const owner="00000000-0000-4000-8000-000000000011", handle="00000000-0000-4000-8000-000000000012";
const origin="https://sandbox.swisslaw.io";
const state={version:1,mode:"public",public:{query:"Gehör",submitted:"",language:"",result:null,source:null},private:{query:"",submitted:"",selected:[],result:null,source:null}};
const metadata={id:handle,revision:1,acknowledged_revision:0,direction:"to_browser",expires_at:"2026-10-10T15:00:00.000Z"};
const app=express();app.use(express.json({limit:"100kb"}));app.use("/knowledge",knowledgeRouter);
beforeEach(()=>{vi.stubEnv("FRONTEND_URL",origin);calls.rpc.mockReset();calls.auth.mockClear();calls.rpc.mockResolvedValue({data:{status:"ok",record:metadata},error:null});});

describe("authenticated research handoff routes",()=>{
  it("refuses unauthenticated reads and writes and marks every response no-store",async()=>{
    for(const operation of [request(app).get(`/knowledge/handoffs/${handle}`),request(app).post("/knowledge/handoffs").set("Origin",origin).send({state})]){
      const result=await operation;expect(result.status).toBe(401);expect(result.headers["cache-control"]).toBe("no-store");
    }
    expect(calls.auth).toHaveBeenCalledTimes(2);expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("requires trusted Origin even for an authenticated legacy Bearer caller",async()=>{
    for(const method of ["post","patch"] as const){
      const result=await request(app)[method](method==="post"?"/knowledge/handoffs":`/knowledge/handoffs/${handle}`).set("x-test-owner",owner).set("Authorization","Bearer synthetic").set("Origin","https://outside.invalid").send({state,expected_revision:1,direction:"to_word"});
      expect(result.status).toBe(403);expect(result.body.code).toBe("untrusted_origin");expect(result.headers["cache-control"]).toBe("no-store");
    }
    const ack=await request(app).post(`/knowledge/handoffs/${handle}/ack`).set("x-test-owner",owner).send({expected_revision:1});
    expect(ack.status).toBe(403);expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("never accepts an owner from a body and creates bounded drafts with the authenticated account",async()=>{
    const invalid=await request(app).post("/knowledge/handoffs").set("x-test-owner",owner).set("Origin",origin).send({state,user_id:"other"});
    expect(invalid.status).toBe(400);expect(calls.rpc).not.toHaveBeenCalled();
    const result=await request(app).post("/knowledge/handoffs").set("x-test-owner",owner).set("Origin",origin).send({state});
    expect(result.status).toBe(201);expect(result.body).toEqual(metadata);
    expect(calls.rpc).toHaveBeenCalledWith("courtos_research_handoff",expect.objectContaining({p_user_id:owner,p_action:"create",p_state:state}));
  });
  it("uses the same404 for expired or inaccessible records without exposing state",async()=>{
    calls.rpc.mockResolvedValue({data:{status:"not_found",state:{secret:"CANARY"}},error:null});
    const result=await request(app).get(`/knowledge/handoffs/${handle}`).set("x-test-owner",owner);
    expect(result.status).toBe(404);expect(result.body.code).toBe("handoff_not_found");expect(result.text).not.toContain("CANARY");
  });
  it("metadata polling excludes state and rejects permissive query or path variants",async()=>{
    calls.rpc.mockResolvedValue({data:{status:"ok",record:{...metadata,state}},error:null});
    const result=await request(app).get(`/knowledge/handoffs/${handle}?metadata=true`).set("x-test-owner",owner);
    expect(result.body).toEqual(metadata);expect(calls.rpc).toHaveBeenCalledWith("courtos_research_handoff",expect.objectContaining({p_metadata_only:true,p_user_id:owner}));
    calls.rpc.mockClear();
    for(const path of [`${handle}?metadata=false`,`${handle}?metadata=true&secret=text`,`not-a-uuid`]){
      expect((await request(app).get(`/knowledge/handoffs/${path}`).set("x-test-owner",owner)).status).toBe(400);
    }
    expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("forwards optimistic revision and direction; stale writes are409 and ACK is explicit",async()=>{
    calls.rpc.mockResolvedValueOnce({data:{status:"conflict"},error:null});
    const conflict=await request(app).patch(`/knowledge/handoffs/${handle}`).set("x-test-owner",owner).set("Origin",origin).send({state,expected_revision:1,direction:"to_word"});
    expect(conflict.status).toBe(409);expect(conflict.body.code).toBe("handoff_conflict");
    expect(calls.rpc).toHaveBeenLastCalledWith("courtos_research_handoff",expect.objectContaining({p_action:"update",p_expected_revision:1,p_direction:"to_word"}));
    const ack=await request(app).post(`/knowledge/handoffs/${handle}/ack`).set("x-test-owner",owner).set("Origin",origin).send({expected_revision:1});
    expect(ack.status).toBe(200);expect(calls.rpc).toHaveBeenLastCalledWith("courtos_research_handoff",expect.objectContaining({p_action:"ack",p_expected_revision:1,p_state:null}));
  });
});
