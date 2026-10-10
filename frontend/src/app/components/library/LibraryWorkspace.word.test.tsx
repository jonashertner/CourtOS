import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ host: "", push: vi.fn(), replace: vi.fn(), levels: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }), useSearchParams: () => new URLSearchParams(state.host ? `host=${state.host}` : "") }));
vi.mock("@/app/lib/courtos", () => ({ COURTOS_PILOT_MODE: true }));
vi.mock("@/app/lib/mikeApi", async (original) => ({
    ...(await original<object>()),
    getLibraryLevels: state.levels,
    getLibraryFilterOptions: async () => ({ fileTypes: [] }),
}));
vi.mock("@/app/components/documents/DocTable", () => ({ DocTable: ({ onFolderViewIdChange, loading }: { onFolderViewIdChange: (id: string | null) => void; loading: boolean }) => <div><span>{loading ? "Loading" : "Ready"}</span><button onClick={() => onFolderViewIdChange("folder-a")}>Open folder</button><button onClick={() => onFolderViewIdChange(null)}>Root</button></div> }));
vi.mock("@/app/components/shared/PageHeader", () => ({ PageHeader: ({ breadcrumbs }: { breadcrumbs: { label: string; onClick?: () => void }[] }) => <nav>{breadcrumbs.map((b, i) => <button key={i} onClick={b.onClick}>{b.label}</button>)}</nav> }));
vi.mock("@/app/components/shared/TableToolbar", () => ({ TableToolbar: ({ onChange }: { onChange: (kind: string) => void }) => <button onClick={() => onChange("templates")}>Templates tab</button> }));
vi.mock("@/app/components/shared/DocumentUploadMenu", () => ({ DocumentUploadMenu: () => null }));
vi.mock("@/app/components/shared/HeaderActionsMenu", () => ({ HeaderActionsMenu: () => null }));
vi.mock("@/app/components/shared/SelectionActionsMenu", () => ({ SelectionActionsMenu: () => null }));
import { LibraryCollectionPage, LibraryWorkspaceLayout } from "./LibraryWorkspace";

beforeEach(() => {
    vi.clearAllMocks(); state.host = "";
    state.levels.mockResolvedValue({ levels: [{ parentId: null, documents: [], folders: [], documentsHasMore: false }] });
});

describe("library Word navigation", () => {
    it.each(["word", ""])("keeps folder navigation and collection switches URL-scoped (%s)", async (host) => {
        state.host = host;
        render(<LibraryWorkspaceLayout><LibraryCollectionPage kind="files" /></LibraryWorkspaceLayout>);
        await waitFor(() => expect(screen.getByText("Ready")).toBeVisible());
        const location = screen.getByText("Eigene Quellen").closest("[data-processing-route]");
        expect(location).toHaveAttribute("data-processing-route", "server");
        expect(location).toHaveTextContent("CourtOS-Server · Deutschland");
        expect(location).toHaveTextContent("Uploads werden hier gespeichert");
        const query = host ? "?host=word" : "";
        fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
        expect(state.push).toHaveBeenLastCalledWith(`/library/folders/folder-a${query}`, { scroll: false });
        fireEvent.click(screen.getByRole("button", { name: "Root" }));
        expect(state.push).toHaveBeenLastCalledWith(`/library${query}`, { scroll: false });
        fireEvent.click(screen.getByRole("button", { name: "Meine Bibliothek" }));
        expect(state.push).toHaveBeenLastCalledWith(`/library${query}`);
        fireEvent.click(screen.getByRole("button", { name: "Templates tab" }));
        expect(state.push).toHaveBeenLastCalledWith(`/library/templates${query}`);
    });
});
