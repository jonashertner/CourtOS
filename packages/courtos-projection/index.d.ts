/** Shared projection contract. Every field outside outbound_json is private. */
export type ReviewedTerm = { entity_id: string; revision: number; aliases: string[]; replacement: string; reviewed: boolean; reading?: true };
export type PrivateTransformationSpan = {
    entity_id: string; original_start: number; original_end: number;
    derivative_start: number; derivative_end: number; original: string; replacement: string;
};
/** Internal result before platform-specific hashing. Must never become a provider payload. */
export type TextTransformation = {
    text: string; original_text: string; map_json: string; spans: PrivateTransformationSpan[];
    requires_human_review: true; external_eligible: false;
};
export type PseudonymisedText = {
    text: string; original_sha256: string; derivative_sha256: string; map_sha256: string;
    spans: PrivateTransformationSpan[]; requires_human_review: true; external_eligible: false;
};
export class PseudonymisationError extends Error {
    readonly code: "invalid_mapping" | "unreviewed_mapping" | "ambiguous_mapping" | "ambiguous_occurrence" | "unsafe_text" | "text_too_large" | "remaining_registered_term";
    constructor(code: PseudonymisationError["code"]);
}
export function transformTextCore(text: string, terms: readonly ReviewedTerm[]): TextTransformation;
export function compileTextTransformation(terms: readonly ReviewedTerm[]): (text: string) => TextTransformation;
export function resolveDerivativeSpan(result: Pick<TextTransformation, "text" | "spans">, start: number, end: number): {
    original_start: number; original_end: number; wording: "pseudonymised_derivative" | "original_verbatim";
} | null;
export type PrivateExportInput = { original_key: string; kind: "source" | "working_note" | "conversation_excerpt"; text: string };
export type NeutralExportSection = { id: string; kind: PrivateExportInput["kind"]; text: string };
export type ProjectionCore = {
    question: string; sections: NeutralExportSection[]; outbound_json: string; map_json: string;
    private_question: TextTransformation;
    private_sections: Array<{ id: string; original_key: string; transformation: TextTransformation }>;
    requires_human_review: true;
};
export type ExportProjection = {
    question: string; sections: NeutralExportSection[]; outbound_json: string;
    outbound_sha256: string; map_sha256: string;
    private_question: PseudonymisedText;
    private_sections: Array<{ id: string; original_key: string; transformation: PseudonymisedText }>;
    requires_human_review: true;
};
export class ExportProjectionError extends Error {
    readonly code: "export_invalid_selection" | "export_too_large" | "export_unreadable_page" | "export_unsafe_text" | "export_replacement_collision" | "export_unreviewed_occurrence" | "export_ambiguous_occurrence";
    constructor(code: ExportProjectionError["code"]);
}
export function buildProjectionCore(question: string, selected: readonly PrivateExportInput[], terms: readonly ReviewedTerm[]): ProjectionCore;
/** V2 is explicit. Unversioned V1 packets are never silently reinterpreted. */
export type ProjectionSourceRole = "submission" | "claim" | "response" | "exhibit" | "authority" | "literature" | "other";
export type PrivateProjectionSource = {
    document_key: string; version_key: string; file_sha256: string;
    party_key: string | null; role: ProjectionSourceRole;
    page: number; page_sha256: string; start: number; end: number;
    extractor: "browser-pdfjs-text-v1" | "server-readPdfPages-v1" | "browser-pdfjs-tesseract-v1";
};
export type WorkingProjectionAttribution = {
    author: "party" | "user" | "model";
    status: "open" | "proposed" | "adopted" | "disputed" | "superseded";
};
export type ConversationProjectionAttribution = {
    speaker: "user" | "assistant"; status: "question" | "source_bound" | "unverified";
};
export type PrivateExportInputV2 = { original_key: string; text: string } & (
    { kind: "source"; source: PrivateProjectionSource }
    | { kind: "working_note"; attribution: WorkingProjectionAttribution }
    | { kind: "conversation_excerpt"; attribution: ConversationProjectionAttribution }
);
export type NeutralProjectionSource = {
    document: string; version: string; party: string | null; role: ProjectionSourceRole; page: number;
};
export type NeutralExportSectionV2 = { id: string; text: string } & (
    { kind: "source"; source: NeutralProjectionSource }
    | { kind: "working_note"; attribution: WorkingProjectionAttribution }
    | { kind: "conversation_excerpt"; attribution: ConversationProjectionAttribution }
);
export type PrivateProjectionSectionV2<T> = { id: string; original_key: string; transformation: T } & (
    { kind: "source"; source: PrivateProjectionSource }
    | { kind: "working_note"; attribution: WorkingProjectionAttribution }
    | { kind: "conversation_excerpt"; attribution: ConversationProjectionAttribution }
);
export type ProjectionCoreV2 = {
    version: 2; question: string; sections: NeutralExportSectionV2[]; outbound_json: string; map_json: string;
    private_question: TextTransformation; private_sections: PrivateProjectionSectionV2<TextTransformation>[];
    requires_human_review: true;
};
export type ExportProjectionV2 = {
    version: 2; question: string; sections: NeutralExportSectionV2[]; outbound_json: string;
    outbound_sha256: string; map_sha256: string; private_question: PseudonymisedText;
    private_sections: PrivateProjectionSectionV2<PseudonymisedText>[]; requires_human_review: true;
};
export function buildProjectionV2Core(question: string, selected: readonly PrivateExportInputV2[], terms: readonly ReviewedTerm[]): ProjectionCoreV2;
export function projectionMarkdown(projection: Pick<ProjectionCore | ProjectionCoreV2, "question" | "sections">): string;

