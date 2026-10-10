import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LibrarySourceReader } from "./LibrarySourceReader";
const api = vi.hoisted(() => ({ versions: vi.fn(), pdf: vi.fn() }));
vi.mock("@/app/lib/mikeApi", () => ({ listDocumentVersions: api.versions }));
vi.mock("@/app/components/shared/views/PdfView", () => ({ PdfView: (props: unknown) => { api.pdf(props); return <div data-testid="pdf-view" />; } }));
const target = { documentId: "11111111-1111-4111-8111-111111111111", versionId: "22222222-2222-4222-8222-222222222222", page: 7 };
beforeEach(() => { vi.clearAllMocks(); api.versions.mockResolvedValue({ current_version_id: "newer", versions: [{ id: target.versionId, filename: "Original.pdf", version_number: 2 }] }); });
it("opens the referenced historical version and PDF page instead of the current version", async () => {
    render(<LibrarySourceReader {...target} />);
    expect(await screen.findByRole("heading", { name: "Original.pdf" })).toBeInTheDocument();
    expect(api.versions).toHaveBeenCalledWith(target.documentId);
    expect(api.pdf).toHaveBeenLastCalledWith(expect.objectContaining({ doc: { document_id: target.documentId, version_id: target.versionId }, initialPage: 7 }));
    expect(screen.getByRole("link", { name: "Originaldatei öffnen" })).toHaveAttribute("href", `/api/single-documents/${target.documentId}/file?version_id=${target.versionId}`);
});
it.each([{ versions: [] }, { versions: [{ id: target.versionId, deleted_at: "2026-10-10" }] }])("does not replace an unavailable version with another source", async ({ versions }) => {
    api.versions.mockResolvedValueOnce({ current_version_id: "newer", versions });
    render(<LibrarySourceReader {...target} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Dokumentversion ist für Ihr Konto nicht verfügbar");
    expect(api.pdf).not.toHaveBeenCalled();
});
it("does not request metadata or bytes for an invalid reference", async () => {
    render(<LibrarySourceReader {...target} documentId="../foreign" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("ungültig");
    expect(api.versions).not.toHaveBeenCalled(); expect(api.pdf).not.toHaveBeenCalled();
});
it("shows a bounded error when ownership or fetching rejects access", async () => {
    api.versions.mockRejectedValueOnce(new Error("private database detail"));
    render(<LibrarySourceReader {...target} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("für Ihr Konto nicht verfügbar"));
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    expect(api.pdf).not.toHaveBeenCalled();
});
