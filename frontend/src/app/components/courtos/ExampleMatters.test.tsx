import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {CourtOSLocaleProvider} from "@/app/contexts/CourtOSLocaleContext";
import {setCourtOSLocale} from "@/app/lib/courtosLocale";
import {ExampleImportError,type ExampleSelection,type ExampleImportResult} from "@/app/lib/importExampleMatter";
import {ExampleMatters} from "./ExampleMatters";
const imports=vi.hoisted(()=>vi.fn());
vi.mock("@/app/lib/importExampleMatter",async original=>({...await original<typeof import("@/app/lib/importExampleMatter")>(),importExampleMatter:imports}));
const selected=[{document:{id:"doc",current_version_id:"version",filename:"01 Standpunkt Bergtal Immobilien AG.pdf",status:"ready"},role:"claim",party:"Bergtal Immobilien AG · Vermieterin"}] as ExampleSelection[];
const result:ExampleImportResult={sources:selected,folderId:"case-folder",reusedCount:0,previousEditionCount:0};
const show=(props:Partial<Parameters<typeof ExampleMatters>[0]>={})=>render(<CourtOSLocaleProvider ownerId="owner"><ExampleMatters disabled={false} inWord={false} onImported={vi.fn()} onImportingChange={vi.fn()} {...props}/></CourtOSLocaleProvider>);
const open=()=>fireEvent.click(screen.getByText("Beispieldossiers"));
const button=()=>screen.getByRole("button",{name:"Vier PDFs übernehmen · FV.2026.117"});
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();setCourtOSLocale("owner","de");});
describe("optional sample matters",()=>{
    it("shows all four numbered matters and source/party provenance without an import or language filter",()=>{
        show();expect(screen.getByText("Beispieldossiers").closest("details")).not.toHaveAttribute("open");open();
        expect(screen.getByText(/keine Originalakten/)).toBeVisible();expect(screen.getAllByRole("link",{name:/Originalurteil/})).toHaveLength(4);
        for(const number of ["FV.2026.117","C.2026.204","OR.2026.83","HG.2026.42"])expect(screen.getByText(`Fiktives Aktenzeichen · ${number}`)).toBeVisible();
        expect(screen.getByRole("heading",{name:"Un versement pour acquérir une villa"})).toBeVisible();expect(screen.queryByRole("combobox")).not.toBeInTheDocument();expect(imports).not.toHaveBeenCalled();
    });
    it("imports only the explicitly chosen matter and locks other actions until completion",async()=>{
        const imported=vi.fn(),busy=vi.fn();let resolve!:(value:ExampleImportResult)=>void;imports.mockReturnValue(new Promise(r=>{resolve=r;}));
        show({onImported:imported,onImportingChange:busy});open();fireEvent.click(button());expect(busy).toHaveBeenCalledWith(true);expect(imports).toHaveBeenCalledOnce();
        expect(screen.getAllByRole("button").every(value=>(value as HTMLButtonElement).disabled)).toBe(true);
        await act(async()=>resolve(result));expect(imported).toHaveBeenCalledWith(selected,"de");expect(busy).toHaveBeenLastCalledWith(false);expect(screen.getByRole("status")).toHaveTextContent("Die Prüfung starten Sie selbst");expect(screen.getByRole("link",{name:"Aktenordner öffnen"})).toHaveAttribute("href","/library/folders/case-folder");
    });
    it("does not overwrite selected work",()=>{show({disabled:true});open();expect(button()).toBeDisabled();expect(imports).not.toHaveBeenCalled();});
    it("preserves Word navigation and explains reused old editions",async()=>{
        imports.mockResolvedValue({...result,reusedCount:4,previousEditionCount:4});show({inWord:true});open();fireEvent.click(button());
        expect(await screen.findByRole("status")).toHaveTextContent("4 vorhandene Übungsdateien");expect(screen.getByRole("status")).toHaveTextContent("Frühere Kopf- und Parteibezeichnungen");expect(screen.getByRole("link",{name:"Aktenordner öffnen"})).toHaveAttribute("href","/library/folders/case-folder?host=word");
    });
    it("does not silently retry an ambiguous upload",async()=>{
        imports.mockRejectedValue(new ExampleImportError("upload",true));show({inWord:true});open();fireEvent.click(button());
        expect(await screen.findByRole("alert")).toHaveTextContent("einzelne Dateien können bereits gespeichert sein");expect(button()).toBeDisabled();expect(screen.getByRole("link",{name:"Bibliothek öffnen"})).toHaveAttribute("href","/library?host=word");expect(imports).toHaveBeenCalledOnce();
    });
    it("makes an existing-file conflict actionable without claiming a new upload",async()=>{
        imports.mockRejectedValue(new ExampleImportError("existing",false));show();open();fireEvent.click(button());expect(await screen.findByRole("alert")).toHaveTextContent("keine weiteren PDFs hochgeladen");
    });
    it("aborts owner-scope unmount and ignores a late completion",async()=>{
        let resolve!:(value:ExampleImportResult)=>void;imports.mockReturnValue(new Promise(r=>{resolve=r;}));const imported=vi.fn();const view=show({onImported:imported});open();fireEvent.click(button());
        const signal=imports.mock.calls[0][1] as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);await act(async()=>resolve(result));expect(imported).not.toHaveBeenCalled();
    });
    it("localizes chrome while keeping all four original-language matters",async()=>{
        show();open();for(const [locale,title] of [["de","Beispieldossiers"],["fr","Dossiers d’exemple"],["it","Fascicoli di esempio"],["en","Example matters"]] as const){await act(async()=>setCourtOSLocale("owner",locale));expect(screen.getByText(title)).toBeVisible();expect(screen.getAllByRole("heading")).toHaveLength(4);}
        expect(imports).not.toHaveBeenCalled();
    });
});