export type ProjectionAnswerCitation = { section_id: string; exact_quote: string };
export type ProjectionAnswer = { claims: Array<{
    text: string; citations: ProjectionAnswerCitation[];
    /** Prior notes/dialogue can provide context, never primary evidence. */
    context_references?: ProjectionAnswerCitation[];
}> };
export type ProjectionBindingState = { matterId: string; matterRevision: number; outboundSha256: string; mapSha256: string };
export type ProjectionAnswerBindingInput = {
    answer: unknown; projection: ExportProjectionV2; question: string;
    /** Trusted selections and terms re-read from the expected private revision. */
    selected: readonly PrivateExportInputV2[]; terms: readonly ReviewedTerm[];
    expected: ProjectionBindingState; current: Pick<ProjectionBindingState, "matterId" | "matterRevision">;
};
export type BoundProjectionSourceCitation = {
    section_id: string; kind: "source"; derivative_quote: string;
    derivative_start: number; derivative_end: number;
    wording: "original_verbatim" | "pseudonymised_derivative";
    source_match: "exact"; original_bytes_revalidated: false;
    original: {
        document_key: string; version_key: string; file_sha256: string;
        page: number; page_sha256: string; extractor: PrivateProjectionSource["extractor"];
        start: number; end: number; quote: string;
    };
};
export type BoundProjectionContextCitation = {
    section_id: string; kind: "working_note" | "conversation_excerpt";
    derivative_quote: string; derivative_start: number; derivative_end: number;
    attribution: WorkingProjectionAttribution | ConversationProjectionAttribution;
    source_match: "exact"; use: "context_only";
};
/** Private result. Citation matching does not establish truth or entailment. */
export type BoundProjectionAnswer = {
    version: 1; projection_version: 2; matter_id: string; matter_revision: number;
    outbound_sha256: string; map_sha256: string;
    original_bytes_revalidated: false;
    claims: Array<{ text: string; citations: BoundProjectionSourceCitation[]; context_references: BoundProjectionContextCitation[];
        semantic_status: "ai_draft_requires_review" }>;
};
export class ProjectionAnswerBindingError extends Error {
    readonly code: "answer_schema" | "stale_state" | "projection_changed" | "private_mapping_changed" | "hash_mismatch" | "missing_section" | "quote_absent" | "quote_ambiguous" | "non_source_citation" | "source_in_context";
    constructor(code: ProjectionAnswerBindingError["code"]);
}
/** Private intermediate. Platform wrappers MUST validate every hash before releasing result. */
export function prepareProjectionV2AnswerBinding(input: ProjectionAnswerBindingInput): {
    result: BoundProjectionAnswer; hash_checks: Array<{ text: string; sha256: string }>;
    requires_hash_validation: true;
};
export type ProceduralRoleV3 = "claimant" | "respondent" | "appellant" | "appeal_respondent" | "applicant" | "authority" | "intervenor" | "other";
export type ReviewedPartyV3 = { id: string; handle: string; entity_id: string; entity_revision: number; procedural_role: ProceduralRoleV3; reviewed: true };
export type ProjectionDocumentV3 = {
    document_key: string; version_key: string; file_sha256: string; extractor: PrivateProjectionSource["extractor"];
    role: ProjectionSourceRole; party_id: string | null;
    pages: Array<{ page: number; text: string; page_sha256: string; selected: boolean;
        ocr?: { engine: "tesseract-7.0.0"; confidence: number; reviewed: boolean } }>;
};
export type PublicProjectionSourceV3 = { key: string; decision_id: string; content_hash: string | null; start: number; end: number; text: string; source_url: string | null; pdf_url: string | null };
export type ProjectionInputV3 = { question: string; documents: ProjectionDocumentV3[]; terms: ReviewedTerm[]; parties: ReviewedPartyV3[]; extras: Array<Exclude<PrivateExportInputV2, { kind: "source" }>>; public_sources?: PublicProjectionSourceV3[] };
export type ProjectionOccurrenceV3 = { id: string; section_key: string; entity_id: string; term_revision: number; start: number; end: number; original: string; replacement: string };
export type OccurrenceDecisionV3 = { id: string; decision: "approve" | "exclude" };
export type ProjectionCoverageV3 = { document: string; total_pages: number; selected_pages: number[]; excluded_pages: number[] } & (
    { extraction: "pdf_text_only"; ocr_performed: false } |
    { extraction: "pdf_text_with_ocr"; ocr_performed: true; ocr_pages: number[] });
