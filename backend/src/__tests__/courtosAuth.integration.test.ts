/** CourtOS boundary tests with real Express routing, signed Access assertions,
 * auth middleware and auth router. Only the local GoTrue transport is mocked;
 * this suite does not prove database permissions or a deployed proxy chain. */
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieUser: vi.fn(), bearerUser: vi.fn(), generateLink: vi.fn(), verifyOtp: vi.fn(),
  passwordLogin: vi.fn(), updateUser: vi.fn(),
}));
vi.mock("../lib/userLookup", () => ({ syncProfileEmail: async () => null }));
vi.mock("../lib/supabase", () => ({
  createServerSupabase: () => ({
    auth: { getUser: mocks.bearerUser, admin: { generateLink: mocks.generateLink } },
    from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
      return query;
    },
  }),
}));
vi.mock("../lib/authSession", async (original) => ({
  ...(await original<typeof import("../lib/authSession")>()),
  createRequestSupabase: () => ({ auth: {
    getUser: mocks.cookieUser,
    getSession: async () => ({ data: { session: { access_token: "synthetic-cookie-token" } }, error: null }),
    verifyOtp: mocks.verifyOtp, signInWithPassword: mocks.passwordLogin, updateUser: mocks.updateUser,
  } }),
}));

import { requireCourtOSAccess } from "../middleware/courtosAccess";
import { requireAuth } from "../middleware/auth";
import { authRouter } from "../modules/auth/auth.routes";

const origin = "https://pilot.example.org";
const email = "tester@example.org";
const user = { id: "user-a", email, email_confirmed_at: "2026-01-01T00:00:00Z" };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const dir = mkdtempSync(join(tmpdir(), "courtos-auth-boundary-"));
const keyFile = join(dir, "jwks.json");
writeFileSync(keyFile, JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key" }] }));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function assertion(patch: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: "https://access.example.org", aud: ["pilot"], exp: now + 300, iat: now, sub: "access-a", email, ...patch })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}
const app = express();
app.use(requireCourtOSAccess);
app.use(express.json());
app.use("/auth", authRouter);
app.get("/private-probe", requireAuth, (_req, res) => res.json({ userId: res.locals.userId }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COURTOS_AUTH_MODE", "cloudflare");
  vi.stubEnv("COURTOS_ACCESS_ISSUER", "https://access.example.org");
  vi.stubEnv("COURTOS_ACCESS_AUDIENCE", "pilot");
  vi.stubEnv("COURTOS_ACCESS_EMAILS", email);
  vi.stubEnv("COURTOS_ACCESS_JWKS_FILE", keyFile);
  vi.stubEnv("FRONTEND_URL", origin);
  mocks.cookieUser.mockResolvedValue({ data: { user }, error: null });
  mocks.bearerUser.mockResolvedValue({ data: { user }, error: null });
  mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "synthetic-one-time-hash", verification_type: "magiclink" }, user }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { user, session: { access_token: "must-not-leave-server" } }, error: null });
  mocks.passwordLogin.mockResolvedValue({ data: { user, session: { access_token: "must-not-leave-server" } }, error: null });
  mocks.updateUser.mockResolvedValue({ data: { user }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("CourtOS authentication HTTP boundary", () => {
  it("refuses raw identity headers, missing assertions and a signed non-allowlisted identity", async () => {
    for (const headers of [
      {},
      { "cf-access-authenticated-user-email": email, "x-user-email": email },
      { "cf-access-jwt-assertion": "raw-header-is-not-a-jwt" },
      { "cf-access-jwt-assertion": assertion({ email: "outsider@example.org" }) },
    ]) {
      const response = await request(app).post("/auth/cloudflare").set(headers).set("origin", origin).send({});
      expect(response.status).toBe(401);
    }
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("requires the configured request origin before establishing a session", async () => {
    for (const requestOrigin of [undefined, "https://other.example.org", "null"]) {
      let call = request(app).post("/auth/cloudflare").set("cf-access-jwt-assertion", assertion());
      if (requestOrigin) call = call.set("origin", requestOrigin);
      expect((await call.send({})).status).toBe(403);
    }
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("refuses a client-supplied identity and takes the email only from the verified assertion", async () => {
    const rejected = await request(app).post("/auth/cloudflare").set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({ email: "victim@example.org" });
    expect(rejected.status).toBe(400);
    expect(mocks.generateLink).not.toHaveBeenCalled();
    const accepted = await request(app).post("/auth/cloudflare").set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({});
    expect(accepted.status).toBe(200);
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "magiclink", email });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "synthetic-one-time-hash" });
    expect(accepted.body).toMatchObject({ user: { id: user.id, email } });
    expect(JSON.stringify(accepted.body)).not.toContain("must-not-leave-server");
  });

  it.each(["/auth/login", "/Auth/login", "/AUTH/LOGIN/", "/aUtH/LoGiN///"])("blocks the legacy login route %s", async (path) => {
    const response = await request(app).post(path).set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({ email, password: "synthetic-passphrase" });
    expect(response.status).toBe(403);
    expect(mocks.passwordLogin).not.toHaveBeenCalled();
  });

  it.each(["/auth/password", "/Auth/password", "/AUTH/PASSWORD/", "/Auth/email", "/AUTH/EMAIL/"])("blocks identity mutation route %s", async (path) => {
    const response = await request(app).patch(path).set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({ password: "synthetic-passphrase", email: "changed@example.org" });
    expect(response.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each(["/Auth/MfA/enroll", "/AUTH/MFA/CHALLENGE-AND-VERIFY/", "/Auth/password-reset/"])("blocks nested and recovery route %s", async (path) => {
    const response = await request(app).post(path).set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({ email, friendlyName: "Synthetic test" });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("courtos_auth_managed");
  });

  it.each(["/auth/cloudflare", "/Auth/Cloudflare/"])("accepts a canonical-equivalent bridge route %s", async (path) => {
    expect((await request(app).post(path).set("origin", origin).set("cf-access-jwt-assertion", assertion()).send({})).status).toBe(200);
  });

  it.each(["cookie", "bearer"])("binds the %s session to the verified Access identity", async (source) => {
    const fetchProbe = () => {
      const call = request(app).get("/private-probe").set("cf-access-jwt-assertion", assertion());
      return source === "bearer" ? call.set("authorization", "Bearer synthetic-token") : call;
    };
    expect((await fetchProbe()).body).toEqual({ userId: "user-a" });
    (source === "bearer" ? mocks.bearerUser : mocks.cookieUser).mockResolvedValue({ data: { user: { ...user, id: "user-b", email: "other@example.org" } }, error: null });
    const mismatch = await fetchProbe();
    expect(mismatch.status).toBe(401);
    expect(mismatch.body.code).toBe("courtos_identity_mismatch");
  });
});
