import { beforeEach, describe, expect, it, vi } from "vitest";
import express,{type Request,type Response,type NextFunction} from "express";
import request from "supertest";
const calls=vi.hoisted(()=>({check:vi.fn()}));
vi.mock("../../../lib/supabase",()=>({createServerSupabase:()=>({synthetic:true})}));
vi.mock("../../../middleware/auth",()=>({requireAuth:(req:Request,res:Response,next:NextFunction)=>{const owner=req.get("x-test-owner");if(!owner)return void res.status(401).json({detail:"Invalid session"});res.locals.userId=owner;next();}}));
vi.mock("../knowledge.citationCheck",()=>({checkSelectedCitations:calls.check}));
import {knowledgeRouter} from "../knowledge.routes";
const origin="https://sandbox.swisslaw.io",app=express();app.use(express.json());app.use("/knowledge",knowledgeRouter);
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("FRONTEND_URL",origin);calls.check.mockResolvedValue({ok:true,data:{semantic_support:"not_assessed"}});});
describe("citation-check authenticated read action",()=>{
  it("requires a session and marks even refusals no-store",async()=>{const r=await request(app).post("/knowledge/citations/check").send({});expect(r.status).toBe(401);expect(r.headers["cache-control"]).toBe("no-store");expect(calls.check).not.toHaveBeenCalled();});
  it("requires trusted Origin and uses only authenticated owner",async()=>{
    expect((await request(app).post("/knowledge/citations/check").set("x-test-owner","owner").set("Origin","https://outside.invalid").send({})).status).toBe(403);expect(calls.check).not.toHaveBeenCalled();
    const r=await request(app).post("/knowledge/citations/check").set("x-test-owner","owner").set("Origin",origin).send({sources:[]});expect(r.status).toBe(200);expect(calls.check).toHaveBeenCalledWith({synthetic:true},"owner",{sources:[]});
  });
  it("preserves the safe unavailable code and no-store header",async()=>{
    calls.check.mockResolvedValue({ok:false,kind:"unavailable",code:"citation_index_unavailable",detail:"Die geprüfte Liste ist nicht verfügbar."});
    const r=await request(app).post("/knowledge/citations/check").set("x-test-owner","owner").set("Origin",origin).send({});expect(r.status).toBe(503);expect(r.body.code).toBe("citation_index_unavailable");expect(r.headers["cache-control"]).toBe("no-store");
  });
});
