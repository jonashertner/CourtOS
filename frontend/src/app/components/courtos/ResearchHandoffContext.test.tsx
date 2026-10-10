// @vitest-environment-options {"url":"https://court.example.org/research"}
import { useEffect, useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchHandoffRecord, ResearchHandoffState } from "@mike/contracts";
import { emptyResearchState, ResearchHandoffProvider, useResearchHandoff } from "./ResearchHandoffContext";
import { ResearchContinuationStatus } from "./ResearchHandoffControls";
import { getResearchHandoffReference, storeResearchHandoffReference } from "@/app/lib/researchHandoff";
const api = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), metadata: vi.fn(), update: vi.fn(), ack: vi.fn(), scope: vi.fn() }));
vi.mock("@/app/lib/researchHandoff", async original => ({ ...(await original<typeof import("@/app/lib/researchHandoff")>()), createResearchHandoff: api.create, getResearchHandoff: api.get, getResearchHandoffMetadata: api.metadata, updateResearchHandoff: api.update, acknowledgeResearchHandoff: api.ack }));
vi.mock("@/app/lib/wordResearchHost", async original => ({ ...(await original<typeof import("@/app/lib/wordResearchHost")>()), getWordResearchDocumentScope: api.scope }));
const id = "11111111-1111-4111-8111-111111111111";
const scope = "a".repeat(64);
const state = (query = "Word-Anfrage"): ResearchHandoffState => { const value = emptyResearchState(); value.public.query = query; value.public.submitted = query; return value; };
const record = (revision = 1, query = "Word-Anfrage", direction: "to_browser" | "to_word" = "to_browser"): ResearchHandoffRecord => ({ id, revision, expires_at: new Date(Date.now() + 7200000).toISOString(), direction, acknowledged_revision: 0, state: state(query) });
function Workspace({ documentScope = scope }: { documentScope?: string | null }) {
    const handoff = useResearchHandoff()!;
    const [snapshot, setSnapshot] = useState(state());
    const current = useRef(snapshot); current.current = snapshot;
    const register = handoff.register, changed = handoff.changed, bind = handoff.bindWordDocument;
    useEffect(() => register({ getState: () => current.current, applyState: next => setSnapshot(next) }), [register]);
    useEffect(() => { changed(snapshot); }, [snapshot, changed]);
    useEffect(() => { bind(documentScope); }, [bind, documentScope]);
    return <><input aria-label="Recherchetext" value={snapshot.public.query} onChange={event => { handoff.edited(); setSnapshot(value => ({ ...value, public: { ...value.public, query: event.target.value } })); }} /><button onClick={() => { void handoff.publish(); }} disabled={handoff.busy || handoff.conflict}>Übertragen</button><button onClick={() => { handoff.setTransferReady(false); void handoff.publish(); }}>Erster Auftrag ohne ID</button><button onClick={() => handoff.setTransferReady(true)}>ID bestätigt</button><button onClick={() => setSnapshot(value => ({ ...value, public: { ...value.public } }))}>Lesestand aktualisieren</button><ResearchContinuationStatus /></>;
}
const app = (inWord: boolean, documentScope: string | null = scope) => <ResearchHandoffProvider ownerId="owner" inWord={inWord}><Workspace documentScope={documentScope} /></ResearchHandoffProvider>;
beforeEach(() => { vi.clearAllMocks(); api.scope.mockResolvedValue(scope); sessionStorage.clear(); history.replaceState(null, "", "/research"); api.create.mockResolvedValue(record()); api.metadata.mockResolvedValue(record()); api.update.mockImplementation(async (_id, revision, snapshot, direction) => ({ ...record(revision + 1), state: snapshot, direction })); api.ack.mockImplementation(async (_id, revision) => ({ ...record(revision, "", "to_word"), acknowledged_revision: revision })); });
afterEach(() => { vi.useRealTimers(); });

