/** Opt-in CourtOS VPS pilot policy. Ordinary Mike deployments remain unchanged. */
import type { ConfiguredModel } from "./llm/types";
import { UserFacingError } from "./userFacingError";

export function courtosPilotEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.COURTOS_PILOT_MODE?.trim().toLowerCase();
  if (!value || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  throw new Error("COURTOS_PILOT_MODE must be true or false");
}

export function courtosPilotModel(env: NodeJS.ProcessEnv = process.env): ConfiguredModel | null {
  if (!courtosPilotEnabled(env)) return null;
  const id = env.COURTOS_PILOT_MODEL_ID?.trim() || "courtos-local";
  const apiModel = env.COURTOS_PILOT_MODEL_NAME?.trim() || "gemma-4-12b-qat";
  const baseUrl = env.COURTOS_PILOT_MODEL_URL?.trim() || "http://127.0.0.1:18181/v1";
  const url = new URL(baseUrl);
  // Literal loopback only: a 'local' display label or DNS name is not a boundary.
  if (!/^courtos-[a-z0-9-]{1,60}$/.test(id) || !apiModel || apiModel.length > 200 ||
      url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("CourtOS pilot requires a literal loopback model endpoint and a courtos- model ID");
  }
  return {
    id, label: "Gemma · CourtOS VPS", provider: "openai-compatible", location: "local",
    apiModel, baseUrl: baseUrl.replace(/\/+$/, ""), tolerateTextToolCalls: false,
  };
}

export function assertCourtosPilotModel(model: string): void {
  const pilot = courtosPilotModel();
  if (pilot && model !== pilot.id) {
    throw new UserFacingError("This CourtOS pilot uses only its configured local model.");
  }
}

export function assertCourtosExternalAccess(): void {
  if (courtosPilotEnabled()) {
    throw new UserFacingError("External providers and connectors are disabled in this CourtOS pilot.");
  }
}

/** Last boundary before model HTTP, including direct/internal adapter callers. */
export function courtosPilotFetchInit(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  const pilot = courtosPilotModel();
  if (!pilot) return init;
  const url = new URL(input instanceof Request ? input.url : String(input));
  const expected = new URL(pilot.baseUrl + "/chat/completions");
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (url.href !== expected.href || method.toUpperCase() !== "POST") {
    throw new UserFacingError("This model destination is not allowed in the CourtOS pilot.");
  }
  if (typeof init?.body === "string" && Buffer.byteLength(init.body, "utf8") > COURTOS_PILOT_REQUEST_BYTES) {
    throw new UserFacingError(COURTOS_PILOT_CONTEXT_NOTICE);
  }
  // Do not forward a prompt through a redirect from the otherwise trusted local server.
  return { ...init, redirect: "error" };
}

/** Deliberately small local reading surface for the 8k-context CPU pilot. */
export const COURTOS_PILOT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_document", "find_in_document", "list_documents", "list_workflows", "read_workflow",
]);

export function courtosPilotToolAllowed(name: string): boolean {
  return !courtosPilotEnabled() || COURTOS_PILOT_TOOL_NAMES.has(name);
}

// A byte budget is a conservative operational guard, not an exact tokenizer.
// Reject the whole request rather than silently dropping document evidence.
export const COURTOS_PILOT_REQUEST_BYTES = 20_000;
export const COURTOS_PILOT_CONTEXT_NOTICE = "Der lokale Pilot kann diesen Umfang nicht in einem Schritt verarbeiten. Bitte einen neuen Chat beginnen oder einen kuerzeren Dokumentausschnitt bzw. eine engere Frage verwenden. Es wurde kein Text stillschweigend gekuerzt und kein externer Dienst aufgerufen.";
