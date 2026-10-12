"""Render the synthetic sample dossiers described in fixtures/samples/*.json.

Each JSON file describes one case folder: its pleadings, exhibits, an internal
note and a literature note, as blocks of text. This script typesets them as the
documents they pose as (a pleading, an agreement, a letter, an e-mail, an
invoice, a scanned note) so that the reader shows something that looks like a
real file. Every person, company, address and number in them is invented; each
page carries the dossier's banner saying so.

Run (from packages/courtos-local):
  uv run --with reportlab --with python-docx --with pillow \
    python fixtures/build_samples.py [fixtures/samples/<id>.json ...] [--out DIR]

Without file arguments every sample is built. Without --out each dossier is
written to fixtures/<folder>/, replacing what is there.

Spec (see the samples for complete examples):
  {
    "id": "sg-maschine", "folder": "HG.2026.112 Rheintal Präzision",
    "language": "de", "court": "Handelsgericht des Kantons St. Gallen",
    "banner": "Synthetisches Übungsdossier – alle Angaben fiktiv",
    "page_word": "Seite {n} von {total}",
    "documents": [
      {"path": "01 Klage ….pdf", "type": "pdf", "font": "sans" | "serif",
       "title": "Klage", "letterhead": {"name": "…", "lines": ["…"]},
       "blocks": [["h", "…"], ["p", "…"], ["rz", "Rz. 1", "…"], …]},
      {"path": "Beilagen/BB 7 Notiz Scan.pdf", "type": "scan", "blocks": […]},
      {"path": "Interne Notiz.docx", "type": "docx", "blocks": [["h", "…"], ["p", "…"]]},
      {"path": "Literatur/….md", "type": "md", "text": "…"}
    ],
    "planted": {"person": ["…"], "email": ["…"], …}
  }

Blocks for "pdf" and "scan":
  ["title", text]            centred document title
  ["h", text]                heading
  ["p", text]                paragraph (**bold** allowed)
  ["rz", label, text]        numbered paragraph with the label in the margin
  ["small", text]            small print
  ["right", text]            right-aligned line (place and date)
  ["address", [lines]]       recipient address in the window position
  ["kv", [[key, value], …]]  label/value lines (e-mail header, invoice data)
  ["quote", text]            indented, grey (quoted e-mail, cited clause)
  ["table", {"columns": […], "rows": [[…]], "widths": [fractions],
             "align": ["l"|"r"|"c", …], "foot": [[…]]}]
  ["sign", [lines]]          signature block with room to sign
  ["rule"]                   horizontal line
  ["space"]                  vertical space
  ["pagebreak"]
  ["drawing", {"width": mm, "height": mm, "frame": true, "items": [...]}]
                             a plan (site plan, elevation, sketch), drawn as vectors;
                             coordinates in mm from the drawing's lower left corner:
      ["line", x1, y1, x2, y2, opts]      ["rect", x, y, w, h, opts]
      ["poly", [[x, y], ...], opts]       closed polygon
      ["text", x, y, text, opts]          opts: size, bold, anchor l|c|r, angle
      ["dim", x1, y1, x2, y2, label, opts]  dimension line with ticks, label at its middle
      ["north", x, y]                     north arrow
    opts for lines and shapes: {"width": pt, "dash": true, "fill": "light"|"mid"|"dark"}
"""

import io
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)
from reportlab.platypus.flowables import Flowable, HRFlowable

HERE = Path(__file__).resolve().parent
GREY = colors.HexColor("#555555")
LIGHT = colors.HexColor("#9A9A9A")
FONTS = {
    "sans": ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique"),
    "serif": ("Times-Roman", "Times-Bold", "Times-Italic"),
}


def check_text(value, where):
    """The standard PDF fonts cover Windows-1252 only; anything else would print as a box."""
    try:
        value.encode("cp1252")
    except UnicodeEncodeError as error:
        bad = value[error.start:error.end]
        raise SystemExit(f"{where}: character {bad!r} cannot be set in the standard fonts")


