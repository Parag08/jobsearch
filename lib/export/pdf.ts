import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ResolvedCv, ResolvedOrg } from "./resolve-cv";

/**
 * PDF from the same ResolvedCv as the DOCX. Standard Helvetica (no font files
 * to ship), A4, 2cm margins. Text wraps by measured width and flows onto a new
 * page rather than clipping; the editorial page fit is what keeps it to one.
 */
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56.7; // 2cm
const INK = rgb(0.1, 0.1, 0.1);
const SOFT = rgb(0.35, 0.35, 0.35);

/** Helvetica's WinAnsi encoding: map the common typographic characters, drop the rest. */
function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/—/g, "--")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

class Writer {
  private page: PDFPage;
  private y: number;
  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  gap(h: number) {
    this.y -= h;
  }

  /** Wrapped paragraph. indent shifts continuation lines too (bullets hang). */
  text(raw: string, opts: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; center?: boolean; prefix?: string }) {
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    const width = A4[0] - 2 * MARGIN - indent;
    const lineH = opts.size * 1.3;
    const words = winAnsi(raw).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, opts.size) > width && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => {
      this.ensure(lineH);
      this.y -= lineH;
      const w = font.widthOfTextAtSize(l, opts.size);
      const x = opts.center ? (A4[0] - w) / 2 : MARGIN + indent;
      if (i === 0 && opts.prefix) this.page.drawText(opts.prefix, { x: x - 9, y: this.y, size: opts.size, font, color: opts.color ?? INK });
      this.page.drawText(l, { x, y: this.y, size: opts.size, font, color: opts.color ?? INK });
    });
  }

  /** Left text with a right-aligned companion on the same line (role and dates). */
  split(left: string, right: string, size: number) {
    const lineH = size * 1.3;
    this.ensure(lineH);
    this.y -= lineH;
    this.page.drawText(winAnsi(left), { x: MARGIN, y: this.y, size, font: this.bold, color: INK });
    const r = winAnsi(right);
    this.page.drawText(r, { x: A4[0] - MARGIN - this.regular.widthOfTextAtSize(r, size), y: this.y, size, font: this.regular, color: SOFT });
  }

  heading(label: string) {
    this.ensure(30);
    this.gap(8);
    this.text(label.toUpperCase(), { size: 10, bold: true });
    this.y -= 3;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.6, color: SOFT });
    this.gap(2);
  }
}

function orgBlock(w: Writer, o: ResolvedOrg) {
  w.gap(4);
  w.text(o.org, { size: 10.5, bold: true });
  if (o.blurb) w.text(o.blurb, { size: 8.5, color: SOFT });
  for (const r of o.roles) {
    w.split(r.title, r.dates, 9.5);
    for (const b of r.bullets) w.text(b, { size: 9.5, indent: 12, prefix: "•" });
  }
}

export async function renderPdf(cv: ResolvedCv): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${cv.name} - CV`);
  doc.setAuthor(cv.name);
  doc.setCreator("JobSearch");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

  w.text(cv.name, { size: 18, bold: true, center: true });
  w.text(cv.contactLines.join("  |  "), { size: 8.5, center: true, color: SOFT });
  if (cv.summaryLine) {
    w.gap(6);
    w.text(cv.summaryLine, { size: 9.5 });
  }
  if (cv.experience.length) {
    w.heading("Experience");
    cv.experience.forEach((o) => orgBlock(w, o));
  }
  if (cv.education.length) {
    w.heading("Education");
    cv.education.forEach((o) => orgBlock(w, o));
  }
  if (cv.extras.length) {
    w.heading("Additional");
    for (const x of cv.extras) w.text(`${x.label}: ${x.text}`, { size: 9.5 });
  }
  return doc.save();
}
