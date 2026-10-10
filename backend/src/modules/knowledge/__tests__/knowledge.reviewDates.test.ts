import { describe, expect, it } from "vitest";
import type { CaseReviewSource } from "@mike/contracts";
import { parseExplicitReviewDay, reviewDateOrder } from "../knowledge.reviewDates";

function order(date: string | null, text = `Die Partei nennt ${date} als Zahlungsdatum.`) {
  const claim = { quote: text, start: 0, end: Array.from(text).length } as CaseReviewSource;
  const start = date === null ? 0 : Array.from(text.slice(0,text.indexOf(date))).length;
  return reviewDateOrder(date === null ? null : { ...claim, quote: date, start, end: start + Array.from(date).length }, claim);
}
describe("conservative chronology dates", () => {
  it("parses explicit valid days across the four languages without changing their quote", () => {
    for (const value of ["2024-02-29","29.2.2024","29. Februar 2024","29 février 2024","29 febbraio 2024","29 February 2024","February 29, 2024"]) expect(parseExplicitReviewDay(value)).toBe("2024-02-29");
    expect(parseExplicitReviewDay("5. März 2026")).toBe("2026-03-05");
    expect(parseExplicitReviewDay("5 août 2026")).toBe("2026-08-05");
  });
  it("refuses calendar overflow, ambiguous conventions, incomplete dates and ranges", () => {
    for (const value of ["29.2.2023","31.4.2026","2026-13-01","00.1.2026","5/6/2026","2026","September 2026","circa 5. September 2026","5.–7. September 2026","5 September 2026 to 7 September 2026","next Tuesday"]) expect(parseExplicitReviewDay(value)).toBeNull();
  });
  it("does not turn a model's shortened quotation inside a qualifier or range into an exact day", () => {
    for (const text of ["Die Zahlung erfolgte ungefähr am 5. September 2026.","Die Zahlung erfolgte spätestens am 5. September 2026.","Payment occurred around 5. September 2026.","Le paiement a eu lieu vers le 5. September 2026.","Il pagamento è avvenuto entro il 5. September 2026.","Die Zahlung erfolgte 5. September 2026 bis 7. September 2026.","Die Zahlung erfolgte zwischen dem 3. und dem 5. September 2026."]) expect(order("5. September 2026",text)).toEqual({ date_sort:null, date_status:"ambiguous" });
  });
  it("distinguishes an undated claim from an ambiguous supplied date", () => {
    expect(order(null)).toEqual({date_sort:null,date_status:"undated"});
    expect(order("September 2026")).toEqual({date_sort:null,date_status:"ambiguous"});
    expect(order("5. September 2026","Die Partei bestreitet eine Zahlung am 5. September 2026.")).toEqual({date_sort:"2026-09-05",date_status:"exact_day"});
  });
});
