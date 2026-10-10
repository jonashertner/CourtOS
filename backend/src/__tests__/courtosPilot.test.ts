import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { courtosPilotModel, courtosPilotEnabled, courtosPilotToolAllowed, COURTOS_PILOT_REQUEST_BYTES } from "../lib/courtosPilot";
import { loadModelRegistry, resetModelRegistryCache } from "../lib/llm/registry";
import { completeWithProvider } from "../lib/llm/providers";
import { aiSdkFetch, maxOutputTokensFor } from "../lib/llm/aiSdk";
import { withCourtosLocalQueue } from "../lib/llm/courtosLocalQueue";
import { hasApiKeyForModel, resolveEffectiveChatModel, titleModelForChat } from "../lib/modelSelection";
import { memoryCuratorModelForChat } from "../modules/memory/memory.curator";
import { serializeProfile } from "../modules/user/user.profile.serialization";
import type { UserProfileRow } from "../modules/user/user.profile.storage";
import { validateProfilePayload } from "../modules/user/user.profile.validation";
import { getUserApiKeys, getUserApiKeyStatus, saveUserApiKey } from "../modules/user/user.apiKeyStore";
import { guardedFetch } from "../lib/mcp/client";
import { buildUserMcpTools } from "../lib/mcp/servers";
import { buildGoogleDriveTools } from "../lib/integrations/googleDrive";
import { buildGoogleWorkspaceTools } from "../lib/integrations/googleWorkspace";
import { googleDriveRequest } from "../lib/integrations/googleDriveHttp";
import { searchCourtlistenerCaseLaw } from "../lib/courtlistener";
import { sentryConfiguration } from "../lib/observability/sentry";
import { listConfiguredModels, listOllamaModels } from "../modules/models/models.service";
import { courtosPilotMiddleware } from "../middleware/courtosPilot";
import type { Db } from "../lib/supabase";
import type { RouterModelSelections } from "../lib/routerModels";

import { buildSystemPrompt } from "../modules/chat/engine/prompts";
import { TOOLS, PROJECT_EXTRA_TOOLS, WORKFLOW_TOOLS } from "../modules/chat/engine/tools/toolSchemas";

const noDatabase = new Proxy({}, { get: () => { throw new Error("Database must not be touched"); } }) as Db;

beforeEach(() => {
  vi.stubEnv("COURTOS_PILOT_MODE", "true");
  vi.stubEnv("COURTOS_PILOT_MODEL_URL", "http://127.0.0.1:18181/v1");
  vi.stubEnv("COURTOS_PILOT_MODEL_ID", "courtos-local");
  vi.stubEnv("COURTOS_PILOT_MODEL_NAME", "gemma-4-12b-qat");
  resetModelRegistryCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetModelRegistryCache();
});

