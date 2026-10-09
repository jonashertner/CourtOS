import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/supabase";
const signed = vi.hoisted(() => vi.fn(async () => "https://upload.example/signed"));
vi.mock("../../../lib/storage", () => ({ getSignedUploadUrl: signed }));
import { refreshUploadUrls } from "../uploads.sessions";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function dbFor(reservation: unknown, size = 100, own = true) {
  const scopes: Record<string, Record<string, unknown>> = {};
  const session = { id, user_id: owner, status: "pending_upload", expected_total_bytes: size,
    expires_at: new Date(Date.now() + 600000).toISOString() };
  const files = [{ id: "f", status: "pending_upload", expected_size_bytes: size,
    staging_storage_path: "staging", content_type: "application/pdf" }];
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    q.select = q.update = q.order = () => q;
    q.eq = (key: string, value: unknown) => { filters[key] = value; scopes[table] = filters; return q; };
    q.maybeSingle = async () => ({ data: table === "upload_sessions" ? (own ? session : null) : reservation, error: null });
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: files, error: null }).then(resolve);
    return q;
  } } as unknown as Db;
  return { db, scopes };
}

describe("pilot upload URL refresh", () => {
  it("requires the same owner's durable reservation without creating or charging a new one", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    const { db, scopes } = dbFor({ reserved_bytes: 100, file_count: 1 });
    expect((await refreshUploadUrls(db, id, owner)).ok).toBe(true);
    expect(scopes.courtos_upload_reservations).toEqual({ session_id: id, user_id: owner });
    expect(signed).toHaveBeenCalledOnce();
  });
  it("blocks unreserved pre-pilot sessions and formerly larger files before signing", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    for (const fixture of [dbFor(null), dbFor({ reserved_bytes: 5242881, file_count: 1 }, 5242881)]) {
      expect(await refreshUploadUrls(fixture.db, id, owner)).toMatchObject({ ok: false, status: 409 });
    }
    expect(signed).not.toHaveBeenCalled();
  });
  it("returns no foreign session and keeps ordinary Mike refresh unchanged", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    expect(await refreshUploadUrls(dbFor(null, 100, false).db, id, owner)).toMatchObject({ ok: false, status: 404 });
    vi.stubEnv("COURTOS_PILOT_MODE", "false");
    const { db, scopes } = dbFor(null);
    expect((await refreshUploadUrls(db, id, owner)).ok).toBe(true);
    expect(scopes).not.toHaveProperty("courtos_upload_reservations");
  });
});
