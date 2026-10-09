"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Files } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useConfiguredModels } from "@/app/hooks/useConfiguredModels";
import { PilotUsageNotice } from "@/app/components/courtos/PilotUsageNotice";
import { CourtOSCredits } from "@/app/components/courtos/CourtOSCredits";
import { COURTOS_GUIDE_PATH, COURTOS_HYBRID_PATH, COURTOS_KNOWLEDGE_ENABLED, COURTOS_PILOT_MODE, COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";

const linkClass = "courtos-link";
const stages = [
    { number: "01", title: "Akten erschliessen", outcome: "Eine belegte Chronologie", text: "Was geschah wann? Ordnen Sie die Vorgänge und verfolgen Sie jeden Eintrag bis zur Stelle in den Unterlagen zurück." },
    { number: "02", title: "Widersprüche klären", outcome: "Offene entscheidrelevante Fragen", text: "Wo widersprechen sich Protokoll, Stellungnahme und Entwurf? Halten Sie fest, was belegt ist und was noch geklärt werden muss." },
    { number: "03", title: "Entscheid vorbereiten", outcome: "Ein prüfbarer Vermerk", text: "Führen Sie Sachverhalt, Rechtsquellen und offene Punkte zusammen. Prüfen und bearbeiten Sie den Entwurf für Ihre weitere Arbeit." },
];

export default function CourtOSPilotPage() {
    const { user } = useAuth();
    const configuredModels = useConfiguredModels();

    return (
        <div className="h-full overflow-y-auto">
            <div className="courtos-page w-full">
                <header className="max-w-3xl">
                    <p className="courtos-kicker mb-6">COURTOS · OPENCASELAW</p>
                    <h1 className="courtos-display text-foreground">Von den Akten zum<br />prüfbaren Entwurf.</h1>
                    <p className="courtos-lede mt-6">
                        Für Gerichtsschreiberinnen und Gerichtsschreiber, die Akten aufbereiten, und Richterinnen und Richter, die sich ein eigenes Urteil bilden. Erproben Sie CourtOS an einem vollständigen Übungsdossier und prüfen Sie, was Ihre Arbeit tatsächlich erleichtert.
                    </p>
                </header>

                <section aria-labelledby="case-linden" className="courtos-feature">
                    <p className="courtos-kicker">Geführter Fall<br /><span className="mt-3 block normal-case tracking-normal">Alle Unterlagen vorhanden</span></p>
                    <div>
                    <h2 id="case-linden" className="courtos-section-title">Linden: Wurde die Stellungnahme berücksichtigt?</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Eine Anhörung, ein Versand- und Eingangsprotokoll, eine Stellungnahme und ein Verfügungsentwurf. An vier erfundenen Dokumenten untersuchen Sie den Ablauf und die offenen Gehörsfragen – vom Aktenbeleg bis zum Vermerk.
                    </p>
                    <a href={COURTOS_HYBRID_PATH} className="courtos-button mt-6">Fall Linden bearbeiten <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Die geführte Anwendung öffnet separat. Sie müssen keine Akten vorbereiten oder hochladen.</p>
                    </div>
                </section>

                {COURTOS_SELF_REGISTRATION && <div className="mt-6 max-w-3xl"><PilotUsageNotice /></div>}

                <section aria-label="Arbeitsschritte und Ergebnisse" className="courtos-stages">
                    {stages.map((stage) => (
                        <article key={stage.number} className="courtos-stage">
                            <p className="courtos-kicker">{stage.number}</p>
                            <h2 className="mt-2 font-serif text-2xl">{stage.title}</h2>
                            <p className="mt-3 text-sm font-semibold">{stage.outcome}</p>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.text}</p>
                        </article>
                    ))}
                </section>

                <section aria-labelledby="own-work" className="courtos-work-section">
                    <h2 id="own-work" className="courtos-section-title">Mit eigenen Testunterlagen weiterarbeiten</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Legen Sie ein Projekt mit synthetischen Akten an oder formulieren Sie einen Auftrag im Assistenten. Dort finden Sie passende Einstiege für Chronologie, Widerspruchsprüfung und Vermerk.</p>
                    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
                        <a href="/courtos-examples/Testdossier_Linden.pdf" download className={linkClass}><Files className="h-4 w-4" aria-hidden="true" /> Testdossier Linden als PDF herunterladen</a>
                        <Link href="/projects" className={linkClass}><Files className="h-4 w-4" aria-hidden="true" /> Testprojekt anlegen</Link>
                        <Link href="/assistant" className={linkClass}>Zum Assistenten <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                        <a href={COURTOS_GUIDE_PATH} className={linkClass}><BookOpen className="h-4 w-4" aria-hidden="true" /> Handbuch</a>
                    </div>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Fügen Sie die heruntergeladene PDF-Datei dem Assistenten oder Ihrem Testprojekt hinzu. Der Vorschlag «Chronologie erstellen» bereitet einen Auftrag mit Dokument- und Absatzbelegen im Eingabefeld vor. Sie können ihn vor dem Senden anpassen.</p>
                </section>

                {COURTOS_KNOWLEDGE_ENABLED && <section className="courtos-work-section" aria-labelledby="knowledge-intro">
                    <h2 id="knowledge-intro" className="courtos-section-title">Die passende Stelle in Literatur und Rechtsprechung finden</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Wählen Sie eigene Bibliotheksdokumente und suchen Sie lokal nach belegbaren Passagen. Öffentliche Entscheide finden Sie daneben in einer getrennten OpenCaseLaw-Suche. Jeder Treffer führt zur Quelle zurück.</p>
                    <Link href="/knowledge" className={`${linkClass} mt-4`}>Wissensbasis öffnen <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </section>}

                {COURTOS_PILOT_MODE && (
                    <p className="mt-9 max-w-3xl text-sm leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">{COURTOS_KNOWLEDGE_ENABLED ? "Synthetische Fälle und geeignete Literatur." : "Nur synthetische Fälle."}</strong> {COURTOS_KNOWLEDGE_ENABLED && "Öffentliche oder rechtmässig nutzbare, nicht vertrauliche Literaturauszüge sind ebenfalls möglich. "}Bitte keine echten Akten, Personendaten oder vertraulichen Inhalte eingeben. Ein Entwurf bleibt zu prüfen; CourtOS trifft keinen Entscheid. Einige Fachansichten sind in diesem Pilot noch englischsprachig.</p>
                )}

                <details className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    <summary className="cursor-pointer text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Zugang, Modelle und Verarbeitung</summary>
                    <div className="mt-4 space-y-3">
                        {user && <p className="[overflow-wrap:anywhere]">Angemeldet als {user.email}.</p>}
                        {COURTOS_SELF_REGISTRATION && <p>Ihr persönliches Konto entsteht nach der Anmeldung mit E-Mail-Code. Eine Einladung ist nicht nötig. Der geführte Fall und der Arbeitsraum führen getrennte Sitzungen und speichern ihre Ergebnisse getrennt.</p>}
                        <p>CourtOS läuft auf einem Hetzner-VPS in Deutschland. «Lokal» bezeichnet das selbst betriebene Modell auf diesem Server, nicht die Infrastruktur Ihres Gerichts oder Ihrer Behörde.</p>
                        <p>Vom Server eingerichtete Modelle: {configuredModels.length ? configuredModels.map((model) => model.label).join(", ") : "Noch keine Modellliste bestätigt."} Ein Katalogeintrag bestätigt nicht, dass ein Modell gerade erreichbar ist.</p>
                        <p>Im geführten Fall sehen Sie vor einer externen Analyse die genaue Anfrage und geben sie ausdrücklich frei. Diese Eigenschaft gilt nicht automatisch für jede Funktion der Arbeitsumgebung. Der Link zum Übungsfall überträgt keine Texte oder Dateien aus CourtOS.</p>
                    </div>
                </details>
                <footer className="mt-10 border-t border-border pt-6"><CourtOSCredits /></footer>
            </div>
        </div>
    );
}
