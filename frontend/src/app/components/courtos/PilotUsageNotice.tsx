import { COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";

/** These public-pilot values must stay aligned with the server's admission limits. */
export function PilotUsageNotice() {
    if (!COURTOS_SELF_REGISTRATION) return null;
    return (
        <aside aria-label="Nutzungsgrenzen des Piloten" className="courtos-usage space-y-2 text-muted-foreground">
            <p><strong className="font-semibold text-foreground">Ein begrenzter Testzugang.</strong> Pro UTC-Tag stehen bis zu 3 Aufträge an das lokale Modell und separat 1 externe Analyse zur Verfügung. Die Suche ohne Modellanfrage verbraucht dieses Kontingent nicht. Auch gestartete Modellanfragen, die scheitern, zählen mit. Die gemeinsame Tageskapazität ist ebenfalls begrenzt.</p>
            <p>Dateien dürfen höchstens 5 MiB gross sein; Ihr gesamtes Uploadbudget für diesen Testzugang beträgt 20 MiB. Fehlgeschlagene Uploads und gelöschte Dateien geben dieses Budget nicht automatisch frei.</p>
        </aside>
    );
}
