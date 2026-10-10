"use client";

import { useEffect, useId, useState } from "react";
import { ConfirmPopup } from "@/app/components/popups/ConfirmPopup";
import { useLibraryText } from "@/app/hooks/useLibraryText";
import { libraryMessages as L } from "@/app/lib/libraryMessages";
import type { DocumentUploadFolderChoice } from "@/app/lib/documentDirectoryUpload";

/** A folder decision only. Uploads still create separate document identities;
 * this dialog never authorises replacing a document or a version. */
export function FolderUploadConflictPopup({ conflict, onChoose }: {
    conflict: { targetPath: string; suggestedName: string } | null;
    onChoose(choice: DocumentUploadFolderChoice): void;
}) {
    const t = useLibraryText();
    const name = useId();
    const [choice, setChoice] = useState<"reuse" | "rename" | null>(null);
    useEffect(() => { setChoice(null); }, [conflict]);
    return <ConfirmPopup
        open={!!conflict}
        title={t(L.folderUploadChoice)}
        message={conflict && <>
            <p className="break-words"><span>{t(L.folderUploadTarget)}: </span><strong>{conflict.targetPath}</strong></p>
            <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">{t(L.folderUploadChoice)}</legend>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name={name} checked={choice === "reuse"} onChange={() => setChoice("reuse")} /><span>{t(L.folderUploadReuse)}</span></label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name={name} checked={choice === "rename"} onChange={() => setChoice("rename")} /><span>{t(L.folderUploadSeparate, { name: conflict.suggestedName })}</span></label>
            </fieldset>
            <p className="mt-3">{t(L.folderUploadPreserve)}</p>
        </>}
        confirmLabel={t(L.continue)}
        confirmDisabled={!choice}
        cancelLabel={t(L.cancel)}
        onConfirm={() => { if (choice) onChoose(choice); }}
        onCancel={() => onChoose("cancel")}
    />;
}
