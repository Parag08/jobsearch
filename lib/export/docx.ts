import { AlignmentType, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { ResolvedCv, ResolvedOrg } from "./resolve-cv";

/**
 * DOCX for ATS upload (DESIGN §2): plain structure an ATS parses - real
 * headings, real bullet paragraphs, no tables or text boxes.
 */
const FONT = "Calibri";
const RIGHT_TAB = 10_000; // twips, the right margin of an A4 body at 2cm margins

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: "single", size: 6, color: "999999", space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, font: FONT })],
  });
}

function orgBlock(o: ResolvedOrg): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 120 },
      children: [new TextRun({ text: o.org, bold: true, size: 21, font: FONT })],
    }),
  ];
  if (o.blurb) out.push(new Paragraph({ children: [new TextRun({ text: o.blurb, italics: true, size: 18, font: FONT })] }));
  for (const r of o.roles) {
    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
        children: [
          new TextRun({ text: r.title, bold: true, size: 20, font: FONT }),
          new TextRun({ text: `\t${r.dates}`, size: 20, font: FONT }),
        ],
      }),
    );
    for (const b of r.bullets) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b, size: 20, font: FONT })] }));
    }
  }
  return out;
}

export async function renderDocx(cv: ResolvedCv): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cv.name, bold: true, size: 32, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: cv.contactLines.join("  |  "), size: 18, font: FONT })],
    }),
  ];
  if (cv.summaryLine) children.push(new Paragraph({ children: [new TextRun({ text: cv.summaryLine, size: 20, font: FONT })] }));
  if (cv.experience.length) children.push(heading("Experience"), ...cv.experience.flatMap(orgBlock));
  if (cv.education.length) children.push(heading("Education"), ...cv.education.flatMap(orgBlock));
  if (cv.extras.length) {
    children.push(heading("Additional"));
    for (const x of cv.extras) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${x.label}: `, bold: true, size: 20, font: FONT }),
            new TextRun({ text: x.text, size: 20, font: FONT }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    creator: cv.name,
    title: `${cv.name} - CV`,
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } }, children }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
