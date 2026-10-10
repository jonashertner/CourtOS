"use client";

import type { ReactNode } from "react";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";

const locations = {
    gemma: { route: "server", name: "Gemma 4", place: m.serverGermany },
    anthropic: { route: "external", name: "Claude Opus 5.5", place: m.externalApi },
    opencaselaw: { route: "external", name: "OpenCaseLaw", place: m.externalSearch },
    library: { route: "server", name: m.ownSources, place: m.serverGermany },
} as const;

/** The visible name and destination carry the meaning; colour is supplementary.
 * A draft is not evidence of a request. Pending describes the UI request,
 * not confirmation that a model received or processed it. */
export function ProcessingLocation({ service, stage, children, className = "" }: {
    service: keyof typeof locations;
    stage?: "draft" | "pending";
    children?: ReactNode;
    className?: string;
}) {
    const { t } = useCourtOSLocale();
    const location = locations[service];
    return <span className={`courtos-processing-location ${className}`} data-processing-route={location.route} data-processing-service={service}>
        <span className="courtos-processing-destination"><strong>{typeof location.name === "string" ? location.name : t(location.name)}</strong><span> · {t(location.place)}</span></span>
        {stage && <span className="courtos-processing-state">{t(stage === "draft" ? m.draftUnsent : m.requestPending)}</span>}
        {children && <span className="courtos-processing-detail">{children}</span>}
    </span>;
}
