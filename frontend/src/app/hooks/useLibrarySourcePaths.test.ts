import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document, LibraryFolder } from "@/app/components/shared/types";
import { selectedSourceRoots, useLibrarySourcePaths } from "./useLibrarySourcePaths";

const api = vi.hoisted(() => ({document: vi.fn(), path: vi.fn()}));
vi.mock("@/app/lib/mikeApi", () => ({getDocument: api.document, getLibraryFolderPath: api.path}));
const doc = (id: string, folder?: string | null) => ({id, filename: "Eingabe.pdf", library_folder_id: folder, project_id: null}) as Document;
const folder = (id: string, name: string, parent: string | null = null) => ({id, name, parent_folder_id: parent}) as LibraryFolder;
beforeEach(() => {vi.resetAllMocks();});

describe("source folder display metadata", () => {
    it("resolves duplicate filenames by document ID and reuses one folder-path request", async () => {
        api.path.mockResolvedValue({folders: [folder("case", "2026-001"), folder("party", "A.________", "case")]});
        const {result} = renderHook(() => useLibrarySourcePaths([doc("a", "party"), doc("b", "party")]));
        await waitFor(() => expect(result.current.paths.b).toEqual([{id:"case",name:"2026-001"},{id:"party",name:"A.________"}]));
        expect(result.current.paths.a).toEqual(result.current.paths.b);
        expect(api.path).toHaveBeenCalledExactlyOnceWith("files", "party");
        expect(api.document).not.toHaveBeenCalled();
    });
    it("resolves restored selections through authenticated metadata and never guesses a folder from a name", async () => {
        api.document.mockImplementation(async (id: string) => id === "owned" ? doc(id, null) : {...doc("unexpected", "party")});
        const {result} = renderHook(() => useLibrarySourcePaths([doc("owned"), doc("unknown")]));
        await waitFor(() => expect(result.current.paths.unknown).toBeNull());
        expect(result.current.paths.owned).toEqual([]);
        expect(api.path).not.toHaveBeenCalled();
        expect(selectedSourceRoots(["owned","unknown"], result.current.paths)).toEqual([]);
    });
    it("does not turn a partial or cyclic path into a known case root", async () => {
        api.path.mockResolvedValue({folders: [folder("party", "A.________", "missing-parent")]});
        const {result} = renderHook(() => useLibrarySourcePaths([doc("a", "party")]));
        await waitFor(() => expect(result.current.paths.a).toBeNull());
        expect(selectedSourceRoots(["a"], result.current.paths)).toEqual([]);
    });
    it("keeps the actual browsed path when older metadata completes later", async () => {
        let resolve!: (value: Document) => void;
        api.document.mockReturnValue(new Promise<Document>(done => {resolve = done;}));
        const {result, rerender} = renderHook(({docs}) => useLibrarySourcePaths(docs), {initialProps: {docs:[doc("a")]}});
        api.path.mockResolvedValue({folders:[folder("case", "2026-001")]});
        await act(async () => result.current.remember([doc("a")], [folder("case", "2026-001")]));
        rerender({docs:[doc("a"), doc("b", null)]});
        await act(async () => resolve(doc("a", null)));
        expect(result.current.paths.a).toEqual([{id:"case",name:"2026-001"}]);
        await waitFor(() => expect(result.current.paths.b).toEqual([]));
    });
    it("updates a displayed path when a later listing reports a moved document", async () => {
        api.path.mockImplementation(async (_kind: string, id: string) => ({folders:[folder(id, id)]}));
        const {result, rerender} = renderHook(({docs}) => useLibrarySourcePaths(docs), {initialProps:{docs:[doc("a", "first")]}});
        await waitFor(() => expect(result.current.paths.a?.[0]?.id).toBe("first"));
        rerender({docs:[doc("a", "second")]});
        await waitFor(() => expect(result.current.paths.a?.[0]?.id).toBe("second"));
    });
    it("refreshes unchanged folder IDs after an ancestor move and retries unavailable paths", async () => {
        api.path.mockRejectedValueOnce(new Error("temporarily unavailable"));
        const {result, rerender} = renderHook(({refresh}) => useLibrarySourcePaths([doc("a", "party")], refresh), {initialProps:{refresh:0}});
        await waitFor(() => expect(result.current.paths.a).toBeNull());
        api.document.mockResolvedValue(doc("a", "party"));
        api.path.mockResolvedValueOnce({folders:[folder("old", "Old case"),folder("party", "Party", "old")]});
        rerender({refresh:1});
        await waitFor(() => expect(result.current.paths.a?.[0]?.name).toBe("Old case"));
        api.path.mockResolvedValueOnce({folders:[folder("new", "Renamed case"),folder("party", "Party", "new")]});
        rerender({refresh:2});
        await waitFor(() => expect(result.current.paths.a?.[0]?.name).toBe("Renamed case"));
        expect(api.path).toHaveBeenCalledTimes(3);
    });
    it("reports distinct known roots only and has no cache across owner-keyed lifetimes", async () => {
        api.path.mockImplementation(async (_kind: string, id: string) => ({folders:[folder(id, id === "one" ? "2026-001" : "2026-002")]}));
        const first = renderHook(() => useLibrarySourcePaths([]));
        await act(async () => {
            first.result.current.remember([doc("a"),doc("b")], [folder("one", "2026-001")]);
            first.result.current.remember([doc("c")], [folder("two", "2026-002")]);
        });
        expect(selectedSourceRoots(["a","b","c","unknown"], first.result.current.paths).map(item=>item.id)).toEqual(["one","two"]);
        first.unmount();
        api.document.mockRejectedValue(new Error("not owned"));
        const second = renderHook(() => useLibrarySourcePaths([doc("a")]));
        await waitFor(() => expect(second.result.current.paths.a).toBeNull());
    });
});
