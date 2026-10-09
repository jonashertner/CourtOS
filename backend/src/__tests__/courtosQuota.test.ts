import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courtosInferenceRequest, reserveCourtosQuota, withCourtosQuota, courtosQuotaFetchInit, COURTOS_NATIVE_MAX_MS } from "../lib/courtosQuota";
import { enterCourtosQuota } from "../middleware/courtosQuota";
import { startStreamRun, resetStreamRunsForTests } from "../lib/streamRuns";
import { generateAssistantChatTitle } from "../modules/chat/chat.title";
import { generateChatTitle } from "../modules/tabular/tabular.extract";
import { beginMemoryConversationTurn, scheduleMemoryConsolidation } from "../lib/memory/schedule";
import type { Db } from "../lib/supabase";

beforeEach(() => { vi.stubEnv("COURTOS_PILOT_MODE", "true"); });
afterEach(() => { resetStreamRunsForTests(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const database = (response: unknown = { allowed: true }) => {
  const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
  return { rpc, db: { rpc } as unknown as Db };
};

describe("CourtOS durable native admission boundary", () => {
  it("covers all native model-start routes but never charges reconnect, stop or metadata requests", () => {
    for (const path of ["/chat", "/chat/", "/word-chat", "/projects/p/chat", "/tabular-review/prompt", "/tabular-review/r/generate", "/tabular-review/r/chat", "/tabular-review/r/regenerate-cell"]) expect(courtosInferenceRequest("POST", path)).toBe(true);
    for (const path of ["/chat/c/turn/t/stream", "/chat/c/turn/t/stop", "/word-chat/tool-result", "/tabular-review/r/generate/stop", "/user/profile", "/auth/cloudflare"]) expect(courtosInferenceRequest("POST", path)).toBe(false);
    expect(courtosInferenceRequest("GET", "/chat")).toBe(false);
  });
  it("uses the atomic RPC and fails closed if quota storage is unavailable", async () => {
    const { db, rpc } = database();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect(await reserveCourtosQuota(db, "user-a")).toMatchObject({ ok: false, status: 503 });
    expect(rpc).toHaveBeenCalledWith("courtos_reserve_native_start", expect.objectContaining({ p_user_id: "user-a" }));
  });
  it.each(["user_daily", "global_daily", "user_active", "global_active"])("returns an actionable429 before any handler or model for %s", async (reason) => {
    const { db } = database({ allowed: false, reason, retry_after: 60 });
    const handler = vi.fn((_req, res) => res.json({ reached: true }));
    const app = express();
    app.use((req, res, next) => { void enterCourtosQuota(req, res, next, db, "user-a"); });
    app.post("/chat", handler);
    const response = await request(app).post("/chat").send({});
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.body.code).toBe("courtos_usage_limit");
    expect(handler).not.toHaveBeenCalled();
  });
  it("keeps a server-owned run reserved across disconnect/reconnect and charges a failed model start", async () => {
    const { db, rpc } = database();
    const admission = await reserveCourtosQuota(db, "user-a");
    if (!admission.ok) throw new Error("expected admission");
    const run = withCourtosQuota(admission.reservation, () => {
      const run = startStreamRun({ id: "run-a", key: "chat:a", userId: "user-a", forcedStopFrames: [] });
      courtosQuotaFetchInit({ method: "POST" });
      return run!;
    });
    const detach = run.subscribe(1, { write: () => {}, end: () => {} }); detach();
    expect(admission.reservation.hasRun()).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    run.subscribe(1, { write: () => {}, end: () => {} });
    run.finish(); await Promise.resolve();
    expect(rpc).toHaveBeenLastCalledWith("courtos_release_native_start", expect.objectContaining({ p_user_id: "user-a", p_model_started: true }));
    await admission.reservation.release();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("preserves admission through asynchronous Express handlers and releases a direct response", async () => {
    const { db, rpc } = database();
    const app = express();
    app.use((req, res, next) => { void enterCourtosQuota(req, res, next, db, "user-a"); });
    app.post("/tabular-review/prompt", async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const init = courtosQuotaFetchInit({ method: "POST" });
      res.json({ bounded: Boolean(init?.signal) });
    });
    const response = await request(app).post("/tabular-review/prompt").send({});
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ bounded: true });
    expect(rpc).toHaveBeenLastCalledWith("courtos_release_native_start", expect.objectContaining({ p_user_id: "user-a", p_model_started: true }));
  });
  it("refunds an admission rejected before inference and blocks subsequent model use", async () => {
    const { db, rpc } = database();
    const admission = await reserveCourtosQuota(db, "user-a");
    if (!admission.ok) throw new Error("expected admission");
    await admission.reservation.release();
    expect(rpc).toHaveBeenLastCalledWith("courtos_release_native_start", expect.objectContaining({ p_model_started: false }));
    expect(() => withCourtosQuota(admission.reservation, () => courtosQuotaFetchInit())).toThrow("abgeschlossen");
  });
  it("rejects unmetered public-pilot background inference before network", () => {
    vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION", "true");
    expect(() => courtosQuotaFetchInit()).toThrow("zugelassenen Analyseauftrags");
  });
  it("aborts all provider work inside an admission before the25-minute lease expires", async () => {
    vi.useFakeTimers();
    const { db } = database();
    const admission = await reserveCourtosQuota(db, "user-a");
    if (!admission.ok) throw new Error("expected admission");
    const init = withCourtosQuota(admission.reservation, () => courtosQuotaFetchInit({ method: "POST" }));
    vi.advanceTimersByTime(COURTOS_NATIVE_MAX_MS);
    expect(init?.signal?.aborted).toBe(true);
    await admission.reservation.release();
  });
  it("uses a deterministic title and never schedules pilot memory model work", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { db, rpc } = database();
    expect(await generateAssistantChatTitle({ model: "courtos-local", message: "Fiktive Chronologie prüfen" })).toContain("Fiktive Chronologie");
    expect(await generateChatTitle("courtos-local", " Fiktive  Tabelle prüfen ")).toBe("Fiktive Tabelle prüfen");
    expect(await beginMemoryConversationTurn({ db, surface: "chat", conversationId: "c", actorUserId: "u" })).toBeNull();
    expect(await scheduleMemoryConsolidation({ db, surface: "chat", conversationId: "c", actorUserId: "u", turnId: "t", turn: { activityId: "a" } })).toBeNull();
    expect(rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});
