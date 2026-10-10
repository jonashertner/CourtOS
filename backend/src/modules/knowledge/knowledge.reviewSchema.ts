import { z } from "zod";
import { CASE_REVIEW_LIMITS } from "../../lib/courtosCaseReviewOutput";
export { CASE_REVIEW_LIMITS, caseReviewOutputSchema, type ProposedReview, type ProposedQuotation } from "../../lib/courtosCaseReviewOutput";

const uuid = z.string().uuid();
const text = (max: number) => z.string().min(1).max(max).refine(value => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value));
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
