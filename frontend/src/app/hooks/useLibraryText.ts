"use client";
import { useCallback } from "react";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { COURTOS_PILOT_MODE } from "@/app/lib/courtos";
import { formatCourtOSText, type CourtOSText } from "@/app/lib/courtosLocale";
/** Preserve the inherited application's English outside the CourtOS pilot. */
export function useLibraryText() {
    const {t}=useCourtOSLocale();
    return useCallback((message:CourtOSText,values?:Record<string,string|number>)=>COURTOS_PILOT_MODE?t(message,values):formatCourtOSText("en",message,values),[t]);
}
