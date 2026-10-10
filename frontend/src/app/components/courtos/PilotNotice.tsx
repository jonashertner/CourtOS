import Link from "next/link";
import { COURTOS_HOME, COURTOS_KNOWLEDGE_ENABLED, COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";

export function PilotNotice() {
    return (
        <aside aria-label="Testbetrieb" className="shrink-0 border-b border-border bg-app-background py-2 pl-16 pr-4 text-xs leading-relaxed text-foreground md:px-8">
            <Link href={COURTOS_HOME} className="font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">CourtOS · Testbetrieb</Link>
            <span> · {COURTOS_KNOWLEDGE_ENABLED ? "Synthetische Akten und rechtmässig nutzbare, nicht vertrauliche Literatur." : "Nur synthetische Daten."} CourtOS-Server; kein Betrieb im Gericht.</span>
            {COURTOS_SELF_REGISTRATION && <span> · Bis 3 Assistentenaufträge pro UTC-Tag; 5 MiB pro Datei.</span>}
        </aside>
    );
}
