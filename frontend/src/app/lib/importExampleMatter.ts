import type { CaseReviewRole } from "@mike/contracts";
import type { Document, LibraryFolder } from "@/app/components/shared/types";
import { getDocument, getLibrary, getLibraryFolderChildren, moveLibraryDocument, renameLibraryDocument, renameLibraryFolder, resolveLibraryFolderPath, searchLibraryDocuments, uploadLibraryDocuments } from "./mikeApi";
import type { ExampleMatter } from "./exampleMatters";

export type ExampleSelection = {document: Document; role: CaseReviewRole; party: string};
export type ExampleImportResult = {sources: ExampleSelection[];folderId:string;reusedCount:number;previousEditionCount:number};
export type ExampleImportStage = "asset_download" | "asset_integrity" | "inventory" | "existing_file" | "folder_resolve" | "folder_reconcile" | "file_rename" | "file_move" | "upload" | "upload_confirm" | "lock";
export class ExampleImportError extends Error {
    constructor(readonly code: "asset" | "upload" | "existing", readonly uploadAttempted: boolean,
        readonly stage: ExampleImportStage | null = null, readonly status: number | null = null) {
        super(code); this.name = "ExampleImportError";
    }
}
function httpStatus(error: unknown): number | null {
    const status = error && typeof error === "object" && "status" in error ? error.status : null;
    return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}
type Entry = ExampleMatter["documents"][number];
const currentImports = new Set<string>();
const knownEdition = (doc:Document,entry:Entry) => [entry,...entry.previousEditions].some(edition=>doc.content_sha256===edition.sha256&&doc.size_bytes===edition.bytes);
function acceptable(doc:Document,entry:Entry) {
    return !!doc.id&&!!doc.current_version_id&&doc.status==="ready"&&[entry.filename,...entry.previousFilenames].includes(doc.filename)&&doc.project_id==null&&!doc.workflow_id&&(!doc.library_kind||doc.library_kind==="file")&&knownEdition(doc,entry);
}

/** Reuse known folder identities; never merge an unrelated same-name case.
 * The complete existing subtree is checked before its metadata is changed.
 * Revision predicates protect each rename, not an across-device transaction. */
async function reconcileFiling(matter:ExampleMatter,reused:Map<string,Document>,signal:AbortSignal) {
    const fail=()=>{throw new ExampleImportError("existing",false,"folder_reconcile");};
    const roots=await getLibrary("files",{limit:100,offset:0});signal.throwIfAborted();
    const matches=roots.folders.filter(folder=>[matter.caseNumber,matter.legacyFiling.caseNumber].includes(folder.name));
    if(matches.length>1)fail();
    if(!matches.length)return;
    const root=matches[0],renames:{folder:LibraryFolder;name:string}[]=[];
    if(root.parent_folder_id!==null)fail();
    if(root.name!==matter.caseNumber)renames.push({folder:root,name:matter.caseNumber});
    const canonical=new Map<string,string>(),seen=new Set<string>(),known=new Map([...reused.values()].map(doc=>[doc.id,doc]));
    const queue:{folder:LibraryFolder;path:string[]}[]=[{folder:root,path:[]}];let found=0;
    while(queue.length){
        const {folder,path}=queue.shift()!;if(seen.has(folder.id)||seen.size>=20)fail();seen.add(folder.id);
        const content=await getLibraryFolderChildren("files",folder.id,{limit:100,offset:0});signal.throwIfAborted();
        if(content.documentsHasMore)fail();
        for(const doc of content.documents){
            const prior=known.get(doc.id);if(!prior||doc.current_version_id!==prior.current_version_id)fail();
            const fresh=await getDocument(doc.id);signal.throwIfAborted();
            const entry=matter.documents.find(item=>reused.get(item.id)?.id===doc.id);
            if(!entry||!acceptable(fresh,entry)||fresh.current_version_id!==prior!.current_version_id||fresh.content_sha256!==prior!.content_sha256)fail();
            found++;
        }
        for(const child of content.folders){
            if(child.parent_folder_id!==folder.id||!child.updated_at)fail();
            let name=child.name;
            if(path.length===0){
                const party=matter.parties.findIndex((item,index)=>[item.label,matter.legacyFiling.parties[index].label].includes(name));
                if(party>=0)name=matter.parties[party].label;
                else if(![matter.sharedFolder,matter.legacyFiling.sharedFolder].includes(name))fail();
                else name=matter.sharedFolder;
            }else if(path.length!==1||!matter.parties.some(p=>p.label===path[0]&&[p.submissions,p.exhibits].includes(name)))fail();
            const next=[...path,name],key=next.join("\0");if(canonical.has(key)&&canonical.get(key)!==child.id)fail();canonical.set(key,child.id);
            if(name!==child.name)renames.push({folder:child,name});queue.push({folder:child,path:next});
        }
    }
    // An empty same-name case provides no evidence it is our synthetic fixture.
    if(!found&&renames.length)fail();
    for(const {folder,name} of renames){
        signal.throwIfAborted();if(!folder.updated_at)fail();
        const changed=await renameLibraryFolder("files",folder.id,name,{name:folder.name,updated_at:folder.updated_at,parent_folder_id:folder.parent_folder_id});
        signal.throwIfAborted();if(changed.id!==folder.id||changed.name!==name||changed.parent_folder_id!==folder.parent_folder_id)fail();
    }
}

