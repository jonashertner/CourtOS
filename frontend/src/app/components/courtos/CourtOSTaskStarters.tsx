"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const tasks = [
    { title: "Chronologie erstellen", prompt: "Erstelle aus den beigefügten synthetischen Unterlagen eine Chronologie. Nenne zu jedem Eintrag Datum, Vorgang und genaue Fundstelle. Unterscheide belegte Tatsachen, Parteibehauptungen und ungeklärte Punkte. Weise auf fehlende Belege hin und erfinde keine Daten." },
    { title: "Widersprüche prüfen", prompt: "Vergleiche die Aussagen in den beigefügten synthetischen Unterlagen. Stelle entscheidrelevante Widersprüche gegenüber: Aussage, Gegenposition, jeweilige Fundstelle und offene Frage. Unterscheide einen tatsächlichen Widerspruch von einer blossen Informationslücke. Erkläre, welche zusätzliche Abklärung helfen würde." },
    { title: "Vermerk vorbereiten", prompt: "Bereite auf Grundlage der beigefügten synthetischen Unterlagen einen kurzen Vermerk zur richterlichen Prüfung vor. Gliedere ihn in belegten Sachverhalt, entscheidrelevante Rechtsfragen, unterschiedliche vertretbare Bewertungen und offene Punkte. Belege jede tragende Tatsachenangabe mit einer Fundstelle. Benenne zusätzlich benötigte Rechtsquellen, statt Rechtsprechung zu erfinden. Lasse die abschliessende Würdigung ausdrücklich offen." },
];

export function CourtOSTaskStarters({ prepareDraft }: { prepareDraft: (prompt: string) => boolean }) {
    const [message, setMessage] = useState("");
    return (
        <section aria-label="Auftragsvorschläge für die Gerichtsarbeit" className="mt-4 pb-8">
            <p className="mb-3 text-center text-xs leading-relaxed text-muted-foreground">Testunterlagen hinzufügen, Auftrag vorbereiten, vor dem Senden anpassen.</p>
            <div className="courtos-task-starters">
                {tasks.map((task, index) => (
                    <button key={task.title} type="button" onClick={() => {
                        const prepared = prepareDraft(task.prompt);
                        setMessage(prepared ? "Der Auftrag steht im Eingabefeld. Fügen Sie Ihre Testunterlagen hinzu und prüfen Sie den Text vor dem Senden." : "Ihr vorhandener Entwurf bleibt erhalten. Leeren Sie das Eingabefeld zuerst, wenn Sie einen anderen Auftragsvorschlag übernehmen möchten.");
                    }} className="courtos-task-starter">
                        <span className="courtos-kicker" aria-hidden="true">0{index + 1}</span><span>{task.title}</span><ArrowUpRight aria-hidden="true" />
                    </button>
                ))}
            </div>
            <p role="status" className="mx-auto mt-3 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">{message}</p>
        </section>
    );
}
