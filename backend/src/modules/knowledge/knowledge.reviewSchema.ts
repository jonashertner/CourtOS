import { z } from "zod";

const uuid = z.string().uuid();
const text = (max: number) => z.string().min(1).max(max).refine(value => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value));
export const CASE_REVIEW_LIMITS = { documents: 5, rows: 12, sourceTextBytes: 10_000, outputTokens: 2048, outputBytes: 24_000, referencesPerRow: 8 } as const;
export const caseReviewInputSchema = z.object({
  request_id: uuid,
  kind: z.enum(["facts", "legal", "chronology"]),
  language: z.enum(["de", "fr", "it", "en"]),
  sources: z.array(z.object({
    document_id: uuid, version_id: uuid,
    role: z.enum(["claim", "response", "exhibit", "authority", "other"]),
    party_label: text(80).nullable(),
  }).strict()).min(1).max(CASE_REVIEW_LIMITS.documents),
}).strict().refine(value => new Set(value.sources.map(source => source.document_id.toLowerCase())).size === value.sources.length);
export type ReviewInput = z.infer<typeof caseReviewInputSchema>;
export function parseCaseReviewInput(input: unknown): ReviewInput | null {
  const parsed = caseReviewInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

// The model receives only these request-local passage handles, never authority
// to invent document/version identity, a URL, a hash or a verification status.
const quotation = z.object({ p: text(20).regex(/^p[1-9][0-9]{0,3}$/), q: text(800) }).strict();
const row = z.object({
  category: z.enum(["fact", "legal"]), claim: quotation,
  posture: z.enum(["allegation", "denial", "document_statement", "legal_argument", "unresolved"]),
  date: quotation.nullable(), amounts: z.array(quotation).max(3),
  assessment: z.enum(["supports", "contradicts", "inconclusive", "not_found"]),
  reason: text(500), evidence: z.array(quotation).max(3),
  opposing: z.array(quotation).max(2), references: z.array(quotation).max(3),
}).strict().refine(value => value.evidence.length + value.opposing.length + value.references.length <= CASE_REVIEW_LIMITS.referencesPerRow);
export const caseReviewOutputSchema = z.object({ rows: z.array(row).max(CASE_REVIEW_LIMITS.rows), more_claims: z.boolean() }).strict();
export type ProposedReview = z.infer<typeof caseReviewOutputSchema>;
export type ProposedQuotation = z.infer<typeof quotation>;
