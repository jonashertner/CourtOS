import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfView } from "./PdfView";
const mock = vi.hoisted(() => ({ result: { type: "pdf", buffer: new ArrayBuffer(4) }, getDocument: vi.fn(), highlight: vi.fn(), resize: null as ResizeObserverCallback | null, failFirst: false }));
vi.mock("@/app/hooks/useFetchSingleDoc", () => ({ useFetchSingleDoc: () => ({ result: mock.result, loading: false, error: null }) }));
vi.mock("./highlightQuote", () => ({
    STANDARD_FONT_DATA_URL: "/standard_fonts/", clearHighlights: vi.fn(), highlightQuote: mock.highlight,
    getPdfJs: async () => ({ getDocument: mock.getDocument, TextLayer: class {
        static cleanup() {}
        textDivs: HTMLElement[] = [];
        constructor(private options: { textContentSource: ReadableStream<{ items: { str: string }[] }>; container: HTMLElement }) {}
        async render() {
            const reader = this.options.textContentSource.getReader();
            for (;;) { const result = await reader.read(); if (result.done) break; for (const item of result.value.items) {
                const span = document.createElement("span"); span.textContent = item.str; this.options.container.append(span); this.textDivs.push(span);
            } }
        }
    } }),
}));
let getPage: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.clearAllMocks(); mock.failFirst = false; mock.result = { type: "pdf", buffer: new ArrayBuffer(4) };
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { mock.resize = callback; } observe() {} disconnect() {} });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    getPage = vi.fn(async (number: number) => ({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: number === 1 && mock.failFirst ? Promise.reject(new Error("synthetic render failure")) : Promise.resolve(), cancel: vi.fn() }),
        streamTextContent: () => new ReadableStream({ start(controller) {
            controller.enqueue({ items: [{ str: number === 1 ? "First page text" : "Only page two contains this exact quotation", transform: [1, 0, 0, 10, 0, 10], width: 100, height: 10 }] }); controller.close();
        } }),
    }));
    mock.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), destroy: vi.fn().mockResolvedValue(undefined) });
    mock.highlight.mockImplementation(async (spans: HTMLElement[], quote: string) => spans.some(span => span.textContent?.includes(quote)));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("opens the requested real PDF page and retains it through zoom and resize", async () => {
    const user = userEvent.setup(); render(<PdfView doc={{ document_id: "d", version_id: "v" }} initialPage={2} />);
    await screen.findByText("2/2");
    expect(document.querySelectorAll("[data-pdf-page]")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Vergrössern" }));
    await screen.findByText("125%");
    await waitFor(() => expect(screen.getByText("2/2")).toBeVisible());
    await act(async () => { mock.resize?.([{ borderBoxSize: [{ inlineSize: 800 }], contentRect: { width: 800 } } as unknown as ResizeObserverEntry], {} as ResizeObserver); });
    await waitFor(() => expect(getPage.mock.calls.length).toBeGreaterThanOrEqual(9));
    expect(screen.getByText("2/2")).toBeVisible();
});
it.each([0, 3, 1.5])("rejects an unavailable initial page %s rather than showing another page", async initialPage => {
    render(<PdfView doc={{ document_id: "d", version_id: "v" }} initialPage={initialPage} />);
    expect(await screen.findByText("Die angegebene PDF-Seite ist in dieser Dokumentversion nicht vorhanden.")).toBeVisible();
    expect(getPage).not.toHaveBeenCalled();
    expect(document.querySelectorAll("[data-pdf-page]")).toHaveLength(0);
});
it("does not silently find a claimed page-one quotation on page two", async () => {
    render(<PdfView doc={{ document_id: "d" }} quotes={[{ page: 1, quote: "Only page two" }]} />);
    expect(await screen.findByText(/Wortlaut wurde auf der angegebenen PDF-Seite nicht gefunden/)).toBeVisible();
    expect(mock.highlight.mock.calls.every(([spans]) => (spans as HTMLElement[]).every(span => span.textContent === "First page text"))).toBe(true);
    expect(screen.getByText("1/2")).toBeVisible();
});
it("keeps original page numbers when a preceding page cannot render", async () => {
    mock.failFirst = true;
    render(<PdfView doc={{ document_id: "d" }} quotes={[{ page: 2, quote: "Only page two" }]} />);
    expect(await screen.findByText("PDF-Seite 1 konnte nicht dargestellt werden.")).toBeVisible();
    await screen.findByText("2/2");
    expect(mock.highlight).toHaveBeenCalled();
    expect(mock.highlight.mock.calls.at(-1)?.[0][0].textContent).toContain("Only page two");
    expect(document.querySelector('[data-pdf-page="2"]')).toHaveTextContent("Only page two");
});
it("clears an older rendered source before reporting an invalid new page", async () => {
    const view = render(<PdfView doc={{ document_id: "d" }} initialPage={2} />);
    await screen.findByText("2/2");
    view.rerender(<PdfView doc={{ document_id: "d" }} initialPage={3} />);
    await screen.findByText(/angegebene PDF-Seite ist/);
    expect(document.querySelectorAll("[data-pdf-page]")).toHaveLength(0);
});