describe("explicit account-bound research continuation", () => {
    it("refuses even an immediate publish while the first chat ID is unresolved", async () => {
        render(app(true)); fireEvent.click(screen.getByText("Erster Auftrag ohne ID"));
        await act(async () => {}); expect(api.create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("Übertragen")); expect(api.create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("ID bestätigt")); fireEvent.click(screen.getByText("Übertragen"));
        await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    });
    it("keeps an active roundtrip in memory for an unsaved Word document without persisting a reload handle", async () => {
        render(app(true, null)); fireEvent.click(screen.getByText("Übertragen"));
        await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
        expect(api.create).toHaveBeenCalledWith(state());
        expect(api.get).not.toHaveBeenCalled();
        expect(Object.keys(sessionStorage).some(key => key.includes(":word:"))).toBe(false);
        expect(await screen.findByText("Im Browser bereit.")).toBeVisible();
    });
    it("restores the same saved-document handle, but not another document's handle", async () => {
        storeResearchHandoffReference("owner", { ...record(), host: "word" }, scope);
        api.get.mockResolvedValue(record());
        render(app(true, "b".repeat(64)));
        await act(async () => {});
        expect(api.get).not.toHaveBeenCalled();
    });
    it("applies a clean returned Word state automatically and acknowledges without a new search or insert", async () => {
        render(app(true)); fireEvent.click(screen.getByText("Übertragen"));
        await screen.findByText("Im Browser bereit.");
        api.metadata.mockResolvedValue(record(2, "Browser-Anfrage", "to_word")); api.get.mockResolvedValue(record(2, "Browser-Anfrage", "to_word"));
        fireEvent.click(screen.getByText("Lesestand aktualisieren"));
        fireEvent(window, new Event("focus"));
        await waitFor(() => expect(screen.getByLabelText("Recherchetext")).toHaveValue("Browser-Anfrage"));
        expect(api.ack).toHaveBeenCalledExactlyOnceWith(id, 2);
        expect(screen.queryByText("Browserstand übernehmen")).toBeNull();
        expect(api.create).toHaveBeenCalledOnce();
    });
    it("keeps local edits and offers an explicit choice when a browser state returns", async () => {
        render(app(true)); fireEvent.click(screen.getByText("Übertragen")); await screen.findByText("Im Browser bereit.");
        fireEvent.change(screen.getByLabelText("Recherchetext"), { target: { value: "Eigene neue Frage" } });
        api.metadata.mockResolvedValue(record(2, "Browser-Anfrage", "to_word")); api.get.mockResolvedValue(record(2, "Browser-Anfrage", "to_word"));
        fireEvent(window, new Event("focus"));
        const accept = await screen.findByText("Browserstand übernehmen");
        expect(screen.getByLabelText("Recherchetext")).toHaveValue("Eigene neue Frage");
        expect(api.ack).not.toHaveBeenCalled();
        fireEvent.click(accept);
        await waitFor(() => expect(screen.getByLabelText("Recherchetext")).toHaveValue("Browser-Anfrage"));
        expect(api.ack).toHaveBeenCalledOnce();
    });
    it("can keep Word edits and reuse the same session for another roundtrip", async () => {
        render(app(true)); fireEvent.click(screen.getByText("Übertragen")); await screen.findByText("Im Browser bereit.");
        fireEvent.change(screen.getByLabelText("Recherchetext"), { target: { value: "Word weitergeführt" } });
        api.metadata.mockResolvedValue(record(2, "Browser", "to_word")); api.get.mockResolvedValue(record(2, "Browser", "to_word"));
        fireEvent(window, new Event("focus")); fireEvent.click(await screen.findByText("Hier weiterarbeiten"));
        await screen.findByText("Eigener Stand beibehalten.");
        fireEvent.click(screen.getByText("Übertragen"));
        await waitFor(() => expect(api.update).toHaveBeenCalledWith(id, 2, expect.objectContaining({ public: expect.objectContaining({ query: "Word weitergeführt" }) }), "to_browser"));
        expect(api.create).toHaveBeenCalledOnce();
    });
    it("restores an authenticated browser snapshot and publishes to Word only after a click", async () => {
        history.replaceState(null, "", `/research?handoff=${id}`); api.get.mockResolvedValue(record());
        render(app(false));
        await screen.findByText("Recherche aus Word übernommen.");
        expect(location.search).toBe(""); expect(api.update).not.toHaveBeenCalled(); expect(api.ack).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Recherchetext"), { target: { value: "Browser weitergeführt" } });
        fireEvent.click(screen.getByText("Übertragen"));
        await waitFor(() => expect(api.update).toHaveBeenCalledWith(id, 1, expect.objectContaining({ public: expect.objectContaining({ query: "Browser weitergeführt" }) }), "to_word"));
        expect(await screen.findByText("In Word bereit. Wechseln Sie zu Word.")).toBeVisible();
    });
    it("does not overwrite edits made while the initial handoff request is pending", async () => {
        history.replaceState(null, "", `/research?handoff=${id}`); let finish!: (value: ResearchHandoffRecord) => void;
        api.get.mockReturnValue(new Promise(resolve => { finish = resolve; })); render(app(false));
        fireEvent.change(screen.getByLabelText("Recherchetext"), { target: { value: "Neue lokale Frage" } });
        await act(async () => { finish(record()); });
        expect(screen.getByLabelText("Recherchetext")).toHaveValue("Neue lokale Frage");
        expect(screen.getByText("Browserstand übernehmen")).toBeVisible();
    });
    it("keeps failed account resolution closed without leaking source or stripping the recovery URL", async () => {
        history.replaceState(null, "", `/research?handoff=${id}`); api.get.mockRejectedValue(new Error("private source metadata")); render(app(false));
        expect(await screen.findByRole("alert")).not.toHaveTextContent("private source metadata");
        expect(location.search).toBe(`?handoff=${id}`); expect(api.create).not.toHaveBeenCalled(); expect(api.update).not.toHaveBeenCalled();
    });
    it("discards a pending publish after the Word document changes", async () => {
        let finish!: (value: ResearchHandoffRecord) => void;
        api.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const view = render(app(true)); fireEvent.click(screen.getByText("Übertragen"));
        await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
        view.rerender(app(true, "b".repeat(64)));
        await screen.findByText("Word-Dokument gewechselt. Recherche erneut verbinden.");
        await act(async () => { finish(record()); });
        expect(screen.queryByText("Im Browser bereit.")).toBeNull();
        expect(getResearchHandoffReference("owner", "word", scope)).toBeNull();
        expect(getResearchHandoffReference("owner", "word", "b".repeat(64))).toBeNull();
        expect(screen.getByText("Übertragen")).not.toBeDisabled();
    });
    it.each([false, true])("discards a pending ACK after the Word document changes (keepLocal=%s)", async keepLocal => {
        const view = render(app(true)); fireEvent.click(screen.getByText("Übertragen"));
        await screen.findByText("Im Browser bereit.");
        if (keepLocal) fireEvent.change(screen.getByLabelText("Recherchetext"), { target: { value: "Lokale Änderung" } });
        let finish!: (value: ResearchHandoffRecord) => void;
        api.ack.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        api.metadata.mockResolvedValue(record(2, "Browser", "to_word")); api.get.mockResolvedValue(record(2, "Browser", "to_word"));
        fireEvent(window, new Event("focus"));
        if (keepLocal) fireEvent.click(await screen.findByText("Hier weiterarbeiten"));
        await waitFor(() => expect(api.ack).toHaveBeenCalledOnce());
        view.rerender(app(true, "b".repeat(64)));
        await screen.findByText("Word-Dokument gewechselt. Recherche erneut verbinden.");
        await act(async () => { finish(record(99, "", "to_word")); });
        expect(screen.getByText("Word-Dokument gewechselt. Recherche erneut verbinden.")).toBeVisible();
        expect(getResearchHandoffReference("owner", "word", scope)?.revision).not.toBe(99);
        expect(getResearchHandoffReference("owner", "word", "b".repeat(64))).toBeNull();
        expect(screen.getByText("Übertragen")).not.toBeDisabled();
    });
    it("discards a pending return check after the Word document changes", async () => {
        const view = render(app(true)); fireEvent.click(screen.getByText("Übertragen"));
        await screen.findByText("Im Browser bereit.");
        let finish!: (value: ResearchHandoffRecord) => void;
        api.metadata.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        fireEvent(window, new Event("focus"));
        await waitFor(() => expect(api.metadata).toHaveBeenCalledOnce());
        view.rerender(app(true, "b".repeat(64)));
        await screen.findByText("Word-Dokument gewechselt. Recherche erneut verbinden.");
        await act(async () => { finish(record(2, "Alter Browserstand", "to_word")); });
        expect(api.get).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Recherchetext")).toHaveValue("Word-Anfrage");
        expect(getResearchHandoffReference("owner", "word", "b".repeat(64))).toBeNull();
    });

});
