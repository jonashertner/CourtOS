import Link from "next/link";
import { KnowledgeWorkspace } from "@/app/components/courtos/KnowledgeWorkspace";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";
import { ResearchIntroduction } from "@/app/components/courtos/ResearchIntroduction";

export default function ResearchPage() {
    if (!COURTOS_KNOWLEDGE_ENABLED) return <div className="p-8"><h1 className="font-serif text-3xl">Recherche</h1><p className="mt-4">Die Recherche ist in dieser Installation nicht freigeschaltet.</p><Link className="courtos-link mt-5" href="/pilot">Zum Einstieg</Link></div>;
    return <ResearchIntroduction><KnowledgeWorkspace /></ResearchIntroduction>;
}