describe("CourtOS pilot outbound boundary", () => {
  it("rejects misspelled mode settings and non-loopback model endpoints", () => {
    expect(() => courtosPilotEnabled({ COURTOS_PILOT_MODE: "tru" })).toThrow();
    for (const url of ["https://api.example.com/v1", "http://10.0.0.4/v1", "http://localhost/v1", "http://user:password@127.0.0.1/v1", "http://127.0.0.1/v1?forward=cloud"]) {
      expect(() => courtosPilotModel({ COURTOS_PILOT_MODE: "true", COURTOS_PILOT_MODEL_URL: url })).toThrow();
    }
  });

  it("ignores cloud registry entries and committees in pilot mode", async () => {
    vi.stubEnv("MIKE_MODEL_CONFIG_JSON", JSON.stringify({ models: [{ id: "cloud", provider: "openai-compatible", location: "local", baseUrl: "https://external.example/v1" }], committees: [{ id: "group", chair: "gpt-6-astra", members: ["gpt-6-astra"] }] }));
    expect(loadModelRegistry().models.map((m) => m.id)).toEqual(["courtos-local"]);
    expect(loadModelRegistry().committees).toEqual([]);
    expect(await listConfiguredModels(noDatabase, "user")).toEqual([expect.objectContaining({ id: "courtos-local", location: "local" })]);
    expect(await listOllamaModels()).toEqual([]);
  });

  it("pins chat, title, memory and profile defaults despite stored cloud preferences", async () => {
    const args = { userId: "user", db: noDatabase, apiKeys: { openai: "existing-key" }, chatModel: "gpt-6-astra", lastSelectedModel: "gpt-6-astra" };
    expect(await resolveEffectiveChatModel(args)).toMatchObject({ ok: true, model: "courtos-local" });
    expect(await resolveEffectiveChatModel({ ...args, requested: "gpt-6-astra" })).toMatchObject({ ok: false, code: "model_unavailable" });
    expect(hasApiKeyForModel("gpt-6-astra", args.apiKeys)).toBe(false);
    expect(titleModelForChat("courtos-local", "gpt-6-astra")).toBe("courtos-local");
    expect(memoryCuratorModelForChat({ chatModel: "courtos-local", memoryCuratorModel: "gpt-6-astra", environmentOverride: "claude-sonnet-4-6" })).toBe("courtos-local");
    const profile = serializeProfile({} as RouterModelSelections, { title_model: "gpt-6-astra", tabular_model: "gpt-6-astra", legal_research_us: true } as UserProfileRow);
    expect(profile).toMatchObject({ titleModel: "courtos-local", tabularModel: "courtos-local", memoryCuratorModel: "courtos-local", lastSelectedChatModel: "courtos-local", legalResearchUs: false, lastSelectedReasoningLevel: "none" });
    expect(validateProfilePayload({ titleModel: "gpt-6-astra" }).ok).toBe(false);
    expect(validateProfilePayload({ legalResearchUs: true }).ok).toBe(false);
  });

  it("blocks provider calls before any network activity even with valid-looking keys", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    vi.stubEnv("ANTHROPIC_API_KEY", "deployment-key");
    for (const model of ["claude-sonnet-4-6", "gpt-6-astra", "ollama/other", "custom/other", "cloud"]) {
      await expect(completeWithProvider({ model, user: "PRIVATE_CANARY", apiKeys: { openai: "personal-key" } })).rejects.toThrow("configured local model");
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("fails on a local model error without switching to a cloud provider", async () => {
    const network = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { message: "local model unavailable", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", network);
    await expect(completeWithProvider({ model: "courtos-local", user: "PRIVATE_CANARY", apiKeys: { openai: "cloud-key" } })).rejects.toThrow();
    expect(network).toHaveBeenCalled();
    for (const [url, init] of network.mock.calls) {
      expect(String(url)).toBe("http://127.0.0.1:18181/v1/chat/completions");
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBeLessThanOrEqual(768);
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    }
  });

  it("allows only the exact local completion route and forbids HTTP redirects", async () => {
    const network = vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
    for (const url of ["https://external.example/v1/chat/completions", "http://127.0.0.1:18182/v1/execute", "http://127.0.0.1:18181/v1/chat/completions?route=external"]) {
      await expect(aiSdkFetch(url, { method: "POST", body: "PRIVATE_CANARY" }, network)).rejects.toThrow("destination");
    }
    expect(network).not.toHaveBeenCalled();
    await expect(aiSdkFetch("http://127.0.0.1:18181/v1/chat/completions", { method: "POST", body: "synthetic" }, network)).rejects.toThrow("Ausführungsplatz");
    expect(network).not.toHaveBeenCalled();
    await withCourtosLocalQueue("courtos-local", undefined, undefined, () => aiSdkFetch("http://127.0.0.1:18181/v1/chat/completions", { method: "POST", body: "synthetic", redirect: "follow" }, network));
    expect(network).toHaveBeenCalledWith("http://127.0.0.1:18181/v1/chat/completions", expect.objectContaining({ redirect: "error" }));
    vi.stubEnv("LLM_MAX_OUTPUT_TOKENS", "100000");
    expect(maxOutputTokensFor("openai-compatible")).toBe(768);
  });

  it("bounds context without truncation and reports actual local context failures", async () => {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "request exceeds context size" } }), { status: 400 }));
    const url = "http://127.0.0.1:18181/v1/chat/completions";
    await expect(aiSdkFetch(url, { method: "POST", body: "x".repeat(COURTOS_PILOT_REQUEST_BYTES + 1) }, network)).rejects.toThrow("kein externer");
    expect(network).not.toHaveBeenCalled();
    await expect(withCourtosLocalQueue("courtos-local", undefined, undefined, () => aiSdkFetch(url, { method: "POST", body: "short" }, network))).rejects.toThrow("lokale Pilot");
  });

  it("has a compact Swiss judicial prompt and local-read-only tool surface", () => {
    const prompt = buildSystemPrompt(true);
    const tools = [...TOOLS, ...PROJECT_EXTRA_TOOLS, ...WORKFLOW_TOOLS].filter((tool) => courtosPilotToolAllowed(tool.function.name));
    expect(prompt).toContain("Gerichtsschreibende");
    expect(prompt).toContain("CITATIONS");
    expect(prompt).not.toContain("COURTLISTENER");
    expect(prompt).not.toContain("US CASE LAW");
    expect(Buffer.byteLength(prompt + JSON.stringify(tools), "utf8")).toBeLessThan(6000);
    expect(tools.map((tool) => tool.function.name).sort()).toEqual(["find_in_document", "list_documents", "list_workflows", "read_document", "read_workflow"]);
    expect(courtosPilotToolAllowed("google_drive_search")).toBe(false);
    expect(courtosPilotToolAllowed("generate_docx")).toBe(false);
  });

  it("keeps the pilot catalog and document instructions within the same response budget", () => {
    const workflows = JSON.parse(readFileSync(resolve(process.cwd(), "../ops/courtos/workflows.json"), "utf8")) as { prompt_md: string; quick_action_prompt: string }[];
    expect(workflows).toHaveLength(3);
    for (const workflow of workflows) {
      expect(workflow.prompt_md).toContain("150 Wörter");
      expect(workflow.quick_action_prompt).toContain("drei Belege");
      expect(workflow.prompt_md).not.toMatch(/400 Wörter|250 Wörter/);
    }
    expect(buildSystemPrompt()).toContain("150 Woertern");
    expect(buildSystemPrompt()).toContain("acht Woertern");
  });

  it("does not read or accept user or environment provider credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "deployment-key");
    expect(await getUserApiKeys("user", noDatabase)).toEqual({});
    expect(await getUserApiKeyStatus("user", noDatabase)).toMatchObject({ openai: false, claude: false, settings: {} });
    await expect(saveUserApiKey("user", "openai", "personal-key", noDatabase)).rejects.toThrow("disabled");
  });

  it("does not advertise connected tools and rejects direct external reads before network", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    expect(await buildUserMcpTools("user", noDatabase)).toEqual([]);
    expect(await buildGoogleDriveTools("user", noDatabase)).toEqual([]);
    expect(await buildGoogleWorkspaceTools("user", noDatabase)).toEqual([]);
    await expect(guardedFetch("https://example.org/mcp", { method: "POST", body: "PRIVATE_CANARY" })).rejects.toThrow("disabled");
    await expect(googleDriveRequest("https://googleapis.com/query?private=PRIVATE_CANARY")).rejects.toThrow("disabled");
    await expect(searchCourtlistenerCaseLaw({ query: "PRIVATE_CANARY", apiToken: "existing-key" })).rejects.toThrow("disabled");
    expect(network).not.toHaveBeenCalled();
  });

  it("disables backend telemetry regardless of other Sentry settings", () => {
    expect(sentryConfiguration({ COURTOS_PILOT_MODE: "true", SENTRY_DISABLED: "false", SENTRY_DSN: "https://public@example.org/1", NODE_ENV: "production" })).toMatchObject({ enabled: false, dsn: "", dsnSource: "disabled" });
  });

  it("rejects direct forbidden HTTP routes without disabling ordinary project operations", async () => {
    const app = express(); app.use(courtosPilotMiddleware); app.use((_req, res) => res.json({ reached: true }));
    for (const path of ["/user/api-keys/openai", "/user/mcp-connectors", "/user/integrations/google-drive", "/models/openrouter", "/models/ollama", "/user/security/password-set", "/user/security/mfa-login", "/user/account"]) {
      expect((await request(app).post(path).send({ api_key: "PRIVATE_CANARY" })).status).toBe(403);
    }
    expect((await request(app).get("/models/configured")).status).toBe(200);
    expect((await request(app).post("/projects")).status).toBe(200);
  });

  it("keeps upstream model configuration and helper preferences when the mode is off", () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "false");
    vi.stubEnv("MIKE_MODEL_CONFIG_JSON", JSON.stringify({ models: [{ id: "local-test", provider: "openai-compatible", location: "local", baseUrl: "http://localhost:8000/v1" }] }));
    expect(loadModelRegistry().models[0].id).toBe("local-test");
    expect(titleModelForChat("gpt-6-astra", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(courtosPilotModel()).toBeNull();
  });
});
