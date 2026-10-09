"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { WarningPopup } from "../popups/WarningPopup";
import { COURTOS_PILOT_MODE } from "@/app/lib/courtos";

interface Props {
    open: boolean;
    onClose: () => void;
    /** Optional override for the body sentence. */
    message?: string;
    /** Optional override for the heading — e.g. a rejected key, not a missing one. */
    title?: string;
}

export function ApiKeyMissingPopup({
    open,
    onClose,
    message,
    title,
}: Props) {
    const router = useRouter();
    if (!open) return null;

    const body = COURTOS_PILOT_MODE
        ? "Das zentral eingerichtete Testmodell ist derzeit nicht verfügbar. Eigene API-Schlüssel sind nicht nötig. Versuchen Sie es später erneut."
        : message ??
        "You haven't enabled any models yet. Add an API key in settings to get started.";

    const handleGoToSettings = () => {
        onClose();
        router.push(COURTOS_PILOT_MODE ? "/pilot" : "/settings/byok");
    };

    return (
        <WarningPopup
            open={open}
            onClose={onClose}
            title={COURTOS_PILOT_MODE ? "Testmodell nicht verfügbar" : title ?? "API key required"}
            message={body}
            icon={
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            }
            primaryAction={{
                label: COURTOS_PILOT_MODE ? "Zum Einstieg" : "Go to settings",
                onClick: handleGoToSettings,
            }}
        />
    );
}
