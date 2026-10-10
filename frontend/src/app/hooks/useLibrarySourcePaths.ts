"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Document, LibraryFolder } from "@/app/components/shared/types";
import { getDocument, getLibraryFolderPath } from "@/app/lib/mikeApi";

export type SourceFolderPath = Pick<LibraryFolder, "id" | "name">[];
export type SourcePaths = Record<string, SourceFolderPath | null | undefined>;

/** Display metadata only. Neither a case classification nor an immutable source locator. */
export function selectedSourceRoots(ids: string[], paths: SourcePaths): SourceFolderPath {
    return Array.from(new Map(ids.flatMap(id => paths[id]?.[0] ? [[paths[id]![0].id, paths[id]![0]] as const] : [])).values());
}
function checkedPath(folders: LibraryFolder[], target: string): SourceFolderPath | null {
    if (!Array.isArray(folders) || !folders.length || folders.length > 32 || folders.at(-1)?.id !== target) return null;
    const seen = new Set<string>();
    for (let index = 0; index < folders.length; index++) {
        const folder = folders[index];
        if (!folder?.id || !folder.name || seen.has(folder.id) || folder.parent_folder_id !== (index ? folders[index - 1].id : null)) return null;
        seen.add(folder.id);
    }
    return folders.map(({id, name}) => ({id, name}));
}

/** Owner-scoped by the workspace's keyed lifetime; no storage or cross-account cache. */
export function useLibrarySourcePaths(documents: Document[], refresh = 0) {
    const [paths, setPaths] = useState<SourcePaths>({});
    const known = useRef<SourcePaths>({});
    const locations = useRef(new Map<string, string | null | undefined>());
    const pending = useRef(new Map<string, Promise<SourceFolderPath | null>>());
    const folderRequests = useRef(new Map<string, Promise<SourceFolderPath | null>>());
    const generation = useRef(0), lastRefresh = useRef(refresh), mounted = useRef(true);
    const key = JSON.stringify(documents.map(doc => [doc.id, doc.library_folder_id]));
    useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);

    const readFolder = useCallback((id: string | null) => {
        if (id === null) return Promise.resolve<SourceFolderPath>([]);
        let request = folderRequests.current.get(id);
        if (!request) {
            request = (async () => {try {return checkedPath((await getLibraryFolderPath("files", id)).folders, id);} catch {return null;}})();
            folderRequests.current.set(id, request);
        }
        return request;
    }, []);
    const publish = useCallback((id: string, request: Promise<SourceFolderPath | null>) => {
        const currentGeneration = generation.current;
        pending.current.set(id, request);
        void request.then(path => {
            if (!mounted.current || generation.current !== currentGeneration || pending.current.get(id) !== request) return;
            known.current[id] = path;
            setPaths(previous => ({...previous, [id]: path}));
        });
    }, []);
    const remember = useCallback((listed: Document[], folders: LibraryFolder[]) => {
        // The listing proves the containing folder ID. Read its current ancestor names,
        // rather than retaining old breadcrumb names after a rename or folder move.
        const folderId = folders.at(-1)?.id ?? null;
        const request = readFolder(folderId);
        for (const doc of listed) {locations.current.set(doc.id, folderId); publish(doc.id, request);}
    }, [publish, readFolder]);

    useEffect(() => {
        if (lastRefresh.current !== refresh) {
            lastRefresh.current = refresh; generation.current++;
            known.current = {}; locations.current.clear(); pending.current.clear(); folderRequests.current.clear(); setPaths({});
        }
        const unique = new Map(documents.map(doc => [doc.id, doc]));
        for (const doc of unique.values()) {
            const moved = doc.library_folder_id !== undefined && locations.current.has(doc.id) && locations.current.get(doc.id) !== doc.library_folder_id;
            if (moved) {delete known.current[doc.id]; pending.current.delete(doc.id); setPaths(previous => ({...previous, [doc.id]: undefined}));}
            if (known.current[doc.id] !== undefined || pending.current.has(doc.id)) continue;
            locations.current.set(doc.id, doc.library_folder_id);
            publish(doc.id, (async () => {
                try {
                    // Restored selections have no folder data. An explicit refresh also
                    // rechecks selected documents that are outside the visible directory.
                    const metadata = refresh > 0 || doc.library_folder_id === undefined ? await getDocument(doc.id) : doc;
                    if (metadata.id !== doc.id || metadata.project_id || metadata.workflow_id || metadata.library_kind && metadata.library_kind !== "file") return null;
                    if (metadata.library_folder_id === undefined) return null;
                    return await readFolder(metadata.library_folder_id);
                } catch {return null;}
            })());
        }
        // The key covers the metadata used above; arrays may be assembled afresh by the caller.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, refresh, publish, readFolder]);
    return {paths, remember};
}