async function runImport(matter:ExampleMatter,signal:AbortSignal):Promise<ExampleImportResult> {
    signal.throwIfAborted();
    async function stage<T>(name: ExampleImportStage, code: ExampleImportError["code"], uploadAttempted: boolean, operation: () => Promise<T>): Promise<T> {
        try { return await operation(); }
        catch (error) {
            if (signal.aborted) throw error;
            if (error instanceof ExampleImportError && error.stage) throw error;
            throw new ExampleImportError(code, uploadAttempted, name, httpStatus(error));
        }
    }
    // Complete the source and existing-file checks before any folder/upload mutation.
    const assets = await Promise.all(matter.documents.map(async entry => {
        if (entry.path!==`/examples/${matter.id}/${entry.id}.pdf` || !/^\/examples\/(DE|FR|IT|EN)-01\/D0[1-4]\.pdf$/.test(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new ExampleImportError("asset", false, "asset_integrity");
        const response = await stage("asset_download", "asset", false, async () => {
            // The path stays readable, while the content version is explicit.
            // An older cached edition must never masquerade as this catalogue.
            const result = await fetch(`${entry.path}?v=${entry.sha256}`, {credentials:"same-origin",signal,redirect:"error",cache:"no-store"});
            if (!result.ok) throw new ExampleImportError("asset",false,"asset_download",result.status);
            return result;
        });
        return stage("asset_integrity", "asset", false, async () => {
            const bytes = await response.arrayBuffer();
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
            if(bytes.byteLength!==entry.bytes||hash!==entry.sha256||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new ExampleImportError("asset",false);
            return {entry,file:new File([bytes],entry.filename,{type:"application/pdf"})};
        });
    }));
    signal.throwIfAborted();
    const inventory = await stage("inventory", "existing", false, async () => {
        const results=await Promise.all([`CourtOS_${matter.id}_`,...matter.documents.map(entry=>entry.filename)].map(search=>searchLibraryDocuments("files",{search,limit:100,offset:0,signal})));
        signal.throwIfAborted();
        if(results.some(result=>result.documentsHasMore))throw new ExampleImportError("existing",false);
        return {documents:[...new Map(results.flatMap(result=>result.documents).map(doc=>[doc.id,doc])).values()]};
    });
    const reused = new Map<string,Document>();
    for(const entry of matter.documents){
        const candidates=inventory.documents.filter(doc=>[entry.filename,...entry.previousFilenames].includes(doc.filename));
        if(candidates.length>1)throw new ExampleImportError("existing",false,"inventory");
        if(!candidates.length)continue;
        const doc = await stage("existing_file", "existing", false, async () => {
            const result=await getDocument(candidates[0].id);signal.throwIfAborted();
            if(!acceptable(result,entry)||result.current_version_id!==candidates[0].current_version_id)throw new ExampleImportError("existing",false);
            return result;
        });
        reused.set(entry.id,doc);
    }
    await stage("folder_reconcile","existing",false,()=>reconcileFiling(matter,reused,signal));
    for(const entry of matter.documents){
        const existing=reused.get(entry.id);if(!existing||existing.filename===entry.filename)continue;
        await stage("file_rename","existing",false,async()=>{
            const fresh=await getDocument(existing.id);signal.throwIfAborted();
            if(!acceptable(fresh,entry)||fresh.current_version_id!==existing.current_version_id||fresh.content_sha256!==existing.content_sha256||!fresh.updated_at)throw new ExampleImportError("existing",false);
            await renameLibraryDocument("files",fresh.id,entry.filename,{version_id:fresh.current_version_id!,content_sha256:fresh.content_sha256!,updated_at:fresh.updated_at,filename:fresh.filename});
            signal.throwIfAborted();const renamed=await getDocument(fresh.id);signal.throwIfAborted();
            if(!acceptable(renamed,entry)||renamed.filename!==entry.filename||renamed.current_version_id!==fresh.current_version_id||renamed.content_sha256!==fresh.content_sha256)throw new ExampleImportError("existing",false);
            reused.set(entry.id,renamed);
        });
    }
    const root=[matter.caseNumber];
    async function folder(segments:readonly string[]){
        signal.throwIfAborted();
        return stage("folder_resolve", "existing", false, async () => {
            const result=await resolveLibraryFolderPath("files",[...root,...segments],null,"reuse");
            signal.throwIfAborted();
            if(result.conflict||!result.folder_id)throw new ExampleImportError("existing",false);
            return result.folder_id;
        });
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
        await stage("file_move", "existing", false, async () => {
            const fresh=await getDocument(existing.id);signal.throwIfAborted();
            if(!acceptable(fresh,entry)||fresh.current_version_id!==existing.current_version_id||fresh.content_sha256!==existing.content_sha256||!fresh.updated_at)throw new ExampleImportError("existing",false);
            await moveLibraryDocument("files",fresh.id,target,{version_id:fresh.current_version_id!,content_sha256:fresh.content_sha256!,updated_at:fresh.updated_at});
            signal.throwIfAborted();
            const moved=await getDocument(fresh.id);signal.throwIfAborted();
            if(!acceptable(moved,entry)||moved.current_version_id!==fresh.current_version_id||moved.content_sha256!==fresh.content_sha256||(moved.library_folder_id??moved.folder_id)!==target)throw new ExampleImportError("existing",false);
            reused.set(entry.id,moved);
        });
    }
    const pending=assets.filter(({entry})=>!reused.has(entry.id));
    let uploaded:Document[]=[];
    if(pending.length){
        uploaded = await stage("upload", "upload", true, async () => {
            const results=await uploadLibraryDocuments("files",pending.map(({entry,file})=>({file,clientId:entry.id,folderId:folders.get(entry.folders.join("\0"))!})),{signal});
            signal.throwIfAborted();
            return Promise.all(pending.map(({entry}) => stage("upload_confirm", "upload", true, async () => {
                const matches=results.filter(result=>result.clientId===entry.id),item=matches[0];
                if(matches.length!==1||item.status!=="completed"||!item.result?.id)throw new ExampleImportError("upload",true);
                const doc=await getDocument(item.result.id);signal.throwIfAborted();
                if(!acceptable(doc,entry)||doc.content_sha256!==entry.sha256||doc.current_version_id!==item.result.current_version_id)throw new ExampleImportError("upload",true);
                return doc;
            })));
        });
    }
    const sources=matter.documents.map(entry=>({document:reused.get(entry.id)??uploaded.find(doc=>doc.filename===entry.filename)!,role:entry.role,party:entry.party}));
    return {sources,folderId,reusedCount:reused.size,previousEditionCount:sources.filter(({document},index)=>document.content_sha256!==matter.documents[index].sha256).length};
}

/** Explicit user action only. The standard personal-library ACL and upload quota
 * apply. Existing known editions are reused, never replaced; no model is called.
 * Web Locks serialise this matter across tabs in one browser. They do not claim
 * cross-device transactionality: ambiguous existing files stop the next import. */
export async function importExampleMatter(matter:ExampleMatter,signal:AbortSignal):Promise<ExampleImportResult>{
    if(currentImports.has(matter.id))throw new ExampleImportError("existing",false,"lock");
    currentImports.add(matter.id);
    try{
        if(typeof navigator!=="undefined"&&navigator.locks?.request){return await navigator.locks.request(`courtos-example-import:${matter.id}`,{mode:"exclusive",signal},()=>runImport(matter,signal));}
        return await runImport(matter,signal);
    } catch(error) {
        if(signal.aborted)throw error;
        const failure=error instanceof ExampleImportError ? error : new ExampleImportError("existing",false,"lock",httpStatus(error));
        // Deliberately exclude filenames, IDs, source text, responses and errors.
        // This bounded diagnostic distinguishes cache checks from library failures.
        console.warn("[courtos/example-import]", {stage:failure.stage, status:failure.status, code:failure.code});
        throw failure;
    }finally{currentImports.delete(matter.id);}
}
