import type { Request, Response, NextFunction } from "express";
import { courtosPilotEnabled } from "../lib/courtosPilot";
import { courtosInferenceRequest, reserveCourtosQuota, withCourtosQuota } from "../lib/courtosQuota";
import type { Db } from "../lib/supabase";

/** Called only after the normal identity, session and MFA checks. */
export async function enterCourtosQuota(req: Request, res: Response, next: NextFunction, db: Db, userId: string): Promise<void> {
  if (!courtosPilotEnabled() || !courtosInferenceRequest(req.method, req.originalUrl)) return next();
  const result = await reserveCourtosQuota(db, userId);
  if (!result.ok) {
    res.setHeader("Retry-After", String(result.retryAfter));
    res.status(result.status).json({ code: "courtos_usage_limit", detail: result.detail });
    return;
  }
  // A completed non-stream response (validation failure, column helper) can
  // release here. Stream runs release on their own finish; socket close does
  // NOT release them, otherwise refreshing could bypass the active limit.
  res.once("finish", () => {
    if (!result.reservation.hasRun()) void result.reservation.release();
  });
  withCourtosQuota(result.reservation, next);
}
