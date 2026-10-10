import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
    addDocumentToProject: vi.fn(),
    getProject: vi.fn(),
    uploadStandaloneDocuments: vi.fn(),
    uploadProjectDocuments: vi.fn(),
}));


const pilot = vi.hoisted(() => ({ public: false, enabled: false }));
vi.mock("@/app/lib/courtos", () => ({
    get COURTOS_SELF_REGISTRATION() { return pilot.public; },
    get COURTOS_PILOT_MODE() { return pilot.enabled; },
}));

vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    addDocumentToProject: apiMocks.addDocumentToProject,
    getProject: apiMocks.getProject,
    uploadProjectDocuments: apiMocks.uploadProjectDocuments,
    uploadStandaloneDocuments: apiMocks.uploadStandaloneDocuments,
}));

vi.mock("./Modal", () => ({
    Modal: ({ children, primaryAction, secondaryAction }: {
        children: React.ReactNode;
        primaryAction: { label: string; disabled?: boolean; onClick: () => void };
        secondaryAction: { label: string; disabled?: boolean; onClick: () => void };
    }) => <div>{children}<button type="button" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.label}</button><button type="button" disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</button></div>,
}));

vi.mock("../shared/FileDirectory", () => ({
    FileDirectory: ({
        documents,
        uploadingFilenames,
    }: {
        documents: Array<{ filename: string }>;
        uploadingFilenames: string[];
    }) => (
        <div>
            <div data-testid="loaded-files">
                {documents.map((document) => document.filename).join(",")}
            </div>
            <div data-testid="loading-files">{uploadingFilenames.join(",")}</div>
        </div>
    ),
}));

import { AddDocumentsModal } from "./AddDocumentsModal";

function document(id: string, filename: string) {
    return { id, filename, project_id: null, folder_id: null };
}

