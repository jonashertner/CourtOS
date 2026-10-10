import userEvent from "@testing-library/user-event";
import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {DocumentUploadMenu} from "./DocumentUploadMenu";
import {TableLoadMoreRow} from "./TableLoadMoreRow";
import {CourtOSLocaleProvider} from "@/app/contexts/CourtOSLocaleContext";
import {setCourtOSLocale} from "@/app/lib/courtosLocale";
import {ConfirmPopup} from "../popups/ConfirmPopup";
vi.mock("@/app/lib/courtos",()=>({COURTOS_PILOT_MODE:true}));
beforeEach(()=>{localStorage.clear();setCourtOSLocale("owner","fr");});
describe("personal library chrome",()=>{
    it("changes language without starting an upload or changing the selected file action",async()=>{
        const user=userEvent.setup();const upload=vi.fn(),folder=vi.fn();
        render(<CourtOSLocaleProvider ownerId="owner"><DocumentUploadMenu onUploadFiles={upload} onUploadFolder={folder}/></CourtOSLocaleProvider>);
        await user.click(screen.getByRole("button",{name:"Téléverser"}));
        expect(screen.getByRole("menuitem",{name:"Téléverser des documents"})).toBeVisible();
        await act(async()=>{setCourtOSLocale("owner","it");});
        expect(upload).not.toHaveBeenCalled();expect(folder).not.toHaveBeenCalled();
        await user.click(screen.getByRole("menuitem",{name:"Carica documenti"}));expect(upload).toHaveBeenCalledOnce();
    });
    it("keeps loading controls disabled and makes confirmation explicit in the chosen language",async()=>{
        const load=vi.fn(),confirm=vi.fn(),cancel=vi.fn();
        const view=render(<CourtOSLocaleProvider ownerId="owner"><TableLoadMoreRow loading={false} loadingMore hasMore itemCount={2} hasError={false} onLoadMore={load}/><ConfirmPopup open onConfirm={confirm} onCancel={cancel}/></CourtOSLocaleProvider>);
        expect(screen.getByRole("button",{name:"Chargement…"})).toBeDisabled();
        await act(async()=>{setCourtOSLocale("owner","en");});
        expect(confirm).not.toHaveBeenCalled();expect(load).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button",{name:"Confirm"}));expect(confirm).toHaveBeenCalledOnce();
        view.unmount();
    });
});
