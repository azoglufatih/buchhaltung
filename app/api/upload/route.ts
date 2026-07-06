import { promises as fs } from "fs";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { readExpenses, UPLOAD_DIR, writeExpenses } from "@/app/lib/expenses";
import type { FileAttachment, UploadField } from "@/app/lib/types";

export const runtime = "nodejs";

const uploadFields = new Set<UploadField>(["invoiceFile", "cardStatementFile"]);
const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const formData = await request.formData();
  const rowId = String(formData.get("rowId") || "");
  const field = String(formData.get("field") || "") as UploadField;
  const slotIndex = clampInteger(formData.get("slotIndex"), 0, 99, 0);
  const paymentDate = sanitizePaymentDate(formData.get("paymentDate"));
  const file = formData.get("file");

  if (!rowId || !uploadFields.has(field)) {
    return NextResponse.json({ message: "Ungueltiges Upload-Ziel." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Keine PDF-Datei gefunden." }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "Nur PDF-Dateien sind erlaubt." }, { status: 415 });
  }

  const payload = await readExpenses();
  const row = payload.rows.find((entry) => entry.id === rowId);

  if (!row) {
    return NextResponse.json({ message: "Die Tabellenzeile wurde nicht gefunden." }, { status: 404 });
  }

  const rowDirName = sanitizeSegment(rowId);
  const uploadDir = path.join(UPLOAD_DIR, rowDirName);
  await fs.mkdir(uploadDir, { recursive: true });

  const originalName = sanitizeFilename(file.name);
  const storedName = `${field}-${Date.now()}-${originalName}`;
  const storedPath = path.join(uploadDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedInvoiceDate = field === "invoiceFile" ? await detectInvoiceDate(buffer, originalName) : null;
  const detectedInvoiceDateIso = detectedInvoiceDate?.toISOString();
  await fs.writeFile(storedPath, buffer);

  const attachment: FileAttachment = {
    name: originalName,
    path: `${rowDirName}/${storedName}`,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    ...(detectedInvoiceDateIso ? { invoiceDate: detectedInvoiceDateIso } : {}),
    ...(paymentDate
      ? { paymentDate }
      : detectedInvoiceDateIso
        ? { paymentDate: detectedInvoiceDateIso }
        : {})
  };

  const attachments = [...row[field]];
  attachments[slotIndex] = attachment;
  row[field] = attachments;
  await writeExpenses(payload);

  return NextResponse.json({ attachment, slotIndex });
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      rowId?: unknown;
      field?: unknown;
      slotIndex?: unknown;
    };
    const rowId = String(body.rowId || "");
    const field = String(body.field || "") as UploadField;
    const slotIndex = clampInteger(body.slotIndex, 0, 99, 0);

    if (!rowId || !uploadFields.has(field)) {
      return NextResponse.json({ message: "Ungueltiges Upload-Ziel." }, { status: 400 });
    }

    const payload = await readExpenses();
    const row = payload.rows.find((entry) => entry.id === rowId);

    if (!row) {
      return NextResponse.json({ message: "Die Tabellenzeile wurde nicht gefunden." }, { status: 404 });
    }

    const attachment = row[field][slotIndex];
    if (!attachment) {
      return NextResponse.json({ message: "Keine PDF-Datei in diesem Feld gefunden." }, { status: 404 });
    }

    const attachments = [...row[field]];
    attachments[slotIndex] = null;
    row[field] = attachments;
    await writeExpenses(payload);
    await removeStoredFile(attachment.path);

    return NextResponse.json({ slotIndex });
  } catch {
    return NextResponse.json(
      { message: "Die PDF-Datei konnte nicht entfernt werden." },
      { status: 400 }
    );
  }
}

async function removeStoredFile(attachmentPath: string) {
  const requestedPath = path.normalize(path.join(UPLOAD_DIR, attachmentPath));
  const uploadRoot = path.resolve(UPLOAD_DIR);

  if (!requestedPath.startsWith(`${uploadRoot}${path.sep}`)) {
    return;
  }

  await fs.rm(requestedPath, { force: true });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "row";
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned || "dokument"}.pdf`;
}

function sanitizePaymentDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function detectInvoiceDate(buffer: Buffer, filename: string) {
  const text = await extractPdfText(buffer, filename);
  return findInvoiceDate(text);
}

async function extractPdfText(buffer: Buffer, filename: string) {
  const extractedText = await extractPdfTextWithPdftotext(buffer, filename);
  if (extractedText.trim()) {
    return normalizeExtractedText(extractedText);
  }

  const raw = buffer.toString("latin1");
  const literalStrings = Array.from(raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/g))
    .map((match) => decodePdfLiteral(match[0].slice(1, -1)))
    .join(" ");
  const looseText = raw.replace(/[^\x20-\x7eäöüÄÖÜß€]+/g, " ");

  return normalizeExtractedText(`${literalStrings} ${looseText}`);
}

async function extractPdfTextWithPdftotext(buffer: Buffer, filename: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buchhaltung-upload-"));
  const tempPdfPath = path.join(tempDir, sanitizeFilename(filename));

  try {
    await fs.writeFile(tempPdfPath, buffer);

    for (const command of getPdftotextCommands()) {
      try {
        const { stdout } = await execFileAsync(command, ["-layout", tempPdfPath, "-"], {
          maxBuffer: 1024 * 1024 * 4
        });
        if (stdout.trim()) {
          return stdout;
        }
      } catch {
        // Try the next common install path, then fall back to byte-level extraction.
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return "";
}

function getPdftotextCommands() {
  return ["pdftotext", "/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"];
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, code: string) => {
      const replacements: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "(": "(",
        ")": ")",
        "\\": "\\"
      };
      return replacements[code] ?? code;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8))
    );
}

function findInvoiceDate(text: string) {
  const ddmmyyyy = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (ddmmyyyy) {
    const date = new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    if (isValidDate(date)) {
      return date;
    }
  }

  const yyyymmdd = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (yyyymmdd) {
    const date = new Date(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
    if (isValidDate(date)) {
      return date;
    }
  }

  const monthNameDate = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|januar|februar|maerz|märz|mai|juni|juli|oktober|dezember)\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (monthNameDate) {
    const date = new Date(
      Number(monthNameDate[3]),
      getMonthIndex(monthNameDate[1]),
      Number(monthNameDate[2])
    );
    if (isValidDate(date)) {
      return date;
    }
  }

  return null;
}

function getMonthIndex(value: string) {
  const monthsByName: Record<string, number> = {
    january: 0,
    januar: 0,
    february: 1,
    februar: 1,
    march: 2,
    maerz: 2,
    märz: 2,
    april: 3,
    may: 4,
    mai: 4,
    june: 5,
    juni: 5,
    july: 6,
    juli: 6,
    august: 7,
    september: 8,
    october: 9,
    oktober: 9,
    november: 10,
    december: 11,
    dezember: 11
  };

  return monthsByName[value.toLowerCase()] ?? 0;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2100;
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
