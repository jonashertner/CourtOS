import { z } from "zod";

export const CASE_REVIEW_LIMITS = { documents: 5, rows: 12, sourceTextBytes: 10_000, outputTokens: 2048, outputBytes: 24_000, referencesPerRow: 8 } as const;
const text = (max: number) => z.string().min(1).max(max).refine(value => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value));

// One contract is used both by the final validator and by constrained decoding.
// The model receives request-local passage handles, never authority to invent
// document/version identity, URLs, hashes or a verification status.
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

// Custom refinements (e.g. valid string scalars) and source/semantic checks are
// deliberately still enforced after generation. JSON Schema is a structural
// constraint, not proof that the model's claims are supported by a source.
const jsonSchema = z.toJSONSchema(caseReviewOutputSchema, { target: "draft-7", reused: "ref" });
const responseFormat = JSON.stringify({
  type: "json_schema",
  json_schema: { name: "courtos_case_review_v1", strict: true, schema: jsonSchema },
});

/** b11429 reads response_format.json_schema.schema and compiles its grammar.
 * https://github.com/ggml-org/llama.cpp/blob/b11429/tools/server/server-common.cpp#L1293
 * Return a fresh object so provider middleware cannot mutate the next request. */
export function caseReviewResponseFormat(): Record<string, unknown> {
  return JSON.parse(responseFormat) as Record<string, unknown>;
}