def markup(text):
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(text))


def styles(font):
    regular, bold, italic = FONTS[font]
    size = 10.5 if font == "serif" else 10
    base = ParagraphStyle("p", fontName=regular, fontSize=size, leading=size * 1.42, spaceAfter=6)
    return {
        "p": base,
        "pj": ParagraphStyle("pj", parent=base, alignment=TA_JUSTIFY),
        "title": ParagraphStyle("title", parent=base, fontName=bold, fontSize=15, leading=19, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12),
        "h": ParagraphStyle("h", parent=base, fontName=bold, fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=5),
        "rz": ParagraphStyle("rz", parent=base, alignment=TA_JUSTIFY, leftIndent=17 * mm, bulletIndent=0, bulletFontName=bold, bulletFontSize=size - 0.5),
        "small": ParagraphStyle("small", parent=base, fontSize=7.8, leading=10, textColor=GREY),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
        "address": ParagraphStyle("address", parent=base, leftIndent=98 * mm, spaceBefore=6, spaceAfter=16),
        "quote": ParagraphStyle("quote", parent=base, leftIndent=8 * mm, textColor=GREY, fontSize=size - 0.5),
        "kvk": ParagraphStyle("kvk", parent=base, fontName=bold, fontSize=size - 1, leading=(size - 1) * 1.35, textColor=GREY, spaceAfter=0),
        "kvv": ParagraphStyle("kvv", parent=base, fontSize=size - 0.5, leading=(size - 0.5) * 1.35, spaceAfter=0),
        "cell": ParagraphStyle("cell", parent=base, fontSize=size - 1, leading=(size - 1) * 1.3, spaceAfter=0),
        "cellh": ParagraphStyle("cellh", parent=base, fontName=bold, fontSize=size - 1, leading=(size - 1) * 1.3, spaceAfter=0),
        "lh_name": ParagraphStyle("lh_name", parent=base, fontName=bold, fontSize=13.5, leading=17, spaceAfter=1),
        "lh_line": ParagraphStyle("lh_line", parent=base, fontSize=8, leading=10, textColor=GREY, spaceAfter=0),
    }


WIDTH = A4[0] - 40 * mm
FILLS = {"light": colors.HexColor("#E6E6E6"), "mid": colors.HexColor("#BDBDBD"), "dark": colors.HexColor("#7A7A7A")}


