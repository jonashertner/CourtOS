import type { Request, Response, NextFunction } from "express";
import { courtosAccessEnabled, verifyCourtOSAccess } from "../lib/courtosAccess";

export function requireCourtOSAccess(req: Request, res: Response, next: NextFunction): void {
  if (!courtosAccessEnabled() || (req.method === "GET" && req.path === "/health")) return next();
  try {
    res.locals.courtosIdentity = verifyCourtOSAccess(req.get("cf-access-jwt-assertion"));
  } catch {
    res.status(401).json({ code: "courtos_access_required", detail: "Bitte melden Sie sich über den CourtOS-Codezugang an." });
    return;
  }
  // A pilot account has one identity provider. No password, OAuth, account
  // recovery or address change route may establish a different identity.
  // Express routing is case-insensitive and accepts a trailing slash by
  // default; the policy must cover those same route spellings.
  const authPath = req.path.toLowerCase().replace(/\/+$/, "");
  if (authPath.startsWith("/auth/") && !["/auth/cloudflare", "/auth/session", "/auth/logout"].includes(authPath)) {
    res.status(403).json({ code: "courtos_auth_managed", detail: "Der Zugang wird durch die CourtOS-Testleitung verwaltet." });
    return;
  }
  next();
}
