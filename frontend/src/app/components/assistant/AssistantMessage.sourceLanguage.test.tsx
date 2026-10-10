import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantMessage } from "./AssistantMessage";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { sourceGroundingMessages } from "@/app/lib/sourceGroundingMessages";
vi.mock("@/app/lib/courtos", () => ({ COURTOS_PILOT_MODE: true }));
vi.mock("@/app/components/courtos/FrontierAnswerAction", () => ({ FrontierAnswerAction: () => <button>FRONTIER</button> }));
beforeEach(()=>{localStorage.clear();vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});});
afterEach(()=>vi.unstubAllGlobals());
describe("source failures in the selected user language",()=>{
    it.each(["de","fr","it","en"] as const)("renders a safe %s failure instead of German/raw override",locale=>{
        setCourtOSLocale("source-language-owner",locale);
        render(<CourtOSLocaleProvider ownerId="source-language-owner"><AssistantMessage errorMessage="RAW PARENT MESSAGE" events={[{type:"error",code:"source_grounding_failed",source_issue:"changed",safe_to_display:true,message:"RAW BACKEND RESPONSE"}]}/></CourtOSLocaleProvider>);
        expect(screen.getByText(sourceGroundingMessages.changed[locale])).toBeVisible();
        expect(screen.queryByText(/RAW/)).toBeNull();
        expect(screen.queryByRole("button",{name:"Copy response"})).toBeNull();
        expect(screen.queryByRole("button",{name:"FRONTIER"})).toBeNull();
    });
    it("explains withheld historical answers separately",()=>{
        render(<AssistantMessage events={[{type:"error",code:"source_history_withheld",safe_to_display:true,message:"RAW HISTORY"}]}/>);
        expect(screen.getByText(sourceGroundingMessages.history.de)).toBeVisible();
        expect(screen.queryByText("RAW HISTORY")).toBeNull();
    });
});
