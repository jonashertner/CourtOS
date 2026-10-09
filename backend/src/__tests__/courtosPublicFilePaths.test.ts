import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courtosPilotMiddleware } from "../middleware/courtosPilot";

const persistentWrites = [
  "/projects/project-a/documents/document-a",
  "/single-documents/document-a/versions/from-document",
  "/single-documents/document-a/edits/edit-a/accept",
  "/single-documents/document-a/edits/edit-a/reject",
  "/workflows/workflow-a/assets/from-documents",
  "/workflow-addons/addon-a/import",
  "/user/exports",
];
function fixture() {
  const handler = vi.fn((_req: express.Request, res: express.Response) => res.json({ domainHandlerReached: true }));
  const app = express();
  app.use(courtosPilotMiddleware);
  app.use(handler);
  return { app, handler };
}
beforeEach(() => {
  vi.stubEnv("COURTOS_PILOT_MODE", "true");
  vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("Public CourtOS file-growth boundary", () => {
  it.each(persistentWrites)("refuses %s before its domain handler, including route spelling variants", async (path) => {
    const { app, handler } = fixture();
    for (const spelling of [path, path.toUpperCase(), `${path}/`, `${path}/?preview=true`]) {
      const response = await request(app).post(spelling).send({});
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("courtos_public_file_policy");
    }
    expect(handler).not.toHaveBeenCalled();
  });
  it("retains guarded uploads, projects, chat and direct read/download paths", async () => {
    const { app } = fixture();
    for (const path of ["/upload-sessions", "/projects", "/chat", "/projects/p/chat", "/single-documents/download-zip"]) {
      expect((await request(app).post(path).send({})).status).toBe(200);
    }
    for (const path of ["/single-documents/d/versions", "/single-documents/d/display", "/download/signed/synthetic-token", "/user/exports/e/download", "/workflow-addons/a"]) {
      expect((await request(app).get(path)).status).toBe(200);
    }
  });
  it.each([
    { pilot: "false", selfRegistration: "true" },
    { pilot: "true", selfRegistration: "false" },
  ])("leaves ordinary Mike and closed admission unchanged: %j", async ({ pilot, selfRegistration }) => {
    vi.stubEnv("COURTOS_PILOT_MODE", pilot);
    vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION", selfRegistration);
    const { app } = fixture();
    for (const path of persistentWrites) expect((await request(app).post(path).send({})).status).toBe(200);
  });
});
