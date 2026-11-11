import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Cover letter export: the assembled letter text (date, salutation, three
 * paragraphs, close) as DOCX or PDF. Blank lines separate blocks; a single
 * newline inside a block (the sign-off and name) is kept as a line break.
 */
const FONT = "Calibri";

function blocks(text: string): string[][] {
  return text.split(/\n\s*\n/).map((b) => b.split("\n"));
}

export async function renderLetterDocx(text: string, author: string): Promise<Uint8Array> {
  const children = blocks(text).map(
    (lines) =>
      new Paragraph({
        spacing: { after: 200 },
        children: lines.map((l, i) => new TextRun({ text: l, size: 22, font: FONT, break: i > 0 ? 1 : 0 })),
      }),
  );
  const doc = new Document({ creator: author, title: `${author} - Cover letter`, sections: [{ children }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 70.9; // 2.5cm

function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/—/g, "--")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export async function renderLetterPdf(text: string, author: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${author} - Cover letter`);
  doc.setAuthor(author);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10.5;
  const lineH = size * 1.45;
  const width = A4[0] - 2 * MARGIN;
  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const line = (t: string) => {
    if (y - lineH < MARGIN) {
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
    y -= lineH;
    page.drawText(t, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  };
  for (const block of blocks(text)) {
    for (const raw of block) {
      let cur = "";
      for (const w of winAnsi(raw).split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && cur) {
          line(cur);
          cur = w;
        } else cur = next;
      }
      line(cur);
    }
    y -= lineH * 0.6;
  }
  return doc.save();
}
