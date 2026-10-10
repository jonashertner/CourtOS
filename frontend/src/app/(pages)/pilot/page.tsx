import { redirect } from "next/navigation";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";

/** Preserve the historical entry URL; the working surface is the entry. */
export default function CourtOSPilotPage() {
    redirect(COURTOS_KNOWLEDGE_ENABLED ? "/research" : "/assistant");
}
