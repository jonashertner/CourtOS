import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocTable, type DocTableFolder } from "./DocTable";
import type { Document } from "@/app/components/shared/types";

vi.mock("@/app/lib/courtos", async () => ({ ...await vi.importActual("@/app/lib/courtos"), COURTOS_PILOT_MODE: true }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
const date = "2026-10-10T00:00:00.000Z";
const folder = (id:string,name:string,parent_folder_id:string|null):DocTableFolder => ({id,name,parent_folder_id,user_id:"owner",project_id:"personal-library",created_at:date,updated_at:date});
const folders = [folder("case","HG260001",null),folder("party","Klägerin","case"),folder("exhibits","Beilagen","party")];
const original = {id:"original",user_id:"owner",project_id:null,folder_id:"exhibits",filename:"Beilage 1.pdf",status:"ready",file_type:"pdf",storage_path:"original.pdf",current_version_id:"version-original",active_version_number:2,created_at:date,updated_at:date} as Document;
type Operations = ComponentProps<typeof DocTable>["operations"];
function makeOperations():Operations {
    return {uploadDocument:vi.fn(),uploadDocuments:vi.fn(async (files:Parameters<NonNullable<Operations["uploadDocuments"]>>[0])=>files.map(item=>({clientId:item.clientId,filename:item.file.name,status:"completed" as const,result:{...original,id:"additional",current_version_id:"version-additional",active_version_number:1,folder_id:item.folderId,storage_path:"additional.pdf"},errorCode:null}))),refreshCollection:vi.fn(),createFolder:vi.fn(),resolveFolderPath:vi.fn(),renameFolder:vi.fn(),deleteFolder:vi.fn(),moveFolder:vi.fn(),moveDocument:vi.fn(),renameDocument:vi.fn()};
}
function Harness({operations,scope}:{operations:Operations;scope:string}) {
    const [documents,setDocuments]=useState([original]); const [currentFolders,setFolders]=useState(folders);
    return <><output data-testid="state">{JSON.stringify(documents)}</output><DocTable scopeKey={scope} documents={documents} setDocuments={setDocuments} folders={currentFolders} setFolders={setFolders} loading={false} search="" operations={operations} emptyStateTitle="Dokumente" canDo={()=>true} folderViewId="party" /></>;
}
function chooseFiles(container:HTMLElement) {
    const file=new File(["synthetic PDF"],"Beilage 1.pdf",{type:"application/pdf"});
    Object.defineProperty(file,"webkitRelativePath",{value:"Beilagen/Beilage 1.pdf"});
    fireEvent.change(container.querySelector('input[webkitdirectory]')!,{target:{files:[file]}});
    return file;
}
beforeEach(()=>vi.clearAllMocks());
describe("explicit existing-folder upload",()=>{
    it("shows the full path and keeps matching filenames as separate documents without touching original identities",async()=>{
        const operations=makeOperations();vi.mocked(operations.resolveFolderPath).mockResolvedValueOnce({conflict:true,folder_name:"Beilagen",existing_folder_id:"exhibits",suggested_name:"Beilagen (2)"}).mockResolvedValueOnce({conflict:false,folder_id:"exhibits",resolved_name:"Beilagen",folders:[]});
        const {container}=render(<Harness operations={operations} scope="reuse"/>);const file=chooseFiles(container);
        await screen.findByText("HG260001 / Klägerin / Beilagen");
        expect(screen.getByText(/Gleichnamige Dateien werden als zusätzliche Dokumente abgelegt/)).toBeVisible();
        expect(screen.getByRole("button",{name:"Fortfahren"})).toBeDisabled();
        expect(operations.uploadDocuments).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("radio",{name:"Vorhandenen Ordner ergänzen"}));
        await userEvent.click(screen.getByRole("button",{name:"Fortfahren"}));
        await waitFor(()=>expect(operations.uploadDocuments).toHaveBeenCalledOnce());
        expect(operations.uploadDocuments).toHaveBeenCalledWith([{file,folderId:"exhibits",clientId:expect.any(String)}],expect.any(Object));
        await waitFor(()=>expect(JSON.parse(screen.getByTestId("state").textContent!)).toHaveLength(2));
        const documents=JSON.parse(screen.getByTestId("state").textContent!) as Document[];
        expect(documents.find(doc=>doc.id==="original")).toEqual(original);
        expect(documents.find(doc=>doc.id==="additional")).toMatchObject({filename:original.filename,current_version_id:"version-additional",active_version_number:1});
        for(const operation of [operations.uploadDocument,operations.moveDocument,operations.renameDocument,operations.deleteFolder])expect(operation).not.toHaveBeenCalled();
    });
    it("creates the proposed separate folder only after the distinct choice",async()=>{
        const operations=makeOperations();vi.mocked(operations.resolveFolderPath).mockResolvedValueOnce({conflict:true,folder_name:"Beilagen",existing_folder_id:"exhibits",suggested_name:"Beilagen (2)"}).mockResolvedValueOnce({conflict:false,folder_id:"new-exhibits",resolved_name:"Beilagen (2)",folders:[]});
        const {container}=render(<Harness operations={operations} scope="rename"/>);chooseFiles(container);
        await screen.findByText("HG260001 / Klägerin / Beilagen");
        await userEvent.click(screen.getByRole("radio",{name:"Neuen Ordner «Beilagen (2)» anlegen"}));await userEvent.click(screen.getByRole("button",{name:"Fortfahren"}));
        await waitFor(()=>expect(operations.uploadDocuments).toHaveBeenCalledOnce());
        expect(operations.resolveFolderPath).toHaveBeenLastCalledWith(["Beilagen"],"party","rename");
        expect(vi.mocked(operations.uploadDocuments!).mock.calls[0][0][0].folderId).toBe("new-exhibits");
    });
    it("Escape cancels without starting an upload or resolving a replacement",async()=>{
        const operations=makeOperations();vi.mocked(operations.resolveFolderPath).mockResolvedValue({conflict:true,folder_name:"Beilagen",existing_folder_id:"exhibits",suggested_name:"Beilagen (2)"});
        const {container}=render(<Harness operations={operations} scope="cancel"/>);chooseFiles(container);
        await screen.findByText("HG260001 / Klägerin / Beilagen");await userEvent.keyboard("{Escape}");
        await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(operations.resolveFolderPath).toHaveBeenCalledTimes(1);expect(operations.uploadDocuments).not.toHaveBeenCalled();
        expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual([original]);
    });
});