describe("AddDocumentsModal upload progress", () => {
    beforeEach(() => { pilot.public = false; pilot.enabled = false; vi.clearAllMocks(); });

    it("limits the public project picker to project files and rejects a preselected library import", async () => {
        pilot.public = true;
        apiMocks.getProject.mockResolvedValue({ documents: [{ ...document("p-doc", "project.pdf"), project_id: "p1", status: "ready" }], folders: [] });
        const onSelect = vi.fn();
        const onClose = vi.fn();
        render(<AddDocumentsModal open onClose={onClose} onSelect={onSelect} breadcrumb={["Project"]} projectId="p1"
            initialSelectedDocuments={[document("library-doc", "library.pdf")] as never} />);
        expect(await screen.findByText(/Bibliotheksdateien können im öffentlichen Pilot/)).toBeVisible();
        await waitFor(() => expect(screen.getByTestId("loaded-files")).toHaveTextContent("project.pdf"));
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
        expect(apiMocks.addDocumentToProject).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("retains existing project selections and assistant library references in the public pilot", async () => {
        pilot.public = true;
        const projectDocument = { ...document("p-doc", "project.pdf"), project_id: "p1", status: "ready" };
        apiMocks.getProject.mockResolvedValue({ documents: [projectDocument], folders: [] });
        const onSelect = vi.fn();
        const first = render(<AddDocumentsModal open onClose={vi.fn()} onSelect={onSelect} breadcrumb={["Project"]} projectId="p1"
            initialSelectedDocuments={[projectDocument] as never} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(onSelect).toHaveBeenCalledWith([projectDocument], "p1");
        first.unmount();
        onSelect.mockClear();
        const libraryDocument = document("library-doc", "library.pdf");
        render(<AddDocumentsModal open onClose={vi.fn()} onSelect={onSelect} breadcrumb={["Assistant"]}
            initialSelectedDocuments={[libraryDocument] as never} />);
        expect(screen.queryByText(/Bibliotheksdateien können im öffentlichen Pilot/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(onSelect).toHaveBeenCalledWith([libraryDocument], undefined);
        expect(apiMocks.addDocumentToProject).not.toHaveBeenCalled();
    });

    it("replaces each loading row as that file completes and names failures", async () => {
        let finishUpload!: () => void;
        const uploadCanFinish = new Promise<void>((resolve) => {
            finishUpload = resolve;
        });
        apiMocks.uploadStandaloneDocuments.mockImplementation(
            async (inputs, options) => {
                const first = document("doc-1", "first.pdf");
                options?.onProgress?.({
                    clientId: inputs[0].clientId,
                    filename: "first.pdf",
                    status: "completed",
                    result: first,
                    errorCode: null,
                });
                await uploadCanFinish;
                options?.onProgress?.({
                    clientId: inputs[1].clientId,
                    filename: "failed.pdf",
                    status: "error",
                    result: null,
                    errorCode: "processing_failed",
                });
                return [
                    {
                        clientId: inputs[0].clientId,
                        filename: "first.pdf",
                        status: "completed",
                        result: first,
                        errorCode: null,
                    },
                    {
                        clientId: inputs[1].clientId,
                        filename: "failed.pdf",
                        status: "error",
                        result: null,
                        errorCode: "processing_failed",
                    },
                ];
            },
        );

        const { container } = render(
            <AddDocumentsModal
                open
                onClose={vi.fn()}
                onSelect={vi.fn()}
                breadcrumb={["Documents"]}
            />,
        );
        const input = container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();
        fireEvent.change(input!, {
            target: {
                files: [
                    new File(["one"], "first.pdf", {
                        type: "application/pdf",
                    }),
                    new File(["two"], "failed.pdf", {
                        type: "application/pdf",
                    }),
                ],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId("loaded-files")).toHaveTextContent(
                "first.pdf",
            );
            expect(screen.getByTestId("loading-files")).toHaveTextContent(
                "failed.pdf",
            );
            expect(screen.getByTestId("loading-files")).not.toHaveTextContent(
                "first.pdf",
            );
        });

        await act(async () => finishUpload());

        await waitFor(() => {
            expect(screen.getByTestId("loading-files")).toBeEmptyDOMElement();
            expect(
                screen.getByText(
                    "failed.pdf could not be uploaded. Please try again.",
                ),
            ).toBeInTheDocument();
        });
    });

    it("keeps an active loading row and its result across a remount", async () => {
        let finishUpload!: (uploaded: ReturnType<typeof document>) => void;
        let reportCompleted!: (uploaded: ReturnType<typeof document>) => void;
        apiMocks.uploadStandaloneDocuments.mockImplementation(
            (inputs, options) =>
                new Promise((resolve) => {
                    reportCompleted = (uploaded) => {
                        options?.onProgress?.({
                            clientId: inputs[0].clientId,
                            filename: uploaded.filename,
                            status: "completed",
                            result: uploaded,
                            errorCode: null,
                        });
                    };
                    finishUpload = (uploaded) =>
                        resolve([
                            {
                                clientId: inputs[0].clientId,
                                filename: uploaded.filename,
                                status: "completed",
                                result: uploaded,
                                errorCode: null,
                            },
                        ]);
                }),
        );

        const props = {
            open: true,
            onClose: vi.fn(),
            onSelect: vi.fn(),
            breadcrumb: ["Remount test", crypto.randomUUID()],
            uploadStateId: crypto.randomUUID(),
        };
        const firstRender = render(<AddDocumentsModal {...props} />);
        const input = firstRender.container.querySelector('input[type="file"]');
        fireEvent.change(input!, {
            target: {
                files: [
                    new File(["one"], "survives.pdf", {
                        type: "application/pdf",
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId("loading-files")).toHaveTextContent(
                "survives.pdf",
            );
        });

        firstRender.unmount();
        render(<AddDocumentsModal {...props} />);
        expect(screen.getByTestId("loading-files")).toHaveTextContent(
            "survives.pdf",
        );

        const uploaded = document("doc-remounted", "survives.pdf");
        await act(async () => {
            reportCompleted(uploaded);
            finishUpload(uploaded);
        });

        await waitFor(() => {
            expect(screen.getByTestId("loading-files")).toBeEmptyDOMElement();
            expect(screen.getByTestId("loaded-files")).toHaveTextContent(
                "survives.pdf",
            );
        });
    });

    it("keeps in-flight upload state when the breadcrumb text changes", async () => {
        apiMocks.uploadProjectDocuments.mockImplementation(
            () => new Promise(() => {}),
        );

        // A rename mid-upload rewrites the breadcrumb. The persistence key must
        // not move with it, or the running upload is stranded in an orphaned
        // store entry and its documents never reach the selection.
        const projectId = crypto.randomUUID();
        const firstRender = render(
            <AddDocumentsModal
                open
                onClose={vi.fn()}
                onSelect={vi.fn()}
                projectId={projectId}
                breadcrumb={["Projects", "Original name", "Add Documents"]}
            />,
        );
        fireEvent.change(
            firstRender.container.querySelector('input[type="file"]')!,
            {
                target: {
                    files: [
                        new File(["one"], "renamed.pdf", {
                            type: "application/pdf",
                        }),
                    ],
                },
            },
        );
        await waitFor(() => {
            expect(screen.getByTestId("loading-files")).toHaveTextContent(
                "renamed.pdf",
            );
        });

        firstRender.unmount();
        render(
            <AddDocumentsModal
                open
                onClose={vi.fn()}
                onSelect={vi.fn()}
                projectId={projectId}
                breadcrumb={["Projects", "Renamed project", "Add Documents"]}
            />,
        );

        expect(screen.getByTestId("loading-files")).toHaveTextContent(
            "renamed.pdf",
        );
    });
});
