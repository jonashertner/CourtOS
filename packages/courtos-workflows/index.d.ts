export type WorkflowTask = "chronology" | "facts_evidence" | "legal_claims" | "party_comparison" | "source_chat" | "decision_draft" | "fundamental_questions" | "hypothetical_impact";
export const WORKFLOW_TASKS: readonly WorkflowTask[];
export type WorkflowCitation = { section_id: string; exact_quote: string };
export type WorkflowSourceContext = { source_id:string; start:number; end:number; text:string; quote_start:number; quote_end:number; clipped_before:boolean; clipped_after:boolean; semantic_support:"not_checked" };
export const MAX_SOURCE_CONTEXT_CHARACTERS: 2000;
/** Private display/export helper only. Caller validates original identity and
 * content first. Null means the intact quote itself exceeds the context limit.
 * This does not change quotations or establish semantic support. */
export function sourceQuoteContext(source:{id:string;text:string;start:number}, citation:{source_id:string;start:number;end:number;quote:string}):WorkflowSourceContext|null;
export type WorkflowClaim = { id: string; text: string; citations: WorkflowCitation[]; context_references?: WorkflowCitation[] };
export type WorkflowAssessmentTarget = { id: string; category: "fact" | "legal"; party: string; text: string; citations: WorkflowCitation[]; context_references: WorkflowCitation[] };
export const MAX_ASSESSMENT_TARGETS: 40;
export const MAX_ASSESSMENT_TARGET_BYTES: 131072;
export function validateAssessmentTargets(value: unknown, input: { task: WorkflowTask; sections: readonly WorkflowSection[] }): WorkflowAssessmentTarget[];
/** Exact message construction shared with the gateway; targets are data, never provider schema. */
export function workflowRequestMessages(packetJson: string, targets?: readonly WorkflowAssessmentTarget[]): Array<{role: "user"; content: string}>;
export function workflowPassageRequestMessages(request: {request_id: string; packet_json: string; task: WorkflowTask; language: string; max_output_tokens: number; assessment_targets?: readonly WorkflowAssessmentTarget[]}, sha256: (text: string) => Promise<string>): Promise<Array<{role: "user"; content: string}>>;
export type WorkflowPosture = "allegation" | "denial" | "disputed" | "unresolved";
export type WorkflowRows = {
  chronology: { id: string; event: string; party: string | null; posture: WorkflowPosture; date: string | null };
  facts_evidence: { id: string; target_id?: string; statement: string; party: string | null; posture: WorkflowPosture; evidence: string[]; opposing: string[]; assessment: "supports" | "contradicts" | "inconclusive" | "not_found"; reasoning: string };
  legal_claims: { id: string; target_id?: string; statement: string; party: string | null; authorities: string[]; assessment: "supports" | "contrary" | "insufficient" | "not_found_in_selected_sources" | "manual_check_required"; reasoning: string; manual_source: string | null };
  party_comparison: { id: string; category: "relief" | "fact" | "legal"; positions: { party: string | null; posture: WorkflowPosture; claim: string }[]; analysis: string };
  source_chat: { id: string; answer: string };
  decision_draft: { id: string; part: "facts" | "issue" | "reasoning" | "counterargument" | "open_issue" | "disposition"; claim: string; status: "alleged" | "disputed" | "working_assumption" | "analysis" | "proposal" };
  fundamental_questions: { id: string; question: string; analysis: string; contrary: string[] };
  hypothetical_impact: { id: string; baseline: string; assumption_id: string; analysis: string; limitations: string[] };
};
export type WorkflowCoverage = { source_inventory: { section_id: string; claim_ids: string[]; review: "reviewed" | "unresolved" }[]; all_claims_extracted: false; more_claims_reported: boolean; scope: "selected_sources_only" };
export type WorkflowResult = { [K in WorkflowTask]: { version: 1; task: K; claims: WorkflowClaim[]; rows: WorkflowRows[K][]; coverage: WorkflowCoverage } }[WorkflowTask];
export type WorkflowReadingRole = "party_position" | "statement" | "evidence" | "opposing_position" | "authority" | "manual_pointer" | "date" | "question" | "counterargument" | "baseline" | "limitation";
export type WorkflowReadingDependency = { row_id:string; claim_id:string; role:WorkflowReadingRole; party:string|null };
/** Direct same-row links only, for a previously validated result. Never adds
 * model citations, traverses another row or determines semantic support. */
export function workflowReadingDependencies(result:WorkflowResult,claimId:string):WorkflowReadingDependency[];
export type WorkflowSection = { id: string; kind: string; text: string; source?: { role: string; party: string | null; document: string; version: string }; attribution?: { author?: string; speaker?: string; status?: string } };
export class WorkflowResultError extends Error { readonly code: string; }
/** Checks exact quotations, row references, parties, source roles and reported coverage. Never proves semantic entailment. */
export function validateWorkflowResult(value: unknown, input: { task: WorkflowTask; sections: readonly WorkflowSection[]; assessment_targets?: readonly WorkflowAssessmentTarget[] }): WorkflowResult;
