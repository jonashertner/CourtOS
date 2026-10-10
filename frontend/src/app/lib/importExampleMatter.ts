import type { CaseReviewRole } from "@mike/contracts";
import type { Document } from "@/app/components/shared/types";
import { getDocument, moveLibraryDocument, resolveLibraryFolderPath, searchLibraryDocuments, uploadLibraryDocuments } from "./mikeApi";
import type { ExampleMatter } from "./exampleMatters";

export type ExampleSelection = {document: Document; role: CaseReviewRole; party: string};
export type ExampleImportResult = {sources: ExampleSelection[];folderId:string;reusedCount:number;previousEditionCount:number};
export class ExampleImportError extends Error {
    constructor(readonly code: "asset" | "upload" | "existing", readonly uploadAttempted: boolean) {
        super(code); this.name = "ExampleImportError";
    }
}
type Entry = ExampleMatter["documents"][number];
const currentImports = new Set<string>();
const knownEdition = (doc:Document,entry:Entry) => [entry,...entry.previousEditions].some(edition=>doc.content_sha256===edition.sha256&&doc.size_bytes===edition.bytes);
function acceptable(doc:Document,entry:Entry) {
    return !!doc.id&&!!doc.current_version_id&&doc.status==="ready"&&doc.filename===entry.filename&&doc.project_id==null&&!doc.workflow_id&&(!doc.library_kind||doc.library_kind==="file")&&knownEdition(doc,entry);
}

async function runImport(matter:ExampleMatter,signal:AbortSignal):Promise<ExampleImportResult> {
    signal.throwIfAborted();
    // Complete the source and existing-file checks before any folder/upload mutation.
    const assets = await Promise.all(matter.documents.map(async entry => {
        if (!/^\/examples\/(DE|FR|IT|EN)-01\/CourtOS_[A-Z]{2}-01_D0[1-4]\.pdf$/.test(entry.path)) throw new ExampleImportError("asset", false);
        const response = await fetch(entry.path, {credentials:"same-origin",signal,redirect:"error"});
        if (!response.ok) throw new ExampleImportError("asset",false);
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
        if(bytes.byteLength!==entry.bytes||hash!==entry.sha256||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new ExampleImportError("asset",false);
        return {entry,file:new File([bytes],entry.filename,{type:"application/pdf"})};
    }));
    signal.throwIfAborted();
    const inventory = await searchLibraryDocuments("files",{search:`CourtOS_${matter.id}_`,limit:100,offset:0,signal});
    signal.throwIfAborted();
    if(inventory.documentsHasMore)throw new ExampleImportError("existing",false);
    const reused = new Map<string,Document>();
    for(const entry of matter.documents){
        const candidates=inventory.documents.filter(doc=>doc.filename===entry.filename);
        if(candidates.length>1)throw new ExampleImportError("existing",false);
        if(!candidates.length)continue;
        const doc=await getDocument(candidates[0].id);signal.throwIfAborted();
        if(!acceptable(doc,entry)||doc.current_version_id!==candidates[0].current_version_id)throw new ExampleImportError("existing",false);
        reused.set(entry.id,doc);
    }
    const root=[matter.caseNumber];
    async function folder(segments:readonly string[]){
        signal.throwIfAborted();
        const result=await resolveLibraryFolderPath("files",[...root,...segments],null,"reuse");
        signal.throwIfAborted();
        if(result.conflict||!result.folder_id)throw new ExampleImportError("existing",false);
        return result.folder_id;
    }
    const folderId=await folder([]);
    // Keep party-specific submissions and exhibit folders visible even where this
    // exercise has no party-attributed exhibits. Shared extracts stay unassigned.
    for(const party of matter.parties){await folder([party.label,party.submissions]);await folder([party.label,party.exhibits]);}
    const folders=new Map<string,string>();
    for(const entry of matter.documents){const key=entry.folders.join("\0");if(!folders.has(key))folders.set(key,await folder(entry.folders));}
    for(const entry of matter.documents){
        const existing=reused.get(entry.id);if(!existing)continue;
        const target=folders.get(entry.folders.join("\0"))!;
        if((existing.library_folder_id??existing.folder_id??null)===target)continue;
        const fresh=await getDocument(existing.id);signal.throwIfAborted();
        if(!acceptable(fresh,entry)||fresh.current_version_id!==existing.current_version_id||fresh.content_sha256!==existing.content_sha256||!fresh.updated_at)throw new ExampleImportError("existing",false);
        try{
            await moveLibraryDocument("files",fresh.id,target,{version_id:fresh.current_version_id!,content_sha256:fresh.content_sha256!,updated_at:fresh.updated_at});
            signal.throwIfAborted();
            const moved=await getDocument(fresh.id);signal.throwIfAborted();
            if(!acceptable(moved,entry)||moved.current_version_id!==fresh.current_version_id||moved.content_sha256!==fresh.content_sha256||(moved.library_folder_id??moved.folder_id)!==target)throw new ExampleImportError("existing",false);
            reused.set(entry.id,moved);
        }catch(error){if(signal.aborted)throw error;throw new ExampleImportError("existing",false);}
    }
    const pending=assets.filter(({entry})=>!reused.has(entry.id));
    let uploaded:Document[]=[];
    if(pending.length){
        try{
            const results=await uploadLibraryDocuments("files",pending.map(({entry,file})=>({file,clientId:entry.id,folderId:folders.get(entry.folders.join("\0"))!})),{signal});
            signal.throwIfAborted();
            uploaded=await Promise.all(pending.map(async({entry})=>{
                const matches=results.filter(result=>result.clientId===entry.id),item=matches[0];
                if(matches.length!==1||item.status!=="completed"||!item.result?.id)throw new ExampleImportError("upload",true);
                const doc=await getDocument(item.result.id);signal.throwIfAborted();
                if(!acceptable(doc,entry)||doc.content_sha256!==entry.sha256||doc.current_version_id!==item.result.current_version_id)throw new ExampleImportError("upload",true);
                return doc;
            }));
        }catch(error){if(signal.aborted)throw error;throw new ExampleImportError("upload",true);}
    }
    const sources=matter.documents.map(entry=>({document:reused.get(entry.id)??uploaded.find(doc=>doc.filename===entry.filename)!,role:entry.role,party:entry.party}));
    return {sources,folderId,reusedCount:reused.size,previousEditionCount:sources.filter(({document},index)=>document.content_sha256!==matter.documents[index].sha256).length};
}

/** Explicit user action only. The standard personal-library ACL and upload quota
 * apply. Existing known editions are reused, never replaced; no model is called.
 * Web Locks serialise this matter across tabs in one browser. They do not claim
 * cross-device transactionality: ambiguous existing files stop the next import. */
export async function importExampleMatter(matter:ExampleMatter,signal:AbortSignal):Promise<ExampleImportResult>{
    if(currentImports.has(matter.id))throw new ExampleImportError("existing",false);
    currentImports.add(matter.id);
    try{
        if(typeof navigator!=="undefined"&&navigator.locks?.request){return await navigator.locks.request(`courtos-example-import:${matter.id}`,{mode:"exclusive",signal},()=>runImport(matter,signal));}
        return await runImport(matter,signal);
    }finally{currentImports.delete(matter.id);}
}
