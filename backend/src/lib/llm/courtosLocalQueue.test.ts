import { afterEach, expect, it, vi } from "vitest";
import { LOCAL_QUEUE_HEARTBEAT_MS, LocalModelFifo, notifyCourtosModelDispatch, withCourtosLocalQueue } from "./courtosLocalQueue";

const deferred = <T = void>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

it("admits one operation and two FIFO waiters, rejecting a fourth without running it", async()=>{
  const fifo = new LocalModelFifo(), held = deferred(), order: number[] = [];
  const run = (n:number, work:()=>Promise<void>) => fifo.run("model",new AbortController().signal,{},async()=>{order.push(n);await work();});
  const first=run(1,()=>held.promise), second=run(2,async()=>{}), third=run(3,async()=>{});
  await expect(run(4,async()=>{})).rejects.toThrow("drei lokalen");
  expect(order).toEqual([1]); held.resolve(); await Promise.all([first,second,third]);
  expect(order).toEqual([1,2,3]);
  await run(5,async()=>{}); expect(order).toEqual([1,2,3,5]);
});

it("removes a cancelled waiter without executing it and advances after an active failure",async()=>{
  const fifo=new LocalModelFifo(),held=deferred(),abort=new AbortController(),cancelled=vi.fn(),third=vi.fn();
  const first=fifo.run("model",new AbortController().signal,{},()=>held.promise);
  const firstFailure=expect(first).rejects.toThrow("synthetic");
  const second=fifo.run("model",abort.signal,{},cancelled);
  const secondFailure=expect(second).rejects.toThrow("cancelled");
  const last=fifo.run("model",new AbortController().signal,{},async()=>{third();});
  abort.abort(new Error("cancelled")); await secondFailure; expect(cancelled).not.toHaveBeenCalled();
  held.reject(new Error("synthetic")); await firstFailure; await last; expect(third).toHaveBeenCalledOnce();
});

it("touches a waiting run without claiming inference, then removes its heartbeat",async()=>{
  vi.useFakeTimers(); const fifo=new LocalModelFifo(),held=deferred(),heartbeat=vi.fn(),waiting=vi.fn(),work=vi.fn();
  const first=fifo.run("model",new AbortController().signal,{},()=>held.promise);
  const second=fifo.run("model",new AbortController().signal,{heartbeat,waiting},async()=>{work();});
  await vi.advanceTimersByTimeAsync(LOCAL_QUEUE_HEARTBEAT_MS*21);
  expect(waiting).toHaveBeenCalledOnce(); expect(heartbeat).toHaveBeenCalledTimes(22); expect(work).not.toHaveBeenCalled();
  held.resolve(); await Promise.all([first,second]);
  expect(work).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("cleans a cancelled waiter even while its queued-status persistence is pending",async()=>{
  const fifo=new LocalModelFifo(),held=deferred(),status=deferred(),abort=new AbortController(),work=vi.fn();
  const first=fifo.run("model",new AbortController().signal,{},()=>held.promise);
  const second=fifo.run("model",abort.signal,{waiting:()=>status.promise},work);
  const cancelled=expect(second).rejects.toThrow("cancelled");
  abort.abort(new Error("cancelled"));held.resolve();await first;status.resolve();await cancelled;
  expect(work).not.toHaveBeenCalled();
  await fifo.run("model",new AbortController().signal,{},async()=>{});
});

it("releases a slot granted while a queued status write is failing",async()=>{
  const fifo=new LocalModelFifo(),held=deferred(),status=deferred(),work=vi.fn(),last=vi.fn();
  const first=fifo.run("model",new AbortController().signal,{},()=>held.promise);
  const second=fifo.run("model",new AbortController().signal,{waiting:()=>status.promise},work);
  const failed=expect(second).rejects.toThrow("storage");
  const third=fifo.run("model",new AbortController().signal,{},async()=>{last();});
  held.resolve();await first;status.reject(new Error("storage"));await failed;await third;
  expect(work).not.toHaveBeenCalled();expect(last).toHaveBeenCalledOnce();
});

it("does not share a lane between different configured endpoints",async()=>{
  const fifo=new LocalModelFifo(),held=deferred();
  const first=fifo.run("A",new AbortController().signal,{},()=>held.promise);
  await expect(fifo.run("B",new AbortController().signal,{},async()=>"independent")).resolves.toBe("independent");
  held.resolve();await first;
});

it("invalidates a finished operation's inherited dispatch authority",async()=>{
  vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION","false");
  const resume=deferred();let late!:Promise<void>;
  await withCourtosLocalQueue("courtos-local",undefined,undefined,async()=>{
    late=resume.promise.then(()=>notifyCourtosModelDispatch());
  });
  const rejected=expect(late).rejects.toThrow("abgeschlossen");resume.resolve();await rejected;
});
