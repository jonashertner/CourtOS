import type { ReactNode } from "react";

const locations = {
    gemma: { route: "server", name: "Gemma 4", place: "CourtOS-Server · Deutschland" },
    anthropic: { route: "external", name: "Claude Opus 5.5", place: "Anthropic · externe API" },
    opencaselaw: { route: "external", name: "OpenCaseLaw", place: "Externer KI-Suchdienst" },
    library: { route: "server", name: "Eigene Quellen", place: "CourtOS-Server · Deutschland" },
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
    const location = locations[service];
    return <span className={`courtos-processing-location ${className}`} data-processing-route={location.route} data-processing-service={service}>
        <span className="courtos-processing-destination"><strong>{location.name}</strong><span> · {location.place}</span></span>
        {stage && <span className="courtos-processing-state">{stage === "draft" ? "Entwurf · noch nicht gesendet" : "Anfrage läuft"}</span>}
        {children && <span className="courtos-processing-detail">{children}</span>}
    </span>;
}
