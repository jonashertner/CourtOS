import { CircleAlert } from "lucide-react";
import type { Citation, DocumentCitationQuote } from "../../shared/types";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/popover";

export type CitationVerificationDisplayState = "verified" | "unverified";

type VerificationPresentation = {
  label: string;
  description: string;
  pillClassName: string;
};

const UNVERIFIED_PRESENTATION: VerificationPresentation = {
  label: "Zitat nicht bestätigt",
  description: "Der Wortlaut ist nicht durch einen Textabgleich mit der Quelle bestätigt.",
  pillClassName:
    "!bg-red-100/85 !text-red-800 hover:!bg-red-200/80 hover:!text-red-800 dark:!bg-red-950 dark:!text-white dark:hover:!bg-red-900 dark:hover:!text-white",
};

export function citationVerificationState(
  citation: Citation,
): CitationVerificationDisplayState {
  return citation.verified === true ? "verified" : "unverified";
}

export function quoteVerificationState(
  quote: Pick<DocumentCitationQuote, "verification">,
): CitationVerificationDisplayState {
  return quote.verification?.verified === true ? "verified" : "unverified";
}

export function citationVerificationPillClassName(citation: Citation): string {
  return citationVerificationState(citation) === "unverified"
    ? UNVERIFIED_PRESENTATION.pillClassName
    : "";
}

export function citationVerificationDescription(
  citation: Citation,
): string | null {
  const state = citationVerificationState(citation);
  return state === "unverified" ? UNVERIFIED_PRESENTATION.description : null;
}

export function citationVerificationAriaLabel(citation: Citation): string {
  const state = citationVerificationState(citation);
  const suffix =
    state === "unverified" ? `. ${UNVERIFIED_PRESENTATION.label}` : "";
  return `Citation ${citation.ref}${suffix}`;
}

export function CitationVerificationBadge({
  state,
}: {
  state: CitationVerificationDisplayState;
}) {
  if (state !== "unverified") return null;

  const presentation = UNVERIFIED_PRESENTATION;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <PillButtonUI
          tone="white"
          size="xs"
          className="w-fit gap-1 font-sans !text-red-600 hover:!text-red-700"
        >
          <CircleAlert className="h-3 w-3" aria-hidden="true" />
          {presentation.label}
        </PillButtonUI>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[220] w-72"
      >
        <span className="block text-xs font-medium text-gray-900">
          Wortlaut an der Quelle prüfen
        </span>
        <span className="mt-1 block text-xs font-normal leading-5 text-gray-600">
          Für dieses Zitat fehlt ein bestätigter Textabgleich. Prüfen Sie den
          Wortlaut und die darauf gestützte Aussage im Originaldokument.
          Auch ein Texttreffer bestätigt nur den Wortlaut, nicht die Richtigkeit
          der daraus abgeleiteten Aussage.
        </span>
      </PopoverContent>
    </Popover>
  );
}
