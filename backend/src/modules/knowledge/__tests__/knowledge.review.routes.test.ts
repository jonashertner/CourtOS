import { beforeEach, describe, expect, it, vi } from "vitest";
import express,{type Request,type Response,type NextFunction} from "express";
import request from "supertest";
const calls=vi.hoisted(()=>({start:vi.fn(),get:vi.fn(),stop:vi.fn()}));
vi.mock("../../../lib/supabase",()=>({createServerSupabase:()=>({synthetic:true})}));
vi.mock("../../../middleware/auth",()=>({requireAuth:(req:Request,res:Response,next:NextFunction)=>{const owner=req.get("x-test-owner");if(!owner)return void res.status(401).json({detail:"Invalid session"});res.locals.userId=owner;next();}}));
vi.mock("../knowledge.review",()=>({startCaseReview:calls.start,getCaseReview:calls.get,stopCaseReview:calls.stop,caseReviewRun:()=>undefined}));
import { knowledgeRouter } from "../knowledge.routes";
const origin="https://sandbox.swisslaw.io",id="00000000-0000-4000-8000-000000000023";
const app=express();app.use(express.json());app.use("/knowledge",knowledgeRouter);
const record={id,status:"queued",input:{},report:null,error:null};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("FRONTEND_URL",origin);for(const call of [calls.start,calls.get,calls.stop])call.mockResolvedValue({ok:true,data:record});});
describe("review route authentication and explicit model start",()=>{
  it("gates read/start/stop before services and sends no-store on unauthenticated refusal",async()=>{
    for(const action of [request(app).get(`/knowledge/reviews/${id}`),request(app).post("/knowledge/reviews").send({}),request(app).post(`/knowledge/reviews/${id}/stop`).send({})]){const response=await action;expect(response.status).toBe(401);expect(response.headers["cache-control"]).toBe("no-store");}
    expect(calls.start).not.toHaveBeenCalled();expect(calls.get).not.toHaveBeenCalled();expect(calls.stop).not.toHaveBeenCalled();
  });
  it("requires an exact trusted Origin on both mutations even with Bearer auth",async()=>{
    for(const path of ["/knowledge/reviews",`/knowledge/reviews/${id}/stop`])for(const supplied of ["null","https://outside.invalid"]){const response=await request(app).post(path).set("x-test-owner","owner").set("Authorization","Bearer synthetic").set("Origin",supplied).send({});expect(response.status).toBe(403);}
    expect(calls.start).not.toHaveBeenCalled();expect(calls.stop).not.toHaveBeenCalled();
  });
  it("uses authenticated owner and returns202; status read never starts an analysis",async()=>{
    const response=await request(app).post("/knowledge/reviews").set("x-test-owner","owner").set("Origin",origin).send({request_id:id});expect(response.status).toBe(202);
    expect(calls.start).toHaveBeenCalledWith({synthetic:true},"owner",{request_id:id});
    const status=await request(app).get(`/knowledge/reviews/${id}`).set("x-test-owner","owner");expect(status.status).toBe(200);expect(status.headers["cache-control"]).toBe("no-store");expect(calls.start).toHaveBeenCalledOnce();
  });
  it("preserves429+retry delay and returns404 without leaking a foreign report",async()=>{
    calls.start.mockResolvedValue({ok:false,kind:"usage_limit",status:429,detail:"Tageslimit",retryAfter:120});
    const response=await request(app).post("/knowledge/reviews").set("x-test-owner","owner").set("Origin",origin).send({});expect(response.status).toBe(429);expect(response.headers["retry-after"]).toBe("120");
    calls.get.mockResolvedValue({ok:false,kind:"not_found",detail:"Nicht verfügbar.",code:"review_not_found"});
    expect((await request(app).get(`/knowledge/reviews/${id}`).set("x-test-owner","stranger")).status).toBe(404);
  });
  it("requires an empty explicit stop action and bounds stream resume positions",async()=>{
    const bad=await request(app).post(`/knowledge/reviews/${id}/stop`).set("x-test-owner","owner").set("Origin",origin).send({user_id:"other"});expect(bad.status).toBe(400);expect(calls.stop).not.toHaveBeenCalled();
    expect((await request(app).get(`/knowledge/reviews/${id}/stream?from=-1`).set("x-test-owner","owner")).status).toBe(400);
    const stopped=await request(app).post(`/knowledge/reviews/${id}/stop`).set("x-test-owner","owner").set("Origin",origin).send({});expect(stopped.status).toBe(200);expect(calls.stop).toHaveBeenCalledWith({synthetic:true},"owner",id);
  });
});
