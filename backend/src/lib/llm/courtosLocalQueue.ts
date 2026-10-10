import { AsyncLocalStorage } from "node:async_hooks";
import { courtosPilotModel } from "../courtosPilot";
import { COURTOS_NATIVE_MAX_MS, currentCourtosQuota } from "../courtosQuota";
import { UserFacingError } from "../userFacingError";
import type { StreamCallbacks } from "./types";

export const LOCAL_QUEUE_HEARTBEAT_MS = 15_000;
type Entry = { grant: (release: () => void) => void; reject: (error: unknown) => void; signal: AbortSignal; aborted: () => void };
type Lane = { active: boolean; waiting: Entry[] };

/** Single-process FIFO. A lease covers the native provider operation, including
 * its tool rounds; it is not a distributed queue or proof of remote GPU work. */
export class LocalModelFifo {
  private lanes = new Map<string, Lane>();
  async run<T>(key: string, signal: AbortSignal, callbacks: { waiting?: () => void | Promise<void>; heartbeat?: () => void }, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    let lane = this.lanes.get(key);
    if (!lane) { lane = { active: false, waiting: [] }; this.lanes.set(key, lane); }
    if (lane.waiting.length + Number(lane.active) >= 3) throw new UserFacingError("Die drei lokalen Analyseplätze sind belegt. Bitte einen laufenden Auftrag beenden lassen.");
    const selected = lane;
    let entry!: Entry;
    let release: (() => void) | undefined;
    const queued = selected.active;
    const ticket = new Promise<() => void>((resolve, reject) => {
      entry = { signal, reject, grant: value => { release = value; resolve(value); }, aborted: () => {
        const index = selected.waiting.indexOf(entry);
        if (index >= 0) { selected.waiting.splice(index, 1); reject(signal.reason); }
      } };
      signal.addEventListener("abort", entry.aborted, { once: true });
      selected.waiting.push(entry);
      this.advance(key, selected);
    });
    // Abort can reject while an asynchronous status write is still unwinding.
    void ticket.catch(() => {});
    const heartbeat = queued ? setInterval(() => {
      if (!release && !signal.aborted) callbacks.heartbeat?.();
    }, LOCAL_QUEUE_HEARTBEAT_MS) : undefined;
    heartbeat?.unref?.();
    try {
      if (queued) { callbacks.heartbeat?.(); await callbacks.waiting?.(); }
      await ticket;
      signal.throwIfAborted();
      return await work();
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      signal.removeEventListener("abort", entry.aborted);
      // A failed status write can leave an ungranted ticket: remove it too.
      const index = selected.waiting.indexOf(entry);
      if (index >= 0) selected.waiting.splice(index, 1);
      release?.();
    }
  }
  private advance(key: string, lane: Lane): void {
    if (lane.active) return;
    let next: Entry | undefined;
    while ((next = lane.waiting.shift())) {
      if (next.signal.aborted) { next.reject(next.signal.reason); continue; }
      lane.active = true;
      let released = false;
      next.grant(() => {
        if (released) return;
        released = true; lane.active = false; this.advance(key, lane);
      });
      return;
    }
    if (this.lanes.get(key) === lane) this.lanes.delete(key);
  }
}

const fifo = new LocalModelFifo();
const dispatchContext = new AsyncLocalStorage<{ signal: AbortSignal; dispatch?: () => void | Promise<void> }>();

/** Called after exact URL/body/context validation, immediately before the
 * existing quota mark and model HTTP dispatch. Queue cancellation never gets here. */
export async function notifyCourtosModelDispatch(): Promise<void> {
  if (!courtosPilotModel()) return;
  const context = dispatchContext.getStore();
  if (!context) throw new UserFacingError("Der lokale Modellauftrag hat keinen zugelassenen Ausführungsplatz.");
  context.signal.throwIfAborted();
  await context.dispatch?.();
  context.signal.throwIfAborted();
}

export async function withCourtosLocalQueue<T>(model: string, signal: AbortSignal | undefined, callbacks: StreamCallbacks | undefined, work: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  const configured = courtosPilotModel();
  if (!configured) return work(signal);
  if (model !== configured.id) throw new UserFacingError("This CourtOS pilot uses only its configured local model.");
  const quota = currentCourtosQuota();
  if (!quota && process.env.COURTOS_ACCESS_SELF_REGISTRATION === "true") throw new UserFacingError("Diese Modellfunktion steht im öffentlichen Pilot nur innerhalb eines zugelassenen Analyseauftrags zur Verfügung.");
  if (dispatchContext.getStore()) throw new UserFacingError("Ein verschachtelter lokaler Modellauftrag ist in diesem Pilot nicht verfügbar.");
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(new UserFacingError("Der lokale Auftrag hat seine maximale Warte- und Laufzeit erreicht.")), COURTOS_NATIVE_MAX_MS);
  timer.unref?.();
  const bounded = AbortSignal.any([...(signal ? [signal] : []), ...(quota ? [quota.signal] : []), limit.signal]);
  try {
    return await fifo.run(configured.baseUrl, bounded, {
      waiting: () => callbacks?.onProviderState?.("queued"), heartbeat: callbacks?.onActivity,
    }, () => dispatchContext.run({ signal: bounded, dispatch: () => callbacks?.onProviderState?.("dispatching") }, () => work(bounded)));
  } finally {
    clearTimeout(timer);
    // The SDK may have spawned descendants that outlive its returned promise.
    // Their inherited ALS context must not authorize a late model dispatch.
    limit.abort(new UserFacingError("Dieser lokale Modellauftrag ist abgeschlossen."));
  }
}
