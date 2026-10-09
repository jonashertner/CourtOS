import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isSupportedDocumentFile } from "@/app/lib/documentUploadValidation";
import CourtOSPilotPage from "./page";

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/app/hooks/useConfiguredModels", () => ({ useConfiguredModels: () => [] }));

describe("CourtOS pilot exercise", () => {
    it("offers the sample in a format accepted by the workspace upload", () => {
        render(<CourtOSPilotPage />);
        const download = screen.getByRole("link", { name: "Testdossier Linden als PDF herunterladen" });
        expect(download).toHaveAttribute("download");
        const path = download.getAttribute("href")!;
        expect(path).toBe("/courtos-examples/Testdossier_Linden.pdf");
        expect(isSupportedDocumentFile(new File([], path.split("/").pop()!))).toBe(true);
        expect(screen.getByText(/heruntergeladene PDF-Datei/)).toBeInTheDocument();
    });
});
