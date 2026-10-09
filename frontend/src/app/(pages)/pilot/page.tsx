"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Files } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useConfiguredModels } from "@/app/hooks/useConfiguredModels";
import { PilotUsageNotice } from "@/app/components/courtos/PilotUsageNotice";
import { CourtOSCredits } from "@/app/components/courtos/CourtOSCredits";
import { COURTOS_GUIDE_PATH, COURTOS_HYBRID_PATH, COURTOS_PILOT_MODE, COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";
import { LIQUID_SUBTLE_PANEL_SURFACE_CLASS } from "@/app/components/ui/liquid-surface";
import { pillButtonUIClassName } from "@/shared/ui/PillButtonUI.styles";
import { cn } from "@/app/lib/utils";

const linkClass = "inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring";
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
            <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">
                <header className="max-w-3xl">
                    <p className="mb-4 text-xs font-medium tracking-widest text-muted-foreground">COURTOS · OPENCASELAW</p>
                    <h1 className="font-serif text-4xl leading-tight text-foreground md:text-5xl">Von den Akten zum<br />prüfbaren Entwurf.</h1>
                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
                        Für Gerichtsschreiberinnen und Gerichtsschreiber, die Akten aufbereiten, und Richterinnen und Richter, die sich ein eigenes Urteil bilden. Erproben Sie CourtOS an einem vollständigen Übungsdossier und prüfen Sie, was Ihre Arbeit tatsächlich erleichtert.
                    </p>
                </header>

                {COURTOS_SELF_REGISTRATION && <div className="mt-6 max-w-3xl"><PilotUsageNotice /></div>}

                <section aria-labelledby="case-linden" className={cn(LIQUID_SUBTLE_PANEL_SURFACE_CLASS, "mt-8 p-6 md:p-8")}>
                    <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">GEFÜHRTER FALL · ALLE UNTERLAGEN VORHANDEN</p>
                    <h2 id="case-linden" className="font-serif text-3xl">Linden: Wurde die Stellungnahme berücksichtigt?</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Eine Anhörung, ein Versand- und Eingangsprotokoll, eine Stellungnahme und ein Verfügungsentwurf. An vier erfundenen Dokumenten untersuchen Sie den Ablauf und die offenen Gehörsfragen – vom Aktenbeleg bis zum Vermerk.
                    </p>
                    <a href={COURTOS_HYBRID_PATH} className={pillButtonUIClassName({tone:"black",size:"normal",className:"mt-6 min-h-11"})}>Fall Linden bearbeiten <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Die geführte Anwendung öffnet separat. Sie müssen keine Akten vorbereiten oder hochladen.</p>
                </section>

                <section aria-label="Arbeitsschritte und Ergebnisse" className="mt-9 grid gap-7 md:grid-cols-3">
                    {stages.map((stage) => (
                        <article key={stage.number}>
                            <p className="text-xs font-medium text-muted-foreground">{stage.number}</p>
                            <h2 className="mt-2 font-serif text-2xl">{stage.title}</h2>
                            <p className="mt-3 text-sm font-semibold">{stage.outcome}</p>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.text}</p>
                        </article>
                    ))}
                </section>

                <section aria-labelledby="own-work" className="mt-10 border-t border-border pt-7">
                    <h2 id="own-work" className="font-serif text-2xl">Mit eigenen Testunterlagen weiterarbeiten</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Legen Sie ein Projekt mit synthetischen Akten an oder formulieren Sie einen Auftrag im Assistenten. Dort finden Sie passende Einstiege für Chronologie, Widerspruchsprüfung und Vermerk.</p>
                    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
                        <a href="/courtos-examples/Testdossier_Linden.pdf" download className={linkClass}><Files className="h-4 w-4" aria-hidden="true" /> Testdossier Linden als PDF herunterladen</a>
                        <Link href="/projects" className={linkClass}><Files className="h-4 w-4" aria-hidden="true" /> Testprojekt anlegen</Link>
                        <Link href="/assistant" className={linkClass}>Zum Assistenten <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                        <a href={COURTOS_GUIDE_PATH} className={linkClass}><BookOpen className="h-4 w-4" aria-hidden="true" /> Handbuch</a>
                    </div>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Fügen Sie die heruntergeladene PDF-Datei dem Assistenten oder Ihrem Testprojekt hinzu. Der Vorschlag «Chronologie erstellen» bereitet einen Auftrag mit Dokument- und Absatzbelegen im Eingabefeld vor. Sie können ihn vor dem Senden anpassen.</p>
                </section>

                {COURTOS_PILOT_MODE && (
                    <p className="mt-9 max-w-3xl text-sm leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">Nur synthetische Fälle.</strong> Bitte keine echten Akten, Personendaten oder vertraulichen Inhalte eingeben. Ein Entwurf bleibt zu prüfen; CourtOS trifft keinen Entscheid. Einige Fachansichten sind in diesem Pilot noch englischsprachig.</p>
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
