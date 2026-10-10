import { describe, expect, it } from "vitest";
import { caseReviewOutputSchema, caseReviewResponseFormat } from "./courtosCaseReviewOutput";

const quote = { p: "p1", q: "Eine eindeutige Aussage aus der ausgewählten Quelle." };
const valid = { rows: [{ category: "fact", claim: quote, posture: "allegation", date: null, amounts: [], assessment: "not_found", reason: "Kein ausgewählter unabhängiger Beleg.", evidence: [], opposing: [], references: [] }], more_claims: false };

describe("shared constrained review contract", () => {
  it("requires each row field, limits collections and leaves no open metadata surface", () => {
    const format = caseReviewResponseFormat() as { json_schema: { strict: boolean; schema: Record<string, any> } };
    const schema = format.json_schema.schema;
    expect(format.json_schema.strict).toBe(true);
    expect(schema).toMatchObject({ type: "object", additionalProperties: false, required: ["rows", "more_claims"] });
    expect(schema.properties.rows.maxItems).toBe(12);
    const resolve = (value: Record<string, any>): Record<string, any> => value.$ref ? schema.definitions[(value.$ref as string).split("/").at(-1)!] : value;
    const row = resolve(schema.properties.rows.items);
    expect(row.additionalProperties).toBe(false);
    expect(row.required).toEqual(Object.keys(valid.rows[0]));
    expect(resolve(row.properties.posture).enum).toEqual(["allegation", "denial", "document_statement", "legal_argument", "unresolved"]);
    expect(resolve(row.properties.reason)).toMatchObject({ type: "string", minLength: 1, maxLength: 500 });
    expect(resolve(row.properties.evidence).maxItems).toBe(3);
    expect(resolve(row.properties.opposing).maxItems).toBe(2);
    const ref = row.properties.claim.$ref as string;
    expect(ref).toMatch(/^#\/definitions\//);
    const quotation = schema.definitions[ref.split("/").at(-1)!];
    expect(quotation).toMatchObject({ additionalProperties: false, required: ["p", "q"], properties: { p: { pattern: "^p[1-9][0-9]{0,3}$" }, q: { minLength: 1, maxLength: 800 } } });
    expect(resolve(row.properties.date).anyOf).toContainEqual({ type: "null" });
  });
  it("retains strict post-generation validation, including refinements not expressible as JSON Schema", () => {
    expect(caseReviewOutputSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, invented: true },
      { ...valid, rows: [{ ...valid.rows[0], source_url: "https://example.test/" }] },
      { ...valid, rows: [{ ...valid.rows[0], posture: "established_fact" }] },
      { ...valid, rows: [{ ...valid.rows[0], date: undefined }] },
      { ...valid, rows: [{ ...valid.rows[0], claim: { ...quote, q: "bad\0text" } }] },
      { ...valid, rows: [{ ...valid.rows[0], reason: "bad\ud800text" }] },
    ]) expect(caseReviewOutputSchema.safeParse(invalid).success).toBe(false);
  });
  it("a caller cannot weaken the next request by mutating its returned schema", () => {
    const first = caseReviewResponseFormat();
    (first.json_schema as { schema: unknown }).schema = { type: "object" };
    expect(caseReviewResponseFormat()).not.toEqual(first);
  });
});
