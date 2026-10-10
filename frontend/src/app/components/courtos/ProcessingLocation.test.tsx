import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessingLocation } from "./ProcessingLocation";

describe("processing destination and request state", () => {
    it("identifies the actual server and distinguishes a prepared draft from submission", () => {
        const view = render(<ProcessingLocation service="gemma" stage="draft" />);
        expect(screen.getByText(/CourtOS-Server · Deutschland/)).toBeVisible();
        expect(screen.getByText("Entwurf · noch nicht gesendet")).toBeVisible();
        expect(screen.queryByText("Anfrage läuft")).toBeNull();
        view.rerender(<ProcessingLocation service="gemma" stage="pending" />);
        expect(screen.getByText("Anfrage läuft")).toBeVisible();
        expect(screen.queryByText("Entwurf · noch nicht gesendet")).toBeNull();
    });

    it("does not relabel the external public search service as the user's selected frontier model", () => {
        render(<ProcessingLocation service="opencaselaw">Mit «Suchen» werden Ihre Begriffe übermittelt.</ProcessingLocation>);
        const note = screen.getByText("OpenCaseLaw").closest("[data-processing-route]");
        expect(note).toHaveAttribute("data-processing-route", "external");
        expect(note).toHaveTextContent("Externer KI-Suchdienst");
        expect(note).not.toHaveTextContent(/Anthropic|Gemma|Claude/);
        expect(note).not.toHaveTextContent("Anfrage läuft");
    });
});
