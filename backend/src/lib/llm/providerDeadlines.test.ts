import { afterEach, expect, it, vi } from "vitest";
import { streamAiSdk } from "./aiSdk";
import { resetStreamRunsForTests, startStreamRun } from "../streamRuns";
import {
  callStep,
  config,
  makeModel,
  okRunTools,
  textStep,
  TOOLS,
} from "./__tests__/mockLanguageModel";

afterEach(() => {
  resetStreamRunsForTests();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("keeps bounded local prefill alive beyond run idle but still enforces the first-output deadline", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  vi.useFakeTimers();
  vi.stubEnv("COURTOS_PILOT_MODE", "true");
  vi.stubEnv("STREAM_FIRST_CHUNK_TIMEOUT_MS", "600000");
  vi.stubEnv("STREAM_IDLE_TIMEOUT_MS", "300000");
  const run = startStreamRun({ id:"prefill-heartbeat", key: "prefill-heartbeat", userId: "synthetic", meta: {}, forcedStopFrames:[] })!;
  const activity=vi.fn(()=>run.touch());
  let entered = false;
  const model = new MockLanguageModelV3({ doStream: () => { entered=true; return new Promise(()=>{}); } });
  const pending = streamAiSdk({ model:"m", systemPrompt:"S", messages:[{role:"user",content:"synthetic"}], abortSignal:run.signal, callbacks:{onActivity:activity} },config(model));
  const deadline=expect(pending).rejects.toThrow(/stopped responding/);
  await vi.waitFor(()=>expect(entered).toBe(true));
  await vi.advanceTimersByTimeAsync(300001);
  expect(run.stopped).toBe(false);expect(activity).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300000);await deadline;
  run.finish();expect(vi.getTimerCount()).toBe(1); // only the normal finished-run retention timer remains
  resetStreamRunsForTests();expect(vi.getTimerCount()).toBe(0);
});
it("a healthy tool may take longer than the model chunk timeout", async () => {
  vi.stubEnv("STREAM_CHUNK_TIMEOUT_MS", "5000");
  vi.stubEnv("STREAM_FIRST_CHUNK_TIMEOUT_MS", "10000");
  const model = await makeModel([
    callStep("c1", "read_document", { doc_id: "doc-0" }),
    textStep("done"),
  ]);
  const result = await streamAiSdk(
    {
      model: "m",
      systemPrompt: "S",
      messages: [{ role: "user", content: "go" }],
      tools: TOOLS,
      runTools: async (calls) => {
        await new Promise((resolve) => setTimeout(resolve, 6500));
        return okRunTools(calls);
      },
    },
    config(model),
  );
  expect(result.fullText).toBe("done");
}, 15000);

it("stops local prefill heartbeats after output and does not hide a stalled stream",async()=>{
  const { MockLanguageModelV3 }=await import("ai/test");vi.useFakeTimers();
  vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("STREAM_CHUNK_TIMEOUT_MS","120000");
  const activity=vi.fn(),cancel=vi.fn();
  const model=new MockLanguageModelV3({doStream:async()=>({stream:new ReadableStream({start(controller){controller.enqueue({type:"text-start",id:"t"});controller.enqueue({type:"text-delta",id:"t",delta:"partial"});},cancel})})});
  const pending=streamAiSdk({model:"m",systemPrompt:"S",messages:[{role:"user",content:"synthetic"}],callbacks:{onActivity:activity}},config(model));
  const failed=expect(pending).rejects.toThrow(/stopped responding/);
  await vi.waitFor(()=>expect(activity).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(30_000);expect(activity).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(90_001);await failed;
  expect(cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it("ends a stalled provider read even when the provider ignores abort", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  vi.useFakeTimers();
  vi.stubEnv("STREAM_CHUNK_TIMEOUT_MS", "5000");
  const cancel = vi.fn();
  const activity = vi.fn();
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "t" });
          controller.enqueue({ type: "text-delta", id: "t", delta: "partial" });
        },
        cancel,
      }),
    }),
  });
  const pending = streamAiSdk(
    {
      model: "m",
      systemPrompt: "S",
      messages: [{ role: "user", content: "go" }],
      callbacks: { onActivity: activity },
    },
    config(model),
  );
  const assertion = expect(pending).rejects.toThrow(/stopped responding/);
  await vi.advanceTimersByTimeAsync(5001);
  await assertion;
  expect(activity).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels a provider response that arrives after the first-output deadline", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  vi.useFakeTimers();
  vi.stubEnv("STREAM_FIRST_CHUNK_TIMEOUT_MS", "10000");
  const cancel = vi.fn();
  let resolveHeaders!: (value: { stream: ReadableStream }) => void;
  const model = new MockLanguageModelV3({
    doStream: () =>
      new Promise((resolve) => {
        resolveHeaders = resolve;
      }),
  });
  const pending = streamAiSdk(
    {
      model: "m",
      systemPrompt: "S",
      messages: [{ role: "user", content: "go" }],
    },
    config(model),
  );
  const assertion = expect(pending).rejects.toThrow(/stopped responding/);
  await vi.advanceTimersByTimeAsync(10001);
  await assertion;
  resolveHeaders({ stream: new ReadableStream({ cancel }) });
  await vi.advanceTimersByTimeAsync(1);
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps healthy slow provider output alive and clears timers on completion", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  const { finish } = await import("./__tests__/mockLanguageModel.js");
  vi.useFakeTimers();
  vi.stubEnv("STREAM_CHUNK_TIMEOUT_MS", "5000");
  let controller!: ReadableStreamDefaultController;
  const cancel = vi.fn();
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          controller = c;
        },
        cancel,
      }),
    }),
  });
  const pending = streamAiSdk(
    {
      model: "m",
      systemPrompt: "S",
      messages: [{ role: "user", content: "go" }],
    },
    config(model),
  );
  await vi.advanceTimersByTimeAsync(1);
  controller.enqueue({ type: "text-start", id: "t" });
  for (let i = 0; i < 5; i++) {
    controller.enqueue({ type: "text-delta", id: "t", delta: "x" });
    await vi.advanceTimersByTimeAsync(4000);
  }
  controller.enqueue({ type: "text-end", id: "t" });
  controller.enqueue(finish("stop"));
  // Even a provider that forgets EOF after its terminal event is released.
  await expect(pending).resolves.toEqual({ fullText: "xxxxx" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