class Drawing(Flowable):
    """A plan drawn with vectors; its labels are real text, as in a CAD export."""

    def __init__(self, spec, font):
        super().__init__()
        self.spec, self.font = spec, font
        self.width = spec.get("width", WIDTH / mm) * mm
        self.height = spec["height"] * mm

    def wrap(self, *_):
        return self.width, self.height + 4 * mm

    def stroke(self, c, opts):
        c.setLineWidth(opts.get("width", 0.7))
        c.setDash(3, 2) if opts.get("dash") else c.setDash()
        c.setStrokeColor(colors.black)
        fill = FILLS.get(opts.get("fill"))
        if fill is not None:
            c.setFillColor(fill)
        return 1 if fill is not None else 0

    def draw(self):
        c, regular, bold = self.canv, FONTS[self.font][0], FONTS[self.font][1]
        at = lambda v: v * mm
        c.saveState()
        if self.spec.get("frame", True):
            c.setLineWidth(0.5)
            c.rect(0, 0, self.width, self.height)
        for item in self.spec["items"]:
            kind, args = item[0], item[1:]
            opts = args[-1] if args and isinstance(args[-1], dict) else {}
            if kind == "line":
                self.stroke(c, opts)
                c.line(*(at(v) for v in args[:4]))
            elif kind == "rect":
                fill = self.stroke(c, opts)
                c.rect(*(at(v) for v in args[:4]), stroke=1, fill=fill)
            elif kind == "poly":
                fill = self.stroke(c, opts)
                path = c.beginPath()
                points = args[0]
                path.moveTo(at(points[0][0]), at(points[0][1]))
                for x, y in points[1:]:
                    path.lineTo(at(x), at(y))
                path.close()
                c.drawPath(path, stroke=1, fill=fill)
            elif kind == "text":
                x, y, text = args[:3]
                c.saveState()
                c.setFillColor(colors.black)
                c.setFont(bold if opts.get("bold") else regular, opts.get("size", 7.5))
                c.translate(at(x), at(y))
                c.rotate(opts.get("angle", 0))
                {"l": c.drawString, "c": c.drawCentredString, "r": c.drawRightString}[opts.get("anchor", "l")](0, 0, text)
                c.restoreState()
            elif kind == "dim":
                x1, y1, x2, y2, label = args[:5]
                c.setLineWidth(0.35)
                c.setDash()
                c.setStrokeColor(colors.black)
                c.line(at(x1), at(y1), at(x2), at(y2))
                dx, dy = x2 - x1, y2 - y1
                length = (dx * dx + dy * dy) ** 0.5 or 1
                nx, ny = -dy / length * 1.5, dx / length * 1.5
                for x, y in ((x1, y1), (x2, y2)):
                    c.line(at(x - nx), at(y - ny), at(x + nx), at(y + ny))
                c.saveState()
                c.setFillColor(colors.black)
                c.setFont(regular, opts.get("size", 7))
                c.translate(at((x1 + x2) / 2 + nx * 0.9), at((y1 + y2) / 2 + ny * 0.9))
                angle = __import__("math").degrees(__import__("math").atan2(dy, dx))
                c.rotate(angle if -90 < angle <= 90 else angle - 180)
                c.drawCentredString(0, 0.6 * mm, label)
                c.restoreState()
            elif kind == "north":
                x, y = args[:2]
                c.setDash()
                c.setLineWidth(0.6)
                c.setFillColor(colors.black)
                path = c.beginPath()
                path.moveTo(at(x), at(y + 8))
                path.lineTo(at(x - 2.5), at(y))
                path.lineTo(at(x + 2.5), at(y))
                path.close()
                c.drawPath(path, stroke=1, fill=1)
                c.setFont(bold, 8)
                c.drawCentredString(at(x), at(y + 9.5), "N")
            else:
                raise SystemExit(f"drawing: unknown item {kind}")
        c.restoreState()


