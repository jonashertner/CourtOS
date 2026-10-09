/** Pilot storage reservations are lifetime budgets, not current disk usage. */
import { courtosPilotEnabled } from "../../lib/courtosPilot";

export function courtosUploadPolicy(env: NodeJS.ProcessEnv = process.env) {
  if (!courtosPilotEnabled(env)) return null;
  function limit(name: string, fallback: number, min: number, max: number) {
    const raw = env[name]?.trim();
    const value = raw === undefined || raw === "" ? fallback : Number(raw);
    if (!/^\d+$/.test(raw ?? String(fallback)) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  }
  return {
    maxFileBytes: limit("COURTOS_UPLOAD_MAX_FILE_BYTES", 5 * 1024 * 1024, 1, 100 * 1024 * 1024),
    maxBatchFiles: limit("COURTOS_UPLOAD_MAX_BATCH_FILES", 5, 1, 50),
    userTotalBytes: limit("COURTOS_UPLOAD_USER_TOTAL_BYTES", 20 * 1024 * 1024, 0, Number.MAX_SAFE_INTEGER),
    globalTotalBytes: limit("COURTOS_UPLOAD_GLOBAL_TOTAL_BYTES", 500 * 1024 * 1024, 0, Number.MAX_SAFE_INTEGER),
  };
}
