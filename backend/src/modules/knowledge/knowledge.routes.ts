import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { createServerSupabase } from "../../lib/supabase";
import { sendServiceFailure } from "../../lib/serviceResult";
import { parseKnowledgeInput, searchKnowledge, publicKnowledgeRequest } from "./knowledge.service";

export const knowledgeRouter = Router();
knowledgeRouter.use(requireAuth);
knowledgeRouter.use(rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (_req, res) => String(res.locals.userId), standardHeaders: true, legacyHeaders: false, message: { detail: "Zu viele Suchanfragen. Bitte eine Minute warten." } }));
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
