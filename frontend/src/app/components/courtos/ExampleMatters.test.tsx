import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {CourtOSLocaleProvider} from "@/app/contexts/CourtOSLocaleContext";
import {setCourtOSLocale} from "@/app/lib/courtosLocale";
import {ExampleImportError,type ExampleSelection} from "@/app/lib/importExampleMatter";
import {ExampleMatters} from "./ExampleMatters";
const imports=vi.hoisted(()=>vi.fn());
vi.mock("@/app/lib/importExampleMatter",async original=>({...await original<typeof import("@/app/lib/importExampleMatter")>(),importExampleMatter:imports}));
const selected=[{document:{id:"doc",current_version_id:"version",filename:"CourtOS_DE-01_D01.pdf",status:"ready"},role:"claim",party:"Vermieterin"}] as ExampleSelection[];
const show=(props:Partial<Parameters<typeof ExampleMatters>[0]>={})=>render(<CourtOSLocaleProvider ownerId="owner"><ExampleMatters disabled={false} inWord={false} onImported={vi.fn()} onImportingChange={vi.fn()} {...props}/></CourtOSLocaleProvider>);
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();setCourtOSLocale("owner","de");});
describe("optional sample matters",()=>{
    it("stays optional and explains provenance before any upload; choosing a language does not import",()=>{
        show();const summary=screen.getByText("Beispieldossiers");expect(summary.closest("details")).not.toHaveAttribute("open");fireEvent.click(summary);
        expect(screen.getByText(/keine Originalakten/)).toBeVisible();expect(screen.getByRole("link",{name:/Originalurteil/})).toHaveAttribute("href",expect.stringContaining("search.bger.ch"));
        fireEvent.change(screen.getByLabelText("Dossiersprache"),{target:{value:"FR-01"}});expect(imports).not.toHaveBeenCalled();expect(screen.getByRole("heading",{name:"Un versement pour acquérir une villa"})).toBeVisible();
    });
    it("imports once on explicit action, reports ready sources and locks the parent during the upload",async()=>{
        const imported=vi.fn(),busy=vi.fn();let resolve!:(value:ExampleSelection[])=>void;imports.mockReturnValue(new Promise(r=>{resolve=r;}));
        show({onImported:imported,onImportingChange:busy});fireEvent.click(screen.getByText("Beispieldossiers"));fireEvent.click(screen.getByRole("button",{name:"Vier PDFs übernehmen"}));
        expect(busy).toHaveBeenCalledWith(true);expect(screen.getByLabelText("Dossiersprache")).toBeDisabled();expect(imports).toHaveBeenCalledOnce();
        await act(async()=>resolve(selected));expect(imported).toHaveBeenCalledWith(selected,"de");expect(busy).toHaveBeenLastCalledWith(false);expect(screen.getByRole("status")).toHaveTextContent("Die Prüfung starten Sie selbst");
    });
    it("does not overwrite existing selected work",()=>{show({disabled:true});fireEvent.click(screen.getByText("Beispieldossiers"));expect(screen.getByRole("button",{name:"Vier PDFs übernehmen"})).toBeDisabled();expect(imports).not.toHaveBeenCalled();});
    it("does not silently retry an ambiguous upload and preserves the Word library route",async()=>{
        imports.mockRejectedValue(new ExampleImportError("upload",true));show({inWord:true});fireEvent.click(screen.getByText("Beispieldossiers"));fireEvent.click(screen.getByRole("button",{name:"Vier PDFs übernehmen"}));
        expect(await screen.findByRole("alert")).toHaveTextContent("einzelne Dateien können bereits gespeichert sein");expect(screen.getByRole("button",{name:"Vier PDFs übernehmen"})).toBeDisabled();expect(screen.getByRole("link",{name:"Bibliothek öffnen"})).toHaveAttribute("href","/library?host=word");expect(imports).toHaveBeenCalledOnce();
    });
    it("aborts owner-scope unmount and ignores a late result",async()=>{
        let resolve!:(value:ExampleSelection[])=>void;imports.mockReturnValue(new Promise(r=>{resolve=r;}));const imported=vi.fn();const view=show({onImported:imported});fireEvent.click(screen.getByText("Beispieldossiers"));fireEvent.click(screen.getByRole("button",{name:"Vier PDFs übernehmen"}));
        const signal=imports.mock.calls[0][1] as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);await act(async()=>resolve(selected));expect(imported).not.toHaveBeenCalled();
    });
    it("localizes all four interfaces without changing file language or launching work",async()=>{
        show();for(const [locale,title] of [["de","Beispieldossiers"],["fr","Dossiers d’exemple"],["it","Fascicoli di esempio"],["en","Example matters"]] as const){await act(async()=>setCourtOSLocale("owner",locale));expect(screen.getByText(title)).toBeVisible();}
        expect(imports).not.toHaveBeenCalled();expect(screen.getByRole("combobox",{hidden:true})).toHaveValue("DE-01");
    });
});
