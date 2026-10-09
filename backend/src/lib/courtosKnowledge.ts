import { courtosPilotEnabled } from "./courtosPilot";

export function courtosKnowledgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return courtosPilotEnabled(env) && env.COURTOS_KNOWLEDGE_ENABLED === "true";
}
export const KNOWLEDGE_MAX_DOCUMENTS = 20;
export const KNOWLEDGE_MAX_PAGES = 200;
export const KNOWLEDGE_MAX_CHARS = 250_000;
export const KNOWLEDGE_MAX_PDF_BYTES = 15 * 1024 * 1024;