export type ProjectionInspectionV3 = {
    terms: ReviewedTerm[]; parties: ReviewedPartyV3[]; map_json: string; occurrences: ProjectionOccurrenceV3[]; coverage: ProjectionCoverageV3[];
    sections: Array<{ key: string; kind: "question" | "source" | "working_note" | "conversation_excerpt"; text: string; source?: PrivateSourceV3; original_key?: string; attribution?: WorkingProjectionAttribution | ConversationProjectionAttribution }>;
};
export type PrivateSourceV3 = (PrivateProjectionSource & {format:"pdf"}) | {
    format:"public_decision"; document_key:string;version_key:string;role:"authority";party_key:null;start:number;end:number;
    original_authority: Omit<PublicProjectionSourceV3,"key"|"text"> & {kind:"opencaselaw"};
};
export type NeutralSourceV3 = (NeutralProjectionSource & {format:"pdf"}) | {format:"public_decision";document:string;version:string;party:null;role:"authority";start:number;end:number;complete_document:false};
export type SectionV3 = Exclude<NeutralExportSectionV2,{kind:"source"}> | {id:string;kind:"source";source:NeutralSourceV3;text:string};
export type PrivateSectionV3<T> = Exclude<PrivateProjectionSectionV2<T>,{kind:"source"}> | {id:string;kind:"source";original_key:string;source:PrivateSourceV3;transformation:T};
export type ProjectionCoreV3 = Omit<ProjectionCoreV2, "version"|"sections"|"private_sections"> & {
    version: 3; parties: Array<{ id: string; persona: string; procedural_role: ProceduralRoleV3 }>;
    coverage: ProjectionCoverageV3[]; private_occurrences: Array<ProjectionOccurrenceV3 & { decision: "approve" | "exclude" }>;
    sections:SectionV3[];private_sections:PrivateSectionV3<TextTransformation>[];
};
export type ExportProjectionV3 = Omit<ExportProjectionV2, "version"|"sections"|"private_sections"> & {
    version: 3; parties: ProjectionCoreV3["parties"]; coverage: ProjectionCoverageV3[]; private_occurrences: ProjectionCoreV3["private_occurrences"];
    sections:SectionV3[];private_sections:PrivateSectionV3<PseudonymisedText>[];
};
export const PROJECTION_V3_LIMITS: { documents: number; pages: number; text_bytes: number; packet_bytes: number; occurrences: number };
export function inspectProjectionV3(input: ProjectionInputV3): ProjectionInspectionV3;
export function buildProjectionV3Core(input: ProjectionInputV3, decisions: readonly OccurrenceDecisionV3[]): ProjectionCoreV3;

/** V3 input must come from the verified immutable local prepared copy. */
export type ProjectionAnswerBindingInputV3 = {
    answer: unknown; projection: ExportProjectionV3; preparation_input: ProjectionInputV3; decisions: readonly OccurrenceDecisionV3[];
    expected: ProjectionBindingState; current: Pick<ProjectionBindingState, "matterId" | "matterRevision">;
};
export type BoundProjectionSourceCitationV3 = Omit<BoundProjectionSourceCitation, "original"> & { original:
    (BoundProjectionSourceCitation["original"] & {format:"pdf"}) |
    {format:"public_decision";document_key:string;version_key:string;start:number;end:number;quote:string;
     original_authority: Extract<PrivateSourceV3,{format:"public_decision"}>["original_authority"]}
};
export type BoundProjectionAnswerV3 = Omit<BoundProjectionAnswer,"projection_version"|"claims"> & { projection_version:3;
    claims:Array<{id:string;text:string;citations:BoundProjectionSourceCitationV3[];context_references:BoundProjectionContextCitation[];semantic_status:"ai_draft_requires_review"}>
};
/** Does not verify original file bytes, live public-source text, truth or entailment. */
export function prepareProjectionV3AnswerBinding(input: ProjectionAnswerBindingInputV3): {
    result:BoundProjectionAnswerV3;hash_checks:Array<{text:string;sha256:string}>;requires_hash_validation:true;
};
