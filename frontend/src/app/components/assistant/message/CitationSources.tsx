import Image from "next/image";
import { hasCheckedCitationLocation } from "@/app/lib/citationEvidence";
import { Loader2 } from "lucide-react";
import { FileTypeIcon } from "../../shared/FileTypeIcon";
import { displayCitationQuote, formatCitationPage } from "../../shared/types";
import type { Citation } from "../../shared/types";
import { librarySourceUrl } from "@/app/lib/sourceLinks";
import { CitationPillUI } from "@/shared/ui/CitationPillUI";
import { RESPONSE_GLASS_SURFACE } from "./messageStyles";
import {
    citationVerificationAriaLabel,
    citationVerificationDescription,
    citationVerificationPillClassName,
} from "./citationVerification";

type CitationSourceRow = {
    key: string;
    label: string;
    source: Citation;
    entries: { annotation: Citation; index: number }[];
};

function citationSourceKey(annotation: Citation): string {
    if (annotation.kind === "case") {
        return `case:${annotation.cluster_id}`;
    }
    return `document:${annotation.document_id}`;
}

function citationSourceLabel(annotation: Citation): string {
    if (annotation.kind === "case") {
        const caseName = annotation.case_name?.trim();
        const citation = annotation.citation?.trim();
        if (caseName && citation) return `${caseName}, ${citation}`;
        return caseName || citation || `Case ${annotation.cluster_id}`;
    }
    return annotation.filename;
}

export function citationTooltip(annotation: Citation): string {
    const locator = formatCitationPage(annotation);
    const quote = displayCitationQuote(annotation);
    const source = locator ? `${locator}: "${quote}"` : `"${quote}"`;
    const verification = citationVerificationDescription(annotation);
    return verification ? `${source} — ${verification}` : source;
}

function CitationSourceIcon({ annotation }: { annotation: Citation }) {
    if (annotation.kind === "case") {
        return (
            <Image
                src="/icons/legal-sources/case-law.svg"
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                className="h-3.5 w-3.5 shrink-0"
            />
        );
    }
    return (
        <FileTypeIcon fileType={annotation.filename} className="h-3.5 w-3.5" />
    );
}

function buildCitationSourceRows(citations: Citation[]): CitationSourceRow[] {
    const rows = new Map<string, CitationSourceRow>();
    citations.forEach((annotation, index) => {
        const key = citationSourceKey(annotation);
        const existing = rows.get(key);
        if (existing) {
            existing.entries.push({ annotation, index });
            return;
        }
        rows.set(key, {
            key,
            label: citationSourceLabel(annotation),
            source: annotation,
            entries: [{ annotation, index }],
        });
    });
    return Array.from(rows.values());
}

function escapeHtmlText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function ensureTerminalPeriod(value: string): string {
    return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}

function appendixPages(page: number | string): number[] {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(String(page));
    if (!match) return [];
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    // Match the page verifier's bounded cross-page representation.
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first || last - first > 2) return [];
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function buildCitationAppendix(citations: Citation[], origin?: string) {
    if (citations.length === 0) return { html: "", text: "" };
    const entries = citations.map((annotation) => {
        const version = annotation.kind === "case" ? "" : annotation.version_number
            ? `Version ${annotation.version_number}` : annotation.version_id ? `Fassung ${annotation.version_id}` : "Fassung nicht angegeben";
        const label = [citationSourceLabel(annotation), version, formatCitationPage(annotation)].filter(Boolean).join(", ");
        const pages = annotation.kind === "case" ? [] : (annotation.quotes?.length ? annotation.quotes : [annotation]).flatMap(quote => appendixPages(quote.page));
        const checked = hasCheckedCitationLocation(annotation);
        const links = annotation.kind === "case" || !origin || !checked ? [] :
            [...new Set(pages)].flatMap(page => {
                if (page === null || !annotation.version_id) return [];
                const url = librarySourceUrl(origin, annotation.document_id, annotation.version_id, page);
                return url ? [{ page, url }] : [];
            });
        return {
            number: annotation.ref,
            label,
            quote: displayCitationQuote(annotation).trim(),
            links,
            unconfirmed: !checked,
        };
    });
    const textLines = [
        "",
        "Citations",
        ...entries.map((entry) => {
            const quote = entry.quote ? ` "${entry.quote}"` : "";
            return `${entry.number} ${ensureTerminalPeriod(entry.label)}${quote}${entry.unconfirmed ? " [Zitat nicht bestätigt]" : ""}${entry.links.map(link => `\nOriginal, PDF-Seite ${link.page}: ${link.url}`).join("")}`;
        }),
    ];
    const html = [
        `<section class="copied-citations">`,
        `<h3>Citations</h3>`,
        ...entries.map((entry) => {
            const label = escapeHtmlText(ensureTerminalPeriod(entry.label));
            const quote = entry.quote
                ? ` &quot;${escapeHtmlText(entry.quote)}&quot;`
                : "";
            const links = entry.links.map(link => `<br><a href="${escapeHtmlText(link.url)}">Original, PDF-Seite ${link.page}</a>`).join("");
            return `<p><sup>${entry.number}</sup> ${label}${quote}${entry.unconfirmed ? " [Zitat nicht bestätigt]" : ""}${links}</p>`;
        }),
        `</section>`,
    ].join("");
    return { html, text: textLines.join("\n") };
}

