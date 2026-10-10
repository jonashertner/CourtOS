import { attachStreamRunSse } from "../../lib/streamRuns";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { createServerSupabase } from "../../lib/supabase";
import { sendServiceFailure } from "../../lib/serviceResult";
import { requireTrustedOrigin } from "../../middleware/trustedOrigin";
import { parseKnowledgeInput, searchKnowledge, publicKnowledgeRequest, researchHandoff, startCaseReview, getCaseReview, stopCaseReview, caseReviewRun, checkSelectedCitations } from "./knowledge.service";

export const knowledgeRouter = Router();
knowledgeRouter.use(["/handoffs", "/reviews", "/citations"], (_req,res,next) => { res.setHeader("Cache-Control","no-store"); next(); });
knowledgeRouter.use(requireAuth);
knowledgeRouter.use(rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (_req, res) => String(res.locals.userId), standardHeaders: true, legacyHeaders: false, message: { detail: "Zu viele Suchanfragen. Bitte eine Minute warten." } }));
knowledgeRouter.use(["/handoffs", "/reviews", "/citations"], requireTrustedOrigin);
knowledgeRouter.post("/citations/check", asyncRoute(async (req,res) => {
  const result = await checkSelectedCitations(createServerSupabase(), String(res.locals.userId), req.body);
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
function exactBody(body: unknown, keys: string[]): body is Record<string, unknown> {
  return !!body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === keys.length && Object.keys(body).every(key => keys.includes(key));
}
function invalidHandoff(res: import("express").Response) { return res.status(400).json({code:"handoff_invalid",detail:"Der Recherchekontext ist ungültig oder zu gross."}); }
knowledgeRouter.post("/handoffs", asyncRoute(async (req,res) => {
  if (!exactBody(req.body,["state"])) return void invalidHandoff(res);
  const result = await researchHandoff(createServerSupabase(),String(res.locals.userId),{action:"create",state:req.body.state});
  if (!result.ok) return void sendServiceFailure(res,result);
  res.status(201).json(result.data);
}));
knowledgeRouter.get("/handoffs/:id", asyncRoute(async (req,res) => {
  if (Object.keys(req.query).some(key => key!=="metadata") || (req.query.metadata !== undefined && req.query.metadata !== "true")) return void invalidHandoff(res);
  const result = await researchHandoff(createServerSupabase(),String(res.locals.userId),{action:"read",id:String(req.params.id),metadataOnly:req.query.metadata==="true"});
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
knowledgeRouter.patch("/handoffs/:id", asyncRoute(async (req,res) => {
  if (!exactBody(req.body,["expected_revision","state","direction"]) || !["to_word","to_browser"].includes(String(req.body.direction))) return void invalidHandoff(res);
  const result = await researchHandoff(createServerSupabase(),String(res.locals.userId),{action:"update",id:String(req.params.id),state:req.body.state,expectedRevision:req.body.expected_revision as number,direction:req.body.direction as "to_word"|"to_browser"});
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
knowledgeRouter.post("/handoffs/:id/ack", asyncRoute(async (req,res) => {
  if (!exactBody(req.body,["expected_revision"])) return void invalidHandoff(res);
  const result = await researchHandoff(createServerSupabase(),String(res.locals.userId),{action:"ack",id:String(req.params.id),expectedRevision:req.body.expected_revision as number});
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
knowledgeRouter.post("/reviews", asyncRoute(async (req,res) => {
  const result = await startCaseReview(createServerSupabase(), String(res.locals.userId), req.body);
  if (!result.ok) {
    if (result.kind === "usage_limit") { res.setHeader("Retry-After",String(result.retryAfter)); return void res.status(result.status).json({code:"courtos_usage_limit",detail:result.detail}); }
    return void sendServiceFailure(res,result);
  }
  res.status(202).json(result.data);
}));
knowledgeRouter.get("/reviews/:id", asyncRoute(async (req,res) => {
  const result = await getCaseReview(createServerSupabase(),String(res.locals.userId),String(req.params.id));
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
knowledgeRouter.get("/reviews/:id/stream", asyncRoute(async (req,res) => {
  const id = String(req.params.id), owner = String(res.locals.userId);
  const from = Number(req.query.from ?? 1);
  if (Object.keys(req.query).some(key=>key!=="from") || !Number.isSafeInteger(from) || from<1) return void res.status(400).json({code:"review_invalid",detail:"Ungültige Fortsetzungsposition."});
  const result = await getCaseReview(createServerSupabase(),owner,id);
  if (!result.ok) return void sendServiceFailure(res,result);
  const run = caseReviewRun(id,owner);
  if (run) { attachStreamRunSse(res,run,from); return; }
  res.setHeader("Content-Type","text/event-stream"); res.setHeader("X-Accel-Buffering","no");
  res.end(`data: ${JSON.stringify({type:"review_result",record:result.data})}\n\ndata: [DONE]\n\n`);
}));
knowledgeRouter.post("/reviews/:id/stop", asyncRoute(async (req,res) => {
  if (!exactBody(req.body,[])) return void res.status(400).json({code:"review_invalid",detail:"Ungültiger Abbruchauftrag."});
  const result = await stopCaseReview(createServerSupabase(),String(res.locals.userId),String(req.params.id));
  if (!result.ok) return void sendServiceFailure(res,result);
  res.json(result.data);
}));
knowledgeRouter.post("/search", asyncRoute(async (req,res) => {
  const input = parseKnowledgeInput(req.body);
  if (!input) return void res.status(400).json({ detail: "Bitte einen Suchtext bis 300 Zeichen und 1 bis 20 eigene Bibliotheksdateien auswählen." });
  const result = await searchKnowledge(createServerSupabase(), String(res.locals.userId), input);
  if (!result.ok) return void sendServiceFailure(res, result);
  res.json(result.data);
}));
knowledgeRouter.post("/public/search", asyncRoute(async (req,res) => {
  const result = await publicKnowledgeRequest("search", req.body ?? {});
  if (!result.ok) return void sendServiceFailure(res, result);
  res.json(result.data);
}));
knowledgeRouter.get("/public/decisions/:id", asyncRoute(async (req,res) => {
  const result = await publicKnowledgeRequest("decision", { id: req.params.id, start: req.query.start, length: req.query.length });
  if (!result.ok) return void sendServiceFailure(res, result);
  res.json(result.data);
}));
knowledgeRouter.use(routerErrorHandler("[knowledge]"));
