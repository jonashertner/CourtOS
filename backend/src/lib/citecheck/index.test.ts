import { beforeEach, describe, expect, it, vi } from "vitest";
const fs=vi.hoisted(()=>({readFile:vi.fn(),stat:vi.fn()}));
const fixture=vi.hoisted(()=>({gzip:Buffer.alloc(0)}));
vi.mock("node:fs/promises",()=>fs);
vi.mock("./index-manifest.json",async()=>{
  const {gzipSync}=await import("node:zlib"),{createHash}=await import("node:crypto");
  const raw=Buffer.from("#ocl-cite-index 1 synthetic-test-only\n4A_747/2012\tbger\tCH\t2013-04-05\t1\tbger_4A_747_2012\n");fixture.gzip=gzipSync(raw);
  return {default:{file:"synthetic.tsv.gz",bytes:fixture.gzip.length,unpacked_bytes:raw.length,sha256:createHash("sha256").update(fixture.gzip).digest("hex")}};
});
beforeEach(async()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv("COURTOS_CITATION_INDEX_DIR","/public-index");await import("./index.js");fs.stat.mockImplementation(async()=>({isFile:()=>true,size:fixture.gzip.length}));fs.readFile.mockImplementation(async()=>fixture.gzip);});
describe("offline pinned public index",()=>{
  it("verifies and decodes once while sharing concurrent loads",async()=>{
    const {loadCitationIndex}=await import("./index.js");const [a,b]=await Promise.all([loadCitationIndex(),loadCitationIndex()]);
    expect(a).toBe(b);expect(a.lookup("4A_747/2012")[0].id).toBe("bger_4A_747_2012");expect(fs.readFile).toHaveBeenCalledOnce();
  });
  it("refuses missing/relative configuration without reading files",async()=>{
    const {loadCitationIndex}=await import("./index.js");vi.stubEnv("COURTOS_CITATION_INDEX_DIR","relative");await expect(loadCitationIndex()).rejects.toThrow();expect(fs.readFile).not.toHaveBeenCalled();
  });
  it("refuses a corrupt same-size file and permits a later corrected load",async()=>{
    const {loadCitationIndex}=await import("./index.js");fs.readFile.mockResolvedValueOnce(Buffer.alloc(fixture.gzip.length));
    await expect(loadCitationIndex()).rejects.toThrow();expect((await loadCitationIndex()).has("4A_747/2012")).toBe(true);
  });
  it("rejects size drift before reading",async()=>{
    const {loadCitationIndex}=await import("./index.js");fs.stat.mockResolvedValue({isFile:()=>true,size:fixture.gzip.length+1});await expect(loadCitationIndex()).rejects.toThrow();expect(fs.readFile).not.toHaveBeenCalled();
  });
  it("has no network fallback on disk failure",async()=>{
    const {loadCitationIndex}=await import("./index.js");fs.readFile.mockRejectedValue(new Error("private internal path"));const fetch=vi.spyOn(globalThis,"fetch");
    await expect(loadCitationIndex()).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
});
