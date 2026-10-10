import { hasCheckedCitationLocation } from "./citationEvidence";
import type { PublicSourceSelection } from "@mike/contracts";
import type { Message, MessageFile } from "@/app/components/shared/types";

export type ResearchConversationSources = { files: MessageFile[]; public_sources: PublicSourceSelection[] };
export const emptyConversationSources = (): ResearchConversationSources => ({ files: [], public_sources: [] });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A descriptor is a request to read the original again, never evidence supplied by the browser. */
export function conversationSourceIssue(sources: ResearchConversationSources): "empty" | "many" | "unready" | null {
    if (!sources.files.length && !sources.public_sources.length) return "empty";
    if (sources.files.length > 5 || sources.public_sources.length > 3) return "many";
    if (sources.files.some(file => !UUID.test(file.document_id ?? "") || !UUID.test(file.version_id ?? "") || !/\.pdf$/i.test(file.filename))) return "unready";
    if (sources.public_sources.some(source => !/^[A-Za-z0-9][A-Za-z0-9_.:# -]{0,239}$/.test(source.decision_id) ||
        !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end) || source.start < 0 || source.start > 10_000_000 || source.end > 10_000_800 ||
        source.end - source.start < 20 || source.end - source.start > 800 ||
        source.content_hash !== null && (!source.content_hash || source.content_hash.length > 200))) return "unready";
    return null;
}

export function snapshotConversationSources(sources: ResearchConversationSources): ResearchConversationSources {
    return {
        files: sources.files.map(({ filename, document_id, version_id, version_number }) => ({ filename, document_id, version_id, version_number })),
        public_sources: sources.public_sources.map(({ decision_id, start, end, content_hash }) => ({ decision_id, start, end, content_hash })),
    };
}

/** Last explicit selection is the same contract used by server source admission. */
export function conversationSourcesFromHistory(messages: Message[]): ResearchConversationSources {
    const lastUser = [...messages].reverse().find(message => message.role === "user");
    return snapshotConversationSources({ files: lastUser?.files ?? [], public_sources: lastUser?.public_sources ?? [] });
}

/** Only the server's final release marker plus source checks admits answer text. */
export function canDisplaySourceAnswer(message: Message): boolean {
    return message.role === "assistant" && message.events?.some(event => event.type === "source_bound_answer" && event.version === 1) === true &&
        message.citationStatus === "final" && !!message.citations?.length && message.citations.every(hasCheckedCitationLocation);
}
