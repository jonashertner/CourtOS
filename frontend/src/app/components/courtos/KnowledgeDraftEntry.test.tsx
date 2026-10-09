import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import type { Document } from "@/app/components/shared/types";
import { prepareKnowledgeDraft, getKnowledgeDraft } from "@/app/lib/knowledgeDraft";
import { KnowledgeDraftEntry } from "./KnowledgeDraftEntry";

afterEach(() => { getKnowledgeDraft("clear-owner"); });
describe("visible assistant hand-off", () => {
    it("prepares references without submitting and consumes only after acceptance", async () => {
        const prepare = vi.fn().mockReturnValue(true);
        const inputRef = createRef<ChatInputHandle>();
        inputRef.current = { addDoc: vi.fn(), addFiles: vi.fn(), startWorkflow: vi.fn(), startWorkflowDocumentSelection: vi.fn(), prepareKnowledgeDraft: prepare };
        prepareKnowledgeDraft("user-a", "Gehör?", [{ id: "doc-a", filename: "Literatur.pdf" } as Document]);
        render(<KnowledgeDraftEntry owner="user-a" inputRef={inputRef} />);
        expect(prepare).toHaveBeenCalledWith(expect.stringContaining("Gehör?"), [expect.objectContaining({ id: "doc-a" })]);
        expect(await screen.findByRole("status")).toHaveTextContent("erst mit Senden");
        expect(getKnowledgeDraft("user-a")).toBeNull();
    });
    it("keeps the queued draft when an existing composer refuses replacement", () => {
        const inputRef = createRef<ChatInputHandle>();
        inputRef.current = { addDoc: vi.fn(), addFiles: vi.fn(), startWorkflow: vi.fn(), startWorkflowDocumentSelection: vi.fn(), prepareKnowledgeDraft: vi.fn().mockReturnValue(false) };
        prepareKnowledgeDraft("user-a", "Gehör?", [{ id: "doc-a" } as Document]);
        render(<KnowledgeDraftEntry owner="user-a" inputRef={inputRef} />);
        expect(screen.getByText(/Ihr vorhandener Entwurf bleibt erhalten/)).toBeInTheDocument();
        expect(getKnowledgeDraft("user-a")).not.toBeNull();
    });
});