def flowables(doc, where):
    st = styles(doc.get("font", "sans"))
    pleading = doc.get("pleading", False)
    out = []
    head = doc.get("letterhead")
    if head:
        check_text(head["name"], where)
        out.append(Paragraph(markup(head["name"]), st["lh_name"]))
        for line in head.get("lines", []):
            check_text(line, where)
            out.append(Paragraph(markup(line), st["lh_line"]))
        out.append(HRFlowable(width="100%", thickness=0.6, color=LIGHT, spaceBefore=6, spaceAfter=14))
    for n, block in enumerate(doc["blocks"]):
        kind, args = block[0], block[1:]
        at = f"{where} block {n} ({kind})"
        for value in args:
            for text in (value if isinstance(value, list) else [value]):
                if isinstance(text, str):
                    check_text(text, at)
                elif isinstance(text, list):
                    for cell in text:
                        check_text(str(cell), at)
        if kind == "title":
            out.append(Paragraph(markup(args[0]), st["title"]))
        elif kind == "h":
            out.append(Paragraph(markup(args[0]), st["h"]))
        elif kind == "p":
            out.append(Paragraph(markup(args[0]), st["pj" if pleading else "p"]))
        elif kind == "rz":
            out.append(Paragraph(markup(args[1]), st["rz"], bulletText=args[0]))
        elif kind == "small":
            out.append(Paragraph(markup(args[0]), st["small"]))
        elif kind == "right":
            out.append(Paragraph(markup(args[0]), st["right"]))
        elif kind == "address":
            out.append(Paragraph("<br/>".join(markup(line) for line in args[0]), st["address"]))
        elif kind == "quote":
            out.append(Paragraph(markup(args[0]), st["quote"]))
        elif kind == "kv":
            rows = [[Paragraph(markup(k), st["kvk"]), Paragraph(markup(v), st["kvv"])] for k, v in args[0]]
            table = Table(rows, colWidths=[30 * mm, WIDTH - 30 * mm])
            table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                       ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
            out += [table, Spacer(1, 8)]
        elif kind == "table":
            spec = args[0]
            for row in spec.get("rows", []) + spec.get("foot", []) + [spec["columns"]]:
                for cell in row:
                    check_text(str(cell), at)
            align = spec.get("align") or ["l"] * len(spec["columns"])
            aligned = lambda style, a: ParagraphStyle(style.name + a, parent=style, alignment={"l": TA_LEFT, "r": TA_RIGHT, "c": TA_CENTER}[a])
            cell = lambda value, style, i: Paragraph(markup(str(value)), aligned(style, align[i]))
            rows = [[cell(v, st["cellh"], i) for i, v in enumerate(spec["columns"])]]
            rows += [[cell(v, st["cell"], i) for i, v in enumerate(row)] for row in spec.get("rows", [])]
            foot = spec.get("foot", [])
            rows += [[cell(v, st["cellh"], i) for i, v in enumerate(row)] for row in foot]
            widths = spec.get("widths") or [1 / len(spec["columns"])] * len(spec["columns"])
            table = Table(rows, colWidths=[w * WIDTH for w in widths], repeatRows=1)
            style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 0.6, GREY),
                     ("LINEBELOW", (0, 1), (-1, -1 - len(foot)), 0.25, LIGHT),
                     ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                     ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
            if foot:
                style.append(("LINEABOVE", (0, -len(foot)), (-1, -len(foot)), 0.6, GREY))
            table.setStyle(TableStyle(style))
            out += [Spacer(1, 4), table, Spacer(1, 10)]
        elif kind == "sign":
            lines = [Spacer(1, 22)] + [Paragraph(markup(line), st["p"] if i == 0 else st["lh_line"]) for i, line in enumerate(args[0])]
            out.append(KeepTogether(lines))
        elif kind == "rule":
            out.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT, spaceBefore=4, spaceAfter=8))
        elif kind == "space":
            out.append(Spacer(1, 12))
        elif kind == "pagebreak":
            out.append(PageBreak())
        elif kind == "drawing":
            for item in args[0]["items"]:
                for value in item[1:]:
                    if isinstance(value, str):
                        check_text(value, at)
            out += [Spacer(1, 4), Drawing(args[0], doc.get("font", "sans")), Spacer(1, 8)]
        else:
            raise SystemExit(f"{at}: unknown block")
    return out


def numbered_canvas(banner, page_word):
    class NumberedCanvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.setFont("Helvetica-Oblique", 7.5)
                self.setFillColor(GREY)
                self.drawString(20 * mm, A4[1] - 11 * mm, banner)
                if total > 1:
                    self.drawRightString(A4[0] - 20 * mm, 11 * mm, page_word.format(n=self._pageNumber, total=total))
                super().showPage()
            super().save()
    return NumberedCanvas


def render_pdf(path, doc, sample):
    path.parent.mkdir(parents=True, exist_ok=True)
    template = BaseDocTemplate(str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
                               title=doc.get("title", path.stem), author="CourtOS synthetic fixture")
    template.addPageTemplates([PageTemplate(frames=[Frame(20 * mm, 20 * mm, WIDTH, A4[1] - 40 * mm, id="body")])])
    template.build(flowables(doc, str(path.name)), canvasmaker=numbered_canvas(sample["banner"], sample["page_word"]))


