import type { LanguageModelMiddleware } from "ai" with {
  "resolution-mode": "import",
};
import { abortable } from "../abortable";
import { streamChunkTimeouts } from "../runtimeConfig";
import { LOCAL_QUEUE_HEARTBEAT_MS } from "./courtosLocalQueue";

/** Bound one provider call, including headers, without timing the SDK's tools. */
export function providerDeadlines(
  onActivity?: () => void,
  localPrefillHeartbeat = false,
): LanguageModelMiddleware {
  return {
    wrapStream: async ({ model, params }) => {
      const limits = streamChunkTimeouts();
      const controller = new AbortController();
      const forwardAbort = () => controller.abort(params.abortSignal?.reason);
      let timer: ReturnType<typeof setTimeout> | undefined;
      // A bounded local prefill may legitimately exceed the run's idle clock.
      // Only until first output; the real first-chunk deadline still governs it.
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const stopHeartbeat = () => { clearInterval(heartbeat); heartbeat = undefined; };
      const cleanup = () => {
        stopHeartbeat();
        clearTimeout(timer);
        params.abortSignal?.removeEventListener("abort", forwardAbort);
      };
      const arm = (label: string, ms: number) => {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            controller.abort(
              new DOMException(
                `${label} timeout of ${ms}ms exceeded`,
                "TimeoutError",
              ),
            ),
          ms,
        );
        timer.unref?.();
      };
      if (params.abortSignal?.aborted) forwardAbort();
      else
        params.abortSignal?.addEventListener("abort", forwardAbort, {
          once: true,
        });
      arm("First chunk", limits.firstChunkMs);
      if (localPrefillHeartbeat && onActivity) {
        heartbeat = setInterval(onActivity, LOCAL_QUEUE_HEARTBEAT_MS);
        heartbeat.unref?.();
      }
      try {
        controller.signal.throwIfAborted();
        const pending = Promise.resolve(
          model.doStream({ ...params, abortSignal: controller.signal }),
        );
        // A non-cooperative provider may resolve after the deadline has fired.
        void pending.then(
          (result) => {
            if (controller.signal.aborted)
              void result.stream.cancel().catch(() => {});
          },
          () => {},
        );
        const result = await abortable(pending, controller.signal);
        const reader = result.stream.getReader();
        return {
          ...result,
          stream: new ReadableStream({
            async pull(sink) {
              try {
                const next = await abortable(reader.read(), controller.signal);
                if (next.done) {
                  cleanup();
                  sink.close();
                  return;
                }
                const part = next.value;
                switch (part.type) {
                  case "text-delta":
                  case "reasoning-delta":
                  case "tool-input-delta":
                  case "tool-call":
                  case "file":
                    stopHeartbeat();
                    arm("Chunk", limits.chunkMs);
                    onActivity?.();
                    break;
                  case "finish":
                  case "error":
                    cleanup();
                    sink.enqueue(part);
                    sink.close();
                    void reader.cancel().catch(() => {});
                    return;
                }
                sink.enqueue(part);
              } catch (error) {
                cleanup();
                void reader.cancel(error).catch(() => {});
                sink.error(error);
              }
            },
            cancel(reason) {
              cleanup();
              controller.abort(reason);
              void reader.cancel(reason).catch(() => {});
            },
          }),
        };
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}
