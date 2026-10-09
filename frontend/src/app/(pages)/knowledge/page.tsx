import Link from "next/link";
import { KnowledgeWorkspace } from "@/app/components/courtos/KnowledgeWorkspace";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";

export default function KnowledgePage() {
    if (!COURTOS_KNOWLEDGE_ENABLED) return <div className="p-8"><h1 className="font-serif text-3xl">Wissensbasis</h1><p className="mt-4">Diese Funktion ist in diesem Pilot noch nicht freigeschaltet.</p><Link className="mt-5 inline-block underline" href="/pilot">Zum Einstieg</Link></div>;
    return <KnowledgeWorkspace />;
}
