import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantMessage } from "./AssistantMessage";
import type { DocumentCitation, PublicDecisionCitation } from "../shared/types";

vi.mock("@/app/lib/courtos", () => ({ COURTOS_PILOT_MODE: true }));
vi.mock("@/app/components/courtos/FrontierAnswerAction", () => ({ FrontierAnswerAction: () => <button>Mit Frontier prüfen</button> }));
const citation = (verified?: boolean): DocumentCitation => ({ type: "citation_data", ref: 1, doc_id: "doc1", document_id: "a", version_id: "v1", version_number: 1, filename: "Beilage.pdf", page: 2, quote: "Zahlungsauftrag", verified, quotes: [{page: 2, quote: "Zahlungsauftrag", verification: {verified: verified === true, version_id: "v1", pdf_sha256: "a".repeat(64), page_hashes: [{page: 2, sha256: "b".repeat(64)}]}}] });
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

describe("CourtOS answer source guard", () => {
    it.each([false, undefined])("blocks normal export and folds a response with unconfirmed citations (%s)", verified => {
        render(<AssistantMessage events={[{ type: "content", text: "Die Zahlung wurde ausgeführt." }]} citations={[citation(verified)]} citationStatus="final" />);
        expect(screen.getByRole("alert")).toHaveTextContent("Antwort nicht belegt");
        expect(screen.getByText("Die Zahlung wurde ausgeführt.")).not.toBeVisible();
        expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Mit Frontier prüfen" })).toBeNull();
        expect(screen.getByText("Unbestätigten Antworttext ansehen")).toBeVisible();
    });
    it("rejects historical whole-document verification without page evidence", () => {
        render(<AssistantMessage events={[{ type: "content", text: "Früher ungeprüfte Seitenangabe." }]} citations={[{...citation(true), quotes: undefined}]} citationStatus="final" />);
        expect(screen.getByRole("alert")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
    });
    it("does not export while verification is still pending, even if one quote matched", () => {
        render(<AssistantMessage events={[{ type: "content", text: "Vorläufig." }]} citations={[citation(true)]} citationStatus="partial" />);
        expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Mit Frontier prüfen" })).toBeNull();
    });
    it.each(["final", undefined] as const)("blocks uncited completed text, including legacy history (%s)", (status) => {
        render(<AssistantMessage events={[{ type: "content", text: "Unbelegte Behauptung." }]} citationStatus={status} />);
        expect(screen.getByRole("alert")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Mit Frontier prüfen" })).toBeNull();
        expect(screen.getByText("Unbelegte Behauptung.")).not.toBeVisible();
    });
    it("allows copying explicitly matched quotations without declaring the proposition verified", () => {
        render(<AssistantMessage events={[{ type: "content", text: "Ein Zahlungsauftrag liegt vor." }]} citations={[citation(true)]} citationStatus="final" />);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("button", { name: "Copy response" })).toBeVisible();
        expect(screen.queryByText(/Aussage bestätigt/)).toBeNull();
    });

    it("disables frontier forwarding when embedded while retaining normal source-checked copy", () => {
        render(<AssistantMessage events={[{ type: "content", text: "Ein Zahlungsauftrag liegt vor." }]} citations={[citation(true)]} citationStatus="final" allowFrontier={false}/>);
        expect(screen.getByRole("button", { name: "Copy response" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Mit Frontier prüfen" })).toBeNull();
    });
    it("opens public evidence through the public callback without resolving a private document", () => {
        const source: PublicDecisionCitation = {type:"citation_data",kind:"public_decision",ref:1,decision_id:"bge_1",title:"BGE 1",source_url:"https://www.bger.ch/test",pdf_url:null,content_hash:null,start:10,end:18,quote:"Wortlaut",verified:true};
        const onOpenSource=vi.fn(),onOpenDocument=vi.fn();
        render(<AssistantMessage events={[{type:"content",text:"Ein Auszug [1]."}]} citations={[source]} citationStatus="final" onOpenCitationSource={onOpenSource} onOpenDocument={onOpenDocument} allowFrontier={false}/>);
        fireEvent.click(screen.getByRole("button",{name:"BGE 1"}));
        expect(onOpenSource).toHaveBeenCalledWith(source);
        expect(onOpenDocument).not.toHaveBeenCalled();
        expect(screen.getByRole("button", {name:"Copy response"})).toBeVisible();
    });
    it("blocks a public answer whose claimed Unicode position cannot contain the quote", () => {
        const source: PublicDecisionCitation = {type:"citation_data",kind:"public_decision",ref:1,decision_id:"bge_1",title:"BGE 1",source_url:null,pdf_url:null,content_hash:null,start:0,end:2,quote:"Longer quote",verified:true};
        render(<AssistantMessage events={[{type:"content",text:"Nicht freigeben."}]} citations={[source]} citationStatus="final"/>);
        expect(screen.getByRole("alert")).toBeVisible();
        expect(screen.queryByRole("button", {name:"Copy response"})).toBeNull();
        expect(screen.queryByRole("button", {name:"Mit Frontier prüfen"})).toBeNull();
    });

    it("copies every prose block in chronological order while excluding tool and reasoning text", async () => {
        let copied: Record<string, Blob> | undefined;
        vi.stubGlobal("ClipboardItem", class { constructor(items: Record<string, Blob>) { copied = items; } });
        const write = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { write } });
        render(<AssistantMessage events={[
            { type: "content", text: "Die Klägerin behauptet eine Zahlung [1]." },
            { type: "reasoning", text: "Interne Überlegung, nicht Teil der Antwort." },
            { type: "doc_read", filename: "Beilage.pdf" },
            { type: "content", text: "Die Beklagte bestreitet den Zahlungseingang [1]." },
        ]} citations={[citation(true)]} citationStatus="final" />);
        fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
        const plain = await copied!["text/plain"].text();
        const html = await copied!["text/html"].text();
        for (const value of [plain, html]) {
            expect(value).toContain("Die Klägerin behauptet eine Zahlung");
            expect(value).toContain("Die Beklagte bestreitet den Zahlungseingang");
            expect(value.indexOf("Die Klägerin")).toBeLessThan(value.indexOf("Die Beklagte"));
            expect(value).not.toContain("Interne Überlegung");
            expect(value).not.toContain("data-citation-ref");
        }
        expect(plain).toContain("\n\nDie Beklagte");
        expect(html).toContain("<sup>1</sup>");
        expect(plain).toContain("Version 1");
    });
});
