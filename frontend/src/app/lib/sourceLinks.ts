/** Durable references contain identity and position, never source text or storage credentials. */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PRIVATE_PATH = /^\/sources\/library\/([a-f0-9-]{36})\/([a-f0-9-]{36})\?page=([1-9][0-9]{0,4})$/i;
export type LibrarySourceTarget = { documentId: string; versionId: string; page: number };

export function librarySourcePath(documentId: string, versionId: string, page: number): string | null {
    if (!UUID.test(documentId) || !UUID.test(versionId) || !Number.isSafeInteger(page) || page < 1 || page > 99999) return null;
    return `/sources/library/${documentId}/${versionId}?page=${page}`;
}
export function parseLibrarySourcePath(path: string): LibrarySourceTarget | null {
    const match = PRIVATE_PATH.exec(path);
    if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return null;
    return { documentId: match[1], versionId: match[2], page: Number(match[3]) };
}
export function librarySourceUrl(origin: string, documentId: string, versionId: string, page: number): string | null {
    const path = librarySourcePath(documentId, versionId, page);
    if (!path) return null;
    try {
        const base = new URL(origin);
        if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.origin !== origin) return null;
        return new URL(path, base).href;
    } catch { return null; }
}

export type SourcePassage = { start: number; end: number; total_chars: number; text: string };
export type SelectedSourcePassage = SourcePassage;

/** Read only a user-selected, contiguous part of this rendered source, never other page content. */
export function selectedSourcePassage(element: HTMLElement | null, selection: Selection | null, passage: SourcePassage): SelectedSourcePassage | null {
    if (!element || !selection || selection.rangeCount !== 1 || selection.isCollapsed || element.textContent !== passage.text) return null;
    if (![passage.start, passage.end, passage.total_chars].every(Number.isSafeInteger) || passage.start < 0 || passage.end > passage.total_chars || passage.end - passage.start !== Array.from(passage.text).length) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
    const raw = range.toString();
    const text = raw.trim();
    const length = Array.from(text).length;
    if (length < 20 || length > 800) return null;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.startContainer, range.startOffset);
    const leading = raw.slice(0, raw.length - raw.trimStart().length);
    const offset = Array.from(prefix.toString() + leading).length;
    if (Array.from(passage.text).slice(offset, offset + length).join("") !== text) return null;
    return { start: passage.start + offset, end: passage.start + offset + length, total_chars: passage.total_chars, text };
}

/** A browser text search is an attempt to locate a quote, not a verified original anchor. */
export function originalTextSearchUrl(sourceUrl: string | null, pdfUrl: string | null, text: string): string | null {
    if (!sourceUrl || Array.from(text).length < 20 || Array.from(text).length > 800) return null;
    try {
        const url = new URL(sourceUrl);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /\.pdf$/i.test(url.pathname) || sourceUrl === pdfUrl) return null;
        // Preserve supplied element anchors; do not invent a page or Erwägung.
        const anchor = url.hash.split(":~:")[0];
        url.hash = `${anchor}:~:text=${encodeURIComponent(text).replace(/-/g, "%2D")}`;
        return url.href;
    } catch { return null; }
}
