import { courtosPilotEnabled } from "./courtosPilot";
import { createPublicKey, verify, type webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

export type CourtOSIdentity = { email: string; subject: string };

/** Public keys are refreshed by the operator, never through a request URL. */
export function verifyCourtOSAccess(
  assertion: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = Math.floor(Date.now() / 1000),
): CourtOSIdentity {
  if (!assertion || assertion.length > 16384) throw new Error("Access denied");
  const issuer = env.COURTOS_ACCESS_ISSUER;
  const audience = env.COURTOS_ACCESS_AUDIENCE;
  const file = env.COURTOS_ACCESS_JWKS_FILE;
  const allowed = new Set((env.COURTOS_ACCESS_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  const denied = new Set((env.COURTOS_ACCESS_DENY_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  const selfRegistration = courtosPilotEnabled(env) && env.COURTOS_ACCESS_SELF_REGISTRATION === "true";
  if (!issuer || !audience || !file || (!allowed.size && !selfRegistration)) throw new Error("Access is not configured");
  const parts = assertion.split(".");
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error("Access denied");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.crit) throw new Error("Access denied");
  const jwks = JSON.parse(readFileSync(file, "utf8"));
  const jwk = jwks.keys?.find((key: webcrypto.JsonWebKey & { kid?: string }) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) throw new Error("Access denied");
  const claim = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const audiences = Array.isArray(claim.aud) ? claim.aud : [claim.aud];
  if (claim.iss !== issuer || !audiences.includes(audience) ||
      typeof claim.exp !== "number" || claim.exp <= now ||
      typeof claim.iat !== "number" || claim.iat > now + 30 ||
      (claim.nbf !== undefined && (typeof claim.nbf !== "number" || claim.nbf > now + 30)) ||
      typeof claim.sub !== "string" || !claim.sub ||
      typeof claim.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claim.email) ||
      denied.has(claim.email.toLowerCase()) ||
      (!selfRegistration && !allowed.has(claim.email.toLowerCase()))) throw new Error("Access denied");
  return { email: claim.email.toLowerCase(), subject: claim.sub };
}

export function courtosAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COURTOS_AUTH_MODE === "cloudflare";
}

export function courtosIdentityMatches(identity: CourtOSIdentity | undefined, email: string | undefined): boolean {
  return Boolean(identity && email && identity.email === email.toLowerCase());
}
