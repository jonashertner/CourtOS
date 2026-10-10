import { notFound } from "next/navigation";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";
import { librarySourcePath } from "@/app/lib/sourceLinks";
import { LibrarySourceReader } from "@/app/components/courtos/LibrarySourceReader";

export default async function LibrarySourcePage({ params, searchParams }: {
    params: Promise<{ documentId: string; versionId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { documentId, versionId } = await params;
    const query = await searchParams;
    const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : NaN;
    if (!COURTOS_KNOWLEDGE_ENABLED || Object.keys(query).some(key => key !== "page") || !librarySourcePath(documentId, versionId, page)) notFound();
    return <LibrarySourceReader documentId={documentId} versionId={versionId} page={page} />;
}
