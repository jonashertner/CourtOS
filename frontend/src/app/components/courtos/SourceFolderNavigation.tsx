"use client";

import type { LibraryFolder } from "@/app/components/shared/types";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { sourcePickerMessages as P } from "@/app/lib/sourcePickerMessages";
import { selectedSourceRoots, type SourceFolderPath, type SourcePaths } from "@/app/hooks/useLibrarySourcePaths";

export function SourceFolderBreadcrumbs({path, onChange}: {path: LibraryFolder[]; onChange(path: LibraryFolder[]): void}) {
    const {t} = useCourtOSLocale();
    return <nav aria-label={t(P.folders)} className="mt-3 flex flex-wrap items-center gap-x-2 text-xs break-words">
        <button type="button" className="courtos-link min-h-11" aria-current={!path.length ? "location" : undefined} onClick={() => onChange([])}>{t(P.root)}</button>
        {path.map((folder, index) => <span key={folder.id} className="min-w-0"><span aria-hidden="true"> / </span><button type="button" className="courtos-link min-h-11 break-words text-left" aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => onChange(path.slice(0, index + 1))}>{folder.name}</button></span>)}
    </nav>;
}

export function SourcePath({path}: {path: SourceFolderPath | null | undefined}) {
    const {t} = useCourtOSLocale();
    return <small className="mt-1 block break-words text-xs text-muted-foreground">{path === undefined ? t(P.pathLoading) : path === null ? t(P.pathUnknown) : path.length ? path.map(folder => folder.name).join(" / ") : t(P.rootPath)}</small>;
}

export function MixedSourceFolders({ids, paths}: {ids: string[]; paths: SourcePaths}) {
    const {t} = useCourtOSLocale();
    const roots = selectedSourceRoots(ids, paths);
    return roots.length > 1 ? <p role="status" className="my-3 text-xs leading-relaxed break-words">{t(P.mixed, {folders: roots.map(folder => folder.name).join("; ")})}</p> : null;
}
