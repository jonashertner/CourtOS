"use client";
import { useLibraryText } from "@/app/hooks/useLibraryText";
import { libraryMessages as L } from "@/app/lib/libraryMessages";

import { Files, FolderUp, Upload } from "lucide-react";
import {
    Dropdown,
    DropdownContent,
    DropdownItem,
    DropdownTrigger,
} from "@/shared/ui/dropdown";
import { HeaderButtonUI } from "@/shared/ui/HeaderButtonsUI";

interface DocumentUploadMenuProps {
    onSavedFiles?: (() => void) | null;
    onUploadFiles: (() => void) | null;
    onUploadFolder?: (() => void) | null;
    disabled?: boolean;
}

export function DocumentUploadMenu({
    onSavedFiles,
    onUploadFiles,
    onUploadFolder,
    disabled = false,
}: DocumentUploadMenuProps) {
    const t=useLibraryText();
    const triggerDisabled =
        disabled || (!onSavedFiles && !onUploadFiles && !onUploadFolder);

    return (
        <Dropdown>
            <DropdownTrigger asChild>
                <HeaderButtonUI
                    disabled={triggerDisabled}
                    title={t(L.upload)}
                    aria-label={t(L.upload)}
                    iconOnly
                >
                    <Upload className="h-3.5 w-3.5" />
                </HeaderButtonUI>
            </DropdownTrigger>
            <DropdownContent
                align="end"
                className="min-w-40 p-1"
            >
                {onSavedFiles !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onSavedFiles}
                        onSelect={() => onSavedFiles?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <Files className="mr-2 h-3.5 w-3.5" />{t(L.saved)}</DropdownItem>
                )}
                <DropdownItem
                    disabled={disabled || !onUploadFiles}
                    onSelect={() => onUploadFiles?.()}
                    className="flex items-center px-3 py-2"
                >
                    <Upload className="mr-2 h-3.5 w-3.5" />{t(L.uploadDocuments)}</DropdownItem>
                {onUploadFolder !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onUploadFolder}
                        onSelect={() => onUploadFolder?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <FolderUp className="mr-2 h-3.5 w-3.5" />{t(L.uploadFolder)}</DropdownItem>
                )}
            </DropdownContent>
        </Dropdown>
    );
}
