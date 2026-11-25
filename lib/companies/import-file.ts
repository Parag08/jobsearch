import { Unzip, UnzipInflate, zipSync } from "fflate";
import { read, utils, type CellObject } from "xlsx";
import { IMPORT_MAX_BYTES, type ImportCell, type ImportSheet } from "./import-review";

const MAX_DATAPOINTS = 200_000;
const MAX_UNPACKED_BYTES = 24_000_000;
const splitFile = "This file is too large to read safely. Split it into smaller files and try again.";

export function checkCompanyFile(name: string, bytes: number) {
  if (/\.xls$/i.test(name)) throw new Error("To import an .xls file, use Save As .xlsx in Excel and try again.");
  if (!/\.(csv|xlsx)$/i.test(name)) throw new Error("Choose a CSV or XLSX file.");
  if (bytes > IMPORT_MAX_BYTES) throw new Error("This file is over 5 MB. Split it into smaller files and try again.");
  if (!bytes) throw new Error("This file is empty. Add company rows and try again.");
}

export function parseCompanyFile(name: string, bytes: Uint8Array): ImportSheet[] {
  checkCompanyFile(name, bytes.length);
  const sheets = /\.csv$/i.test(name) ? [parseCsv(bytes)] : parseWorkbook(bytes);
  if (!sheets.some((s) => s.rows.length)) throw new Error("This file is empty. Add company rows and try again.");
  return sheets;
}

function csv(text: string, separator: string, sample = false) {
  const rows: ImportSheet["rows"] = [];
  const widths: number[] = [];
  let cells: Record<number, ImportCell> = {};
  let column = 0, line = 1, start = 1, count = 0;
  let state: "plain" | "quoted" | "closed" = "plain";
  let field = "";
  const cell = () => {
    if (++count > MAX_DATAPOINTS || column >= 16_384) throw new Error(splitFile);
    if (field.trim()) cells[column] = { text: field };
    column++;
    field = "";
    state = "plain";
  };
  const row = () => {
    cell();
    if (Object.keys(cells).length) {
      rows.push({ number: start, cells });
      if (sample) widths.push(column);
    }
    column = 0;
    cells = {};
  };
  for (let i = 0; i < text.length && (!sample || rows.length < 8); i++) {
    const char = text[i];
    if (char === "\n" || char === "\r") {
      const newline = char === "\r" && text[i + 1] === "\n" ? char + text[++i] : char;
      if (state === "quoted") {
        field += newline;
        line++;
      } else {
        row();
        start = ++line;
      }
    } else if (state === "quoted") {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += char; i++; }
      else state = "closed";
    } else if (char === separator) cell();
    else if (char === '"' && !field && state === "plain") state = "quoted";
    else if (state === "closed" || char === '"') throw new Error("This CSV has invalid quoting. Export it as UTF-8 CSV and try again.");
    else field += char;
  }
  if (state === "quoted") throw new Error("This CSV has an unfinished quoted field. Re-export it and try again.");
  if (column || field || state === "closed") row();
  return { rows, widths };
}

function parseCsv(bytes: Uint8Array): ImportSheet {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (content.includes("\u0000")) throw new Error();
  } catch {
    throw new Error("This CSV is unreadable. Export it as UTF-8 CSV and try again.");
  }
  let separator = ",", bestAgreement = 0, bestWidth = 1;
  for (const candidate of [",", ";", "\t", "|"]) {
    try {
      const { widths } = csv(content, candidate, true);
      for (const width of widths) {
        if (width < 2) continue;
        const agreement = widths.filter((n) => n === width).length / widths.length;
        if (agreement > bestAgreement || (agreement === bestAgreement && width > bestWidth)) {
          separator = candidate;
          bestAgreement = agreement;
          bestWidth = width;
        }
      }
    } catch {
      // A quoted field may only be valid with the actual separator.
    }
  }
  return { name: "CSV", rows: csv(content, separator).rows };
}

function boundedWorkbook(bytes: Uint8Array) {
  const parts: Record<string, Uint8Array> = Object.create(null);
  let total = 0, files = 0;
  const unzip = new Unzip((file) => {
    if (++files > 1_000) throw new Error(splitFile);
    if (file.name.endsWith("/")) return;
    if (Object.hasOwn(parts, file.name) || !/^[\w[\]. /()-]+$/.test(file.name)) throw new Error("Invalid workbook entries");
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, done) => {
      if (error) throw error;
      total += chunk.length;
      size += chunk.length;
      if (total > MAX_UNPACKED_BYTES) throw new Error(splitFile);
      chunks.push(chunk);
      if (done) {
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
        parts[file.name] = bytes;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let i = 0; i < bytes.length; i += 8_192) unzip.push(bytes.subarray(i, i + 8_192), i + 8_192 >= bytes.length);
  if (!parts["xl/workbook.xml"] || !parts["[Content_Types].xml"]) throw new Error("No workbook");
  return zipSync(parts, { level: 0 });
}

function parseWorkbook(bytes: Uint8Array): ImportSheet[] {
  try {
    const book = read(boundedWorkbook(bytes), { type: "array", cellFormula: true, cellHTML: false, cellText: false });
    let count = 0;
    const sheets = book.SheetNames.flatMap((name, index): ImportSheet[] => {
      if (book.Workbook?.Sheets?.[index]?.Hidden) return [];
      const sheet = book.Sheets[name];
      const rows = new Map<number, Record<number, ImportCell>>();
      for (const address of Object.keys(sheet)) {
        if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address)) continue;
        if (++count > MAX_DATAPOINTS) throw new Error(splitFile);
        const cell = sheet[address] as CellObject;
        const formula = cell.f !== undefined || cell.F !== undefined;
        const text = formula ? "" : String(cell.v ?? "");
        if (!formula && !text.trim()) continue;
        const { r, c } = utils.decode_cell(address);
        const cells = rows.get(r + 1) ?? {};
        cells[c] = formula ? { text, formula: true } : { text };
        rows.set(r + 1, cells);
      }
      return [{ name, rows: Array.from(rows, ([number, cells]) => ({ number, cells })).sort((a, b) => a.number - b.number) }];
    });
    if (!sheets.length) throw new Error("No visible worksheets");
    return sheets;
  } catch (error) {
    if (error instanceof Error && error.message === splitFile) throw error;
    throw new Error("This workbook is unreadable or locked. Open it in Excel, save an unlocked .xlsx copy and try again.");
  }
}
