"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
    NO_MODELS_MESSAGES,
    type NoModelsReason,
} from "@/shared/lib/modelCatalog";
import { WarningPopup } from "./WarningPopup";
import { COURTOS_PILOT_MODE } from "@/app/lib/courtos";

export function NoModelsWarningPopup({
    reason,
    onClose,
}: {
    reason: NoModelsReason | null;
    onClose: () => void;
}) {
    if (!reason) return null;

    return <VisibleNoModelsWarning reason={reason} onClose={onClose} />;
}

function VisibleNoModelsWarning({
    reason,
    onClose,
}: {
    reason: NoModelsReason;
    onClose: () => void;
}) {
    const router = useRouter();

    return (
        <WarningPopup
            open
            onClose={onClose}
            title={COURTOS_PILOT_MODE ? "Kein Testmodell verfügbar" : "No models available"}
            message={COURTOS_PILOT_MODE ? "Das eingerichtete Modell ist noch nicht verfügbar. Versuchen Sie es später erneut. Eigene API-Schlüssel sind für diesen Pilot nicht nötig." : NO_MODELS_MESSAGES[reason]}
            icon={
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            }
            primaryAction={{
                label: COURTOS_PILOT_MODE ? "Zum Einstieg" : "Open Bring Your Own Keys",
                onClick: () => {
                    onClose();
                    router.push(COURTOS_PILOT_MODE ? "/pilot" : "/settings/byok");
                },
            }}
        />
    );
}
