import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { courtosPilotEnabled } from "./courtosPilot";
import type { Db } from "./supabase";
import { UserFacingError } from "./userFacingError";

export const COURTOS_NATIVE_MAX_MS = 20 * 60_000;
export type CourtosQuotaReservation = {
  userId: string;
  signal: AbortSignal;
  attachRun(): void;
  hasRun(): boolean;
  markModelStarted(): void;
  release(): Promise<void>;
};
const context = new AsyncLocalStorage<CourtosQuotaReservation>();

export function currentCourtosQuota(): CourtosQuotaReservation | undefined {
  return context.getStore();
}
export function withCourtosQuota<T>(reservation: CourtosQuotaReservation, work: () => T): T {
  return context.run(reservation, work);
}

export function courtosInferenceRequest(method: string, originalUrl: string): boolean {
  if (method !== "POST") return false;
  const path = originalUrl.split("?")[0].toLowerCase().replace(/\/+$/, "");
  return /^\/(?:chat|word-chat)$/.test(path)
    || /^\/projects\/[^/]+\/chat$/.test(path)
    || /^\/tabular-review\/(?:prompt|[^/]+\/(?:chat|generate|regenerate-cell))$/.test(path);
}

const messages: Record<string, string> = {
  user_daily: "Die drei Analyseaufträge für heute sind verbraucht. Ab dem nächsten UTC-Tag können Sie wieder starten.",
  global_daily: "Das gemeinsame Tageskontingent des Piloten ist verbraucht. Bitte am nächsten UTC-Tag erneut versuchen.",
  user_active: "Für Ihr Konto läuft bereits eine Analyse. Öffnen Sie den laufenden Chat oder warten Sie auf dessen Abschluss.",
  global_active: "Die drei Analyseplätze sind belegt. Bitte warten Sie, bis ein laufender Auftrag beendet ist.",
};

export async function reserveCourtosQuota(db: Db, userId: string): Promise<
  { ok: true; reservation: CourtosQuotaReservation } |
  { ok: false; status: 429 | 503; detail: string; retryAfter: number }
> {
  const id = randomUUID();
  const { data, error } = await db.rpc("courtos_reserve_native_start", { p_user_id: userId, p_attempt_id: id });
  if (error || !data || typeof data.allowed !== "boolean") {
    return { ok: false, status: 503, detail: "Die Nutzungsgrenze kann gerade nicht geprüft werden. Es wurde keine Modellanfrage gestartet. Bitte später erneut versuchen.", retryAfter: 60 };
  }
  if (!data.allowed) return {
    ok: false, status: 429,
    detail: messages[data.reason] ?? "Der Pilot ist momentan ausgelastet. Bitte später erneut versuchen.",
    retryAfter: Number.isFinite(data.retry_after) ? Math.max(1, Math.ceil(data.retry_after)) : 60,
  };
  const controller = new AbortController();
  let attached = false;
  let started = false;
  let released = false;
  const timer = setTimeout(() => controller.abort(new UserFacingError("Die Analyse hat die maximale Laufzeit von 20 Minuten erreicht. Bitte eine engere Teilfrage stellen.")), COURTOS_NATIVE_MAX_MS);
  timer.unref?.();
  const reservation: CourtosQuotaReservation = {
    userId, signal: controller.signal,
    attachRun() { attached = true; },
    hasRun() { return attached; },
    markModelStarted() { controller.signal.throwIfAborted(); started = true; },
    async release() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      controller.abort(new UserFacingError("Dieser Analyseauftrag ist abgeschlossen."));
      // A failed release remains conservatively occupied until its DB lease
      // expires. No retry can erase an already charged model start.
      try {
        await db.rpc("courtos_release_native_start", { p_user_id: userId, p_attempt_id: id, p_model_started: started });
      } catch { /* durable lease remains the fallback */ }
    },
  };
  return { ok: true, reservation };
}

/** Public pilot background jobs cannot bypass the native request ledger. */
export function courtosQuotaFetchInit(init?: RequestInit): RequestInit | undefined {
  if (!courtosPilotEnabled()) return init;
  const reservation = currentCourtosQuota();
  if (!reservation) {
    if (process.env.COURTOS_ACCESS_SELF_REGISTRATION === "true") {
      throw new UserFacingError("Diese Modellfunktion steht im öffentlichen Pilot nur innerhalb eines zugelassenen Analyseauftrags zur Verfügung.");
    }
    return init;
  }
  reservation.markModelStarted();
  return { ...init, signal: init?.signal ? AbortSignal.any([init.signal, reservation.signal]) : reservation.signal };
}