def system_font():
    for candidate in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                      "C:/Windows/Fonts/arial.ttf"]:
        if Path(candidate).exists():
            return candidate
    return None


def render_scan(path, doc, sample):
    """A scanned paper: the text exists only as pixels, without a text layer."""
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.lib.utils import ImageReader
    path.parent.mkdir(parents=True, exist_ok=True)
    font_path = system_font()
    font = ImageFont.truetype(font_path, 33) if font_path else ImageFont.load_default()
    bold = ImageFont.truetype(font_path, 42) if font_path else font
    small = ImageFont.truetype(font_path, 25) if font_path else font
    width_px, height_px, margin = 1654, 2339, 150

    def wrap(text, face, limit):
        words, lines, line = text.split(), [], ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if face.getlength(candidate) > limit and line:
                lines.append(line)
                line = word
            else:
                line = candidate
        return lines + ([line] if line else [])

    pages, image, draw, y = [], None, None, 0

    def new_page():
        nonlocal image, draw, y
        image = Image.new("L", (width_px, height_px), 244)
        draw = ImageDraw.Draw(image)
        draw.text((margin, 70), sample["banner"], fill=90, font=small)
        pages.append(image)
        y = 170

    new_page()
    for n, block in enumerate(doc["blocks"]):
        kind = block[0]
        if kind == "pagebreak":
            new_page()
            continue
        text = block[2] if kind == "rz" else block[1]
        if isinstance(text, list):
            text = "\n".join(text) if all(isinstance(t, str) for t in text) else "\n".join(f"{k}: {v}" for k, v in text)
        check_text(text, f"{path.name} block {n}")
        if kind == "rz":
            text = f"{block[1]}  {text}"
        face = bold if kind in ("h", "title") else small if kind == "small" else font
        for paragraph in text.split("\n"):
            for line in wrap(paragraph, face, width_px - 2 * margin):
                if y > height_px - 200:
                    new_page()
                draw.text((margin, y), line, fill=28, font=face)
                y += 58 if face is bold else 48
        y += 26
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle(doc.get("title", path.stem))
    for i, page in enumerate(pages):
        page = page.rotate(0.5 - 0.35 * (i % 2), fillcolor=244, resample=Image.BICUBIC)
        buffer = io.BytesIO()
        page.save(buffer, format="PNG")
        buffer.seek(0)
        c.drawImage(ImageReader(buffer), 0, 0, width=A4[0], height=A4[1])
        c.showPage()
    c.save()


def render_docx(path, doc):
    from docx import Document
    path.parent.mkdir(parents=True, exist_ok=True)
    out = Document()
    for block in doc["blocks"]:
        if block[0] in ("h", "title"):
            out.add_heading(block[1], level=1 if block[0] == "title" else 2)
        else:
            out.add_paragraph(block[-1])
    out.save(str(path))


def build(spec_path, out_root=None):
    sample = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    root = Path(out_root or HERE) / sample["folder"]
    if root.exists():
        for old in sorted(root.rglob("*"), reverse=True):
            old.unlink() if old.is_file() else old.rmdir()
    root.mkdir(parents=True, exist_ok=True)
    for doc in sample["documents"]:
        path = root / doc["path"]
        kind = doc.get("type", "pdf")
        if kind == "pdf":
            render_pdf(path, doc, sample)
        elif kind == "scan":
            render_scan(path, doc, sample)
        elif kind == "docx":
            render_docx(path, doc)
        elif kind == "md":
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(doc["text"], encoding="utf-8")
        else:
            raise SystemExit(f"{doc['path']}: unknown type {kind}")
    print(f"{sample['folder']}: {len(sample['documents'])} documents")
    return root


if __name__ == "__main__":
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out")
        out = args[i + 1]
        del args[i:i + 2]
    for spec in args or sorted(str(p) for p in (HERE / "samples").glob("*.json")):
        build(spec, out)
