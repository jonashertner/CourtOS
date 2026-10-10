import type { CaseReviewSource } from "@mike/contracts";

const months: Record<string, number> = {};
[
  "januar janvier gennaio january", "februar fevrier febbraio february",
  "marz mars marzo march", "april avril aprile", "mai maggio may",
  "juni juin giugno june", "juli juillet luglio july", "august aout agosto",
  "september septembre settembre", "oktober octobre ottobre october",
  "november novembre", "dezember decembre dicembre december",
].forEach((names, index) => names.split(" ").forEach(name => { months[name] = index + 1; }));

/** Intentionally does not use Date.parse: slash dates, partial dates, ranges and
 * approximate expressions must not acquire an invented precise day. */
export function parseExplicitReviewDay(quote: string): string | null {
  const value = quote.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  let year: number, month: number, day: number;
  let match: RegExpMatchArray | null;
  if ((match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    [, year, month, day] = match.map(Number);
  } else if ((match = value.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/))) {
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  } else if ((match = value.match(/^(\d{1,2})\.?\s+([a-z]+)\s+(\d{4})$/))) {
    day = Number(match[1]); month = months[match[2]]; year = Number(match[3]);
  } else if ((match = value.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/))) {
    month = months[match[1]]; day = Number(match[2]); year = Number(match[3]);
  } else return null;
  if (!Number.isInteger(month) || year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDay) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

export function reviewDateOrder(date: CaseReviewSource | null, claim: CaseReviewSource): {
  date_sort: string | null; date_status: "exact_day" | "ambiguous" | "undated";
} {
  if (!date) return { date_sort: null, date_status: "undated" };
  const characters = Array.from(claim.quote);
  const before = characters.slice(0, date.start - claim.start).join("").toLowerCase();
  const after = characters.slice(date.end - claim.start).join("").toLowerCase();
  // The model may quote only the day inside “around 5 September”. Look at the
  // primary quotation too, so removing that qualifier cannot manufacture precision.
  const qualified = /(?:\b(?:ca\.?|circa|zirka|ungefähr|etwa|gegen|um|vor|nach|seit|bis|spätestens|frühestens|zwischen|vers|environ|avant|après|depuis|jusqu['’]?au|entre|circa|verso|prima|dopo|entro|dal|tra|fra|about|approximately|around|before|after|since|until|between|by|from|or|oder|ou|oppure|und|and|et|e)\s+(?:(?:am|dem|den|le|il|al|the|on)\s+)?)$/u.test(before)
    || /(?:\d\s*[-–—]\s*|\b(?:bis|to|au|al)\s*)$/u.test(before)
    || /^\s*(?:[-–—]\s*\d|(?:bis|to|au|al|oder|or|ou|oppure)\s+\d)/u.test(after);
  const sort = qualified ? null : parseExplicitReviewDay(date.quote);
  return { date_sort: sort, date_status: sort ? "exact_day" : "ambiguous" };
}
