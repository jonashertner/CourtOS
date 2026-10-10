import { courtosPilotFetchInit, courtosPilotModel } from "../courtosPilot";
import { currentCourtosQuota } from "../courtosQuota";
import { UserFacingError } from "../userFacingError";

export class ReviewContextError extends UserFacingError {
  readonly code = "review_context_unavailable";
  constructor() { super("Der vollständige Auftrag passt nicht sicher in den lokalen Modellkontext oder die Tokenprüfung ist nicht verfügbar. Bitte weniger Quellen auswählen. Es wurde kein Text gekürzt und keine Modellantwort begonnen."); }
}

async function boundedJson(response: Response, cap: number): Promise<Record<string, unknown>> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || Number(response.headers.get("content-length")) > cap || !response.body) {
    await response.body?.cancel(); throw new ReviewContextError();
  }
  const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>cap){await reader.cancel();throw new ReviewContextError();}chunks.push(value);}
    const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,size)));
    if(!data||typeof data!=="object"||Array.isArray(data))throw new ReviewContextError();
    return data;
  }finally{reader.releaseLock();}
}

/** Pinned b11429 implements this endpoint with the SAME oaicompat parser and
 * tokenize_mixed(prompt,true,true) used for chat; no inference is performed.
 * https://github.com/ggml-org/llama.cpp/blob/b11429/tools/server/server-context.cpp
 * The actual SDK body is checked, not an approximate reconstruction. */
export async function preflightCourtosReviewRequest(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  try {
    const model=courtosPilotModel(); const quota=currentCourtosQuota();
    if(!model||!quota||typeof init?.body!=="string")throw new ReviewContextError();
    courtosPilotFetchInit(input,init); // exact loopback inference URL/body boundary
    const body=JSON.parse(init.body) as Record<string,unknown>;
    if(body.max_tokens!==2048||body.model!==model.apiModel||body.tools!==undefined||body.tool_choice!==undefined)throw new ReviewContextError();
    const base=new URL(model.baseUrl); const origin=base.origin;
    if(base.pathname!=="/v1")throw new ReviewContextError();
    const signal=AbortSignal.any([quota.signal,...(init.signal?[init.signal]:[]),AbortSignal.timeout(10_000)]);
    signal.throwIfAborted();
    const common={redirect:"error" as const,signal,credentials:"omit" as const};
    const props=await boundedJson(await fetch(origin+"/props",{...common,method:"GET",headers:{Accept:"application/json"}}),128_000);
    const settings=props.default_generation_settings;
    const context=settings&&typeof settings==="object"&&!Array.isArray(settings)?(settings as Record<string,unknown>).n_ctx:undefined;
    if(!Number.isSafeInteger(context)||Number(context)<256)throw new ReviewContextError();
    const counted=await boundedJson(await fetch(origin+"/v1/chat/completions/input_tokens",{...common,method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:init.body}),4096);
    if(!Number.isSafeInteger(counted.input_tokens)||Number(counted.input_tokens)<1||Number(counted.input_tokens)+2048+64>Math.min(Number(context),8192))throw new ReviewContextError();
    signal.throwIfAborted();
  }catch(error){
    if(error instanceof ReviewContextError)throw error;
    // Never propagate tokenizer response, source body, server props or error text.
    throw new ReviewContextError();
  }
}