export function CitationsBlock({
    citations,
    activeCitation,
    onCitationClick,
    onOpenSource,
    canOpenSource,
    showWhenEmpty = false,
    isLoading = false,
}: {
    citations: Citation[];
    activeCitation?: Citation | null;
    onCitationClick?: (citation: Citation) => void;
    onOpenSource?: (citation: Citation) => void;
    canOpenSource?: (citation: Citation) => boolean;
    showWhenEmpty?: boolean;
    isLoading?: boolean;
}) {
    const rows = buildCitationSourceRows(citations);
    if (rows.length === 0 && !showWhenEmpty) return null;

    return (
        <div className="mt-2 mb-3">
            <div className={`overflow-hidden ${RESPONSE_GLASS_SURFACE}`}>
                <div className="flex items-center justify-between gap-3 bg-white/25 px-3 py-2">
                    <h3 className="text-base font-serif text-gray-900">
                        Citations
                    </h3>
                    {isLoading && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    )}
                </div>
                <div>
                    {rows.map((row) => {
                        const sourceIsClickable =
                            !!onOpenSource &&
                            (canOpenSource?.(row.source) ?? true);
                        return (
                            <div
                                key={row.key}
                                className="flex items-start gap-3 px-3 py-3"
                            >
                                <button
                                    type="button"
                                    onClick={() => onOpenSource?.(row.source)}
                                    disabled={!sourceIsClickable}
                                    title={row.label}
                                    // The name takes whatever the pills leave and
                                    // wraps to two lines before truncating.
                                    className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left text-sm font-serif text-gray-700 transition-colors enabled:hover:text-gray-950 disabled:cursor-default"
                                >
                                    <span className="mt-[3px] flex shrink-0">
                                        <CitationSourceIcon
                                            annotation={row.source}
                                        />
                                    </span>
                                    <span className="line-clamp-2 [overflow-wrap:anywhere]">
                                        {row.label}
                                    </span>
                                </button>
                                {/* Only as wide as its pills, up to 60% of the
                                    row; beyond that the pills wrap, so every
                                    pill shows and the name keeps 40%. */}
                                <div className="flex max-w-[60%] shrink-0 flex-wrap justify-end gap-1">
                                    {row.entries.map(
                                        ({ annotation, index }) => (
                                            <CitationPillUI
                                                key={`${row.key}:${index}`}
                                                active={
                                                    activeCitation ===
                                                    annotation
                                                }
                                                onClick={() =>
                                                    onCitationClick?.(
                                                        annotation,
                                                    )
                                                }
                                                className={citationVerificationPillClassName(
                                                    annotation,
                                                )}
                                                aria-label={citationVerificationAriaLabel(
                                                    annotation,
                                                )}
                                                title={citationTooltip(
                                                    annotation,
                                                )}
                                            >
                                                {annotation.ref}
                                            </CitationPillUI>
                                        ),
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
