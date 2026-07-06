import { promises as fs } from "fs";
import { execFile } from "child_process";
import crypto from "crypto";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { readExpenses, UPLOAD_DIR, writeExpenses } from "@/app/lib/expenses";
import { recordActivity } from "@/app/lib/activity-log";
import {
  analyzeInvoiceWithLocalVision,
  InvoiceVisionError
} from "@/app/lib/local-invoice-vision";
import type { ExpenseRow, FileAttachment, Interval } from "@/app/lib/types";

export const runtime = "nodejs";

type ClassificationOverride = "monthly" | "oneTime";
type InvoiceClassification = "monthly" | "oneTime" | "uncertain";
type SplitMode = "combined" | "separate";

type InvoiceLineItem = {
  description: string;
  asin?: string;
  grossCents: number;
  netCents: number;
  vatRate: number;
  category: string;
};

type ParsedInvoice = {
  invoiceId: string | null;
  invoiceDate: Date;
  vendor: string;
  service: string;
  description: string;
  subscriptionKey: string;
  serviceKey: string;
  vatRate: number;
  grossCents: number;
  netCents: number;
  category: string;
  classification: InvoiceClassification;
  lineItems: InvoiceLineItem[];
};

const knownVatRates = [0.2, 0.13, 0.1, 0];
const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const classificationOverride = parseClassificationOverride(formData.get("classificationOverride"));
  const splitMode = parseSplitMode(formData.get("splitMode"));

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Keine PDF-Rechnung gefunden." }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "Nur PDF-Rechnungen sind erlaubt." }, { status: 415 });
  }

  const payload = await readExpenses();
  const buffer = Buffer.from(await file.arrayBuffer());
  const originalName = sanitizeFilename(file.name);
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const scanId = crypto.randomUUID();
  await recordActivity({
    level: "info",
    source: "scanner",
    scanId,
    message: "Rechnungsscan gestartet.",
    details: { filename: originalName, bytes: buffer.length }
  });
  let visionInvoice;
  try {
    visionInvoice = await analyzeInvoiceWithLocalVision(buffer, originalName, scanId);
  } catch (error) {
    await recordActivity({
      level: "error",
      source: "scanner",
      scanId,
      message: "Rechnungsscan fehlgeschlagen.",
      details: { error: error instanceof Error ? error.message : "Unbekannter Fehler" }
    });
    if (error instanceof InvoiceVisionError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }

  const classification = classificationOverride
    ? classificationOverride === "monthly"
      ? "monthly"
      : "oneTime"
    : visionInvoice.classification;
  const parsedInvoice: ParsedInvoice = {
    ...visionInvoice,
    classification,
    subscriptionKey: normalizeSubscriptionKey(`${visionInvoice.vendor} ${visionInvoice.service}`),
    serviceKey: normalizeSubscriptionKey(visionInvoice.service)
  };
  const duplicateRow = findDuplicateInvoiceRow(
    payload.rows,
    parsedInvoice.invoiceId,
    fileHash
  );

  if (duplicateRow) {
    await recordActivity({
      level: "warning",
      source: "storage",
      scanId,
      message: "Rechnung wurde als Duplikat erkannt.",
      details: { rowId: duplicateRow.id, description: duplicateRow.description }
    });
    return NextResponse.json({
      status: "duplicate",
      row: duplicateRow,
      message: "Diese Rechnung ist bereits bei dieser Position hinterlegt."
    });
  }

  const existingRow = findMatchingSubscriptionRow(payload.rows, parsedInvoice);

  const shouldSuggestLineItemSplit =
    !existingRow && parsedInvoice.lineItems.length > 1 && splitMode === null;

  if (!existingRow && (parsedInvoice.classification === "uncertain" || shouldSuggestLineItemSplit)) {
    await recordActivity({
      level: "warning",
      source: "scanner",
      scanId,
      message: "Benutzerbestaetigung erforderlich.",
      details: {
        classification: parsedInvoice.classification,
        suggestedLineItems: parsedInvoice.lineItems.length
      }
    });
    return NextResponse.json({
      status: "needsConfirmation",
      draft: buildInvoiceDraft(parsedInvoice)
    });
  }

  if (!existingRow && splitMode === "separate" && parsedInvoice.lineItems.length > 1) {
    const createdRows: ExpenseRow[] = [];

    for (const [index, lineItem] of parsedInvoice.lineItems.entries()) {
      const targetRow = buildRowFromInvoiceLineItem(parsedInvoice, lineItem, index);
      payload.rows.push(targetRow);

      const attachment = await saveInvoiceAttachment({
        buffer,
        file,
        fileHash,
        originalName,
        parsedInvoice: {
          invoiceDate: parsedInvoice.invoiceDate,
          invoiceId: parsedInvoice.invoiceId,
          grossCents: lineItem.grossCents,
          netCents: lineItem.netCents,
          vatRate: lineItem.vatRate
        },
        rowId: targetRow.id
      });
      targetRow.invoiceFile = appendAttachment(targetRow.invoiceFile, attachment);
      createdRows.push(targetRow);
    }

    const savedPayload = await writeExpenses(payload);
    const savedRows = createdRows.map(
      (createdRow) => savedPayload.rows.find((row) => row.id === createdRow.id) ?? createdRow
    );

    await recordActivity({
      level: "success",
      source: "storage",
      scanId,
      message: `${savedRows.length} Rechnungspositionen wurden gespeichert.`,
      details: { rows: savedRows.length, invoiceId: parsedInvoice.invoiceId }
    });

    return NextResponse.json({
      status: "createdMany",
      rows: savedRows
    });
  }

  const targetRow = existingRow ?? buildRowFromInvoice(parsedInvoice);
  if (!existingRow) {
    payload.rows.push(targetRow);
  }
  if (parsedInvoice.invoiceId) {
    targetRow.invoiceNumber = parsedInvoice.invoiceId;
  }

  const attachment = await saveInvoiceAttachment({
    buffer,
    file,
    fileHash,
    originalName,
    parsedInvoice,
    rowId: targetRow.id
  });
  targetRow.invoiceFile = appendAttachment(targetRow.invoiceFile, attachment);

  const savedPayload = await writeExpenses(payload);
  const savedRow = savedPayload.rows.find((row) => row.id === targetRow.id) ?? targetRow;

  await recordActivity({
    level: "success",
    source: "storage",
    scanId,
    message: existingRow
      ? "Rechnung wurde einer vorhandenen Position zugeordnet."
      : "Neue Rechnungsposition wurde gespeichert.",
    details: {
      rowId: savedRow.id,
      description: savedRow.description,
      invoiceId: parsedInvoice.invoiceId,
      result: existingRow ? "attached" : "created"
    }
  });

  return NextResponse.json({
    status: existingRow ? "attached" : "created",
    row: savedRow
  });
}

function parseClassificationOverride(value: FormDataEntryValue | null): ClassificationOverride | null {
  return value === "monthly" || value === "oneTime" ? value : null;
}

function parseSplitMode(value: FormDataEntryValue | null): SplitMode | null {
  return value === "combined" || value === "separate" ? value : null;
}

function parseInvoice(
  filename: string,
  text: string,
  classificationOverride: ClassificationOverride | null
): ParsedInvoice {
  const invoiceDate = findInvoiceDate(text) ?? new Date();
  const vatRate = findVatRate(text);
  const grossCents = findGrossCents(text);
  const netCents = Math.round(grossCents / (1 + vatRate));
  const vendor = findVendor(text) ?? cleanFilename(filename);
  const service = findService(text) ?? cleanFilename(filename);
  const description = service || vendor || cleanFilename(filename);
  const classification = classificationOverride
    ? classificationOverride === "monthly"
      ? "monthly"
      : "oneTime"
    : classifyInvoice(text, service);
  const lineItems = findInvoiceLineItems(text, {
    vendor,
    invoiceGrossCents: grossCents,
    vatRate
  });

  return {
    invoiceId: findInvoiceId(text),
    invoiceDate,
    vendor,
    service,
    description,
    subscriptionKey: normalizeSubscriptionKey(`${vendor} ${service}`),
    serviceKey: normalizeSubscriptionKey(service),
    vatRate,
    grossCents,
    netCents,
    category: inferCategory(`${vendor} ${service} ${text}`),
    classification,
    lineItems
  };
}

function buildRowFromInvoice(invoice: ParsedInvoice): ExpenseRow {
  const isMonthly = invoice.classification === "monthly";
  const interval: Interval = isMonthly ? "Monatlich" : "Einmalig";
  const name = invoice.service || invoice.vendor;

  return {
    id: `exp-invoice-${Date.now()}`,
    year: String(invoice.invoiceDate.getFullYear()),
    costType: isMonthly ? "Fix" : "Variabel",
    interval,
    category: invoice.category,
    name,
    description: getDistinctDescription(name, invoice.description),
    invoiceNumber: invoice.invoiceId || "",
    startMonth: invoice.invoiceDate.getMonth() + 1,
    paymentsPerYear: isMonthly ? 12 : 1,
    vatRate: invoice.vatRate,
    grossCents: invoice.grossCents,
    netCents: invoice.netCents,
    amountInputType: "gross",
    subscriptionKey: invoice.subscriptionKey || invoice.serviceKey,
    invoiceFile: [],
    cardStatementFile: []
  };
}

function buildRowFromInvoiceLineItem(
  invoice: ParsedInvoice,
  lineItem: InvoiceLineItem,
  index: number
): ExpenseRow {
  const name = lineItem.description;
  const description = lineItem.asin ? `ASIN ${lineItem.asin}` : "";

  return {
    id: `exp-invoice-${Date.now()}-${index + 1}`,
    year: String(invoice.invoiceDate.getFullYear()),
    costType: "Variabel",
    interval: "Einmalig",
    category: lineItem.category,
    name,
    description,
    invoiceNumber: invoice.invoiceId || "",
    startMonth: invoice.invoiceDate.getMonth() + 1,
    paymentsPerYear: 1,
    vatRate: lineItem.vatRate,
    grossCents: lineItem.grossCents,
    netCents: lineItem.netCents,
    amountInputType: "gross",
    subscriptionKey: normalizeSubscriptionKey(`${invoice.vendor} ${name}`),
    invoiceFile: [],
    cardStatementFile: []
  };
}

function getDistinctDescription(name: string, description: string) {
  const trimmedDescription = description.trim();

  if (normalizeSubscriptionKey(name) === normalizeSubscriptionKey(trimmedDescription)) {
    return "";
  }

  return trimmedDescription;
}

function buildInvoiceDraft(invoice: ParsedInvoice) {
  return {
    invoiceId: invoice.invoiceId,
    invoiceDate: invoice.invoiceDate.toISOString(),
    vendor: invoice.vendor,
    service: invoice.service,
    description: invoice.description,
    category: invoice.category,
    grossCents: invoice.grossCents,
    netCents: invoice.netCents,
    vatRate: invoice.vatRate,
    lineItems: invoice.lineItems
  };
}

async function saveInvoiceAttachment({
  buffer,
  file,
  fileHash,
  originalName,
  parsedInvoice,
  rowId
}: {
  buffer: Buffer;
  file: File;
  fileHash: string;
  originalName: string;
  parsedInvoice: Pick<
    ParsedInvoice,
    "invoiceDate" | "invoiceId" | "grossCents" | "netCents" | "vatRate"
  >;
  rowId: string;
}) {
  const rowDirName = sanitizeSegment(rowId);
  const uploadDir = path.join(UPLOAD_DIR, rowDirName);
  await fs.mkdir(uploadDir, { recursive: true });

  const storedName = `invoiceFile-${Date.now()}-${originalName}`;
  const storedPath = path.join(uploadDir, storedName);
  await fs.writeFile(storedPath, buffer);

  const attachment: FileAttachment = {
    name: originalName,
    path: `${rowDirName}/${storedName}`,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    paymentDate: parsedInvoice.invoiceDate.toISOString(),
    invoiceId: parsedInvoice.invoiceId ?? undefined,
    invoiceDate: parsedInvoice.invoiceDate.toISOString(),
    grossCents: parsedInvoice.grossCents,
    netCents: parsedInvoice.netCents,
    vatRate: parsedInvoice.vatRate,
    fileHash
  };

  return attachment;
}

function findMatchingSubscriptionRow(rows: ExpenseRow[], invoice: ParsedInvoice) {
  if (invoice.classification !== "monthly") {
    return null;
  }

  const candidateKeys = new Set(
    [invoice.subscriptionKey, invoice.serviceKey].filter((key): key is string => Boolean(key))
  );

  return (
    rows.find((row) => {
      if (row.costType !== "Fix" || row.interval !== "Monatlich") {
        return false;
      }

      const rowKeys = [
        row.subscriptionKey,
        normalizeSubscriptionKey(row.name),
        normalizeSubscriptionKey(row.description),
        ...row.description.split(/[()\-–—+/&]/).map(normalizeSubscriptionKey)
      ].filter((key): key is string => Boolean(key));

      return rowKeys.some((rowKey) =>
        Array.from(candidateKeys).some(
          (candidateKey) => rowKey === candidateKey || rowKey.includes(candidateKey) || candidateKey.includes(rowKey)
        )
      );
    }) ?? null
  );
}

function isDuplicateInvoice(row: ExpenseRow, invoiceId: string | null, fileHash: string) {
  return row.invoiceFile.some((attachment) => {
    if (!attachment) {
      return false;
    }

    if (invoiceId && attachment.invoiceId && normalizeIdentifier(attachment.invoiceId) === normalizeIdentifier(invoiceId)) {
      return true;
    }

    return Boolean(attachment.fileHash && attachment.fileHash === fileHash);
  });
}

function findDuplicateInvoiceRow(
  rows: ExpenseRow[],
  invoiceId: string | null,
  fileHash: string
) {
  return rows.find((row) => isDuplicateInvoice(row, invoiceId, fileHash)) ?? null;
}

function appendAttachment(attachments: ExpenseRow["invoiceFile"], attachment: FileAttachment) {
  const updated = [...attachments];
  const emptySlot = updated.findIndex((entry) => !entry);

  if (emptySlot >= 0) {
    updated[emptySlot] = attachment;
    return updated;
  }

  updated.push(attachment);
  return updated;
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buchhaltung-invoice-"));
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

function findInvoiceId(text: string) {
  const patterns = [
    /(?:invoice|rechnung)(?:\s*(?:number|no\.?|nr\.?|#|nummer))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})/i,
    /(?:beleg|receipt)(?:\s*(?:number|no\.?|nr\.?|#|nummer))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/[.,;:]+$/g, "");
    }
  }

  return null;
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

function findVatRate(text: string) {
  for (const rate of knownVatRates) {
    const percent = Math.round(rate * 100);
    const pattern = new RegExp(`(?:ust|mwst|vat|tax|steuer)?\\s*${percent}\\s*%`, "i");
    if (pattern.test(text)) {
      return rate;
    }
  }

  return 0.2;
}

function findGrossCents(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const preferredLabels = [
    /^(?:amount due|balance due|total due|zu zahlen|zahlbetrag|rechnungsbetrag)\b/i,
    /^(?:total|gesamt|summe)\b/i,
    /\b(?:amount due|balance due|total due|zu zahlen|zahlbetrag|rechnungsbetrag)\b/i,
    /\b(?:total|gesamt|summe)\b/i
  ];

  for (const label of preferredLabels) {
    const amounts = lines
      .filter((line) => label.test(line) && !/excluding|exkl\.?|ohne|subtotal|zwischensumme/i.test(line))
      .flatMap((line) => findMoneyValues(line));

    if (amounts.length > 0) {
      return amounts[amounts.length - 1];
    }
  }

  const labeledAmounts = Array.from(
    text.matchAll(
      /(?:gesamt|summe|total|brutto|amount|betrag|zu zahlen)[^\d€\n]{0,80}(?:€|eur)?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})/gi
    )
  )
    .map((match) => parseMoneyCents(match[1]))
    .filter((amount) => amount > 0);

  if (labeledAmounts.length > 0) {
    return Math.max(...labeledAmounts);
  }

  const euroAmounts = findMoneyValues(text);

  return euroAmounts.length > 0 ? Math.max(...euroAmounts) : 0;
}

function findMoneyValues(text: string) {
  const afterCurrency = Array.from(
    text.matchAll(/(?:€|eur)\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})/gi)
  ).map((match) => match[1]);
  const beforeCurrency = Array.from(
    text.matchAll(/(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})\s*(?:€|eur)\b/gi)
  ).map((match) => match[1]);
  const wholeAfterCurrency = Array.from(
    text.matchAll(/(?:€|eur)\s*(\d{1,6})(?![\d,.])/gi)
  ).map((match) => match[1]);
  const wholeBeforeCurrency = Array.from(
    text.matchAll(/(?<![\d,.])\b(\d{1,6})(?![\d,.])\s*(?:€|eur)\b/gi)
  ).map((match) => match[1]);

  return [...afterCurrency, ...beforeCurrency, ...wholeAfterCurrency, ...wholeBeforeCurrency]
    .map((value) => parseMoneyCents(value))
    .filter((amount) => amount > 0);
}

function parseMoneyCents(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function findInvoiceLineItems(
  text: string,
  {
    vendor,
    invoiceGrossCents,
    vatRate
  }: { vendor: string; invoiceGrossCents: number; vatRate: number }
): InvoiceLineItem[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const asinCandidates = findAsinLineItems(lines, { vendor, invoiceGrossCents, vatRate });
  const rowCandidates = lines
    .map((line) => parseLineItemCandidate(line, { vendor, invoiceGrossCents, vatRate }))
    .filter((item): item is InvoiceLineItem => Boolean(item));

  const uniqueCandidates = dedupeLineItems([...asinCandidates, ...rowCandidates]);

  if (uniqueCandidates.length < 2) {
    return [];
  }

  const candidateTotal = uniqueCandidates.reduce((sum, item) => sum + item.grossCents, 0);
  const plausibleTotal =
    invoiceGrossCents <= 0 ||
    candidateTotal <= Math.round(invoiceGrossCents * 1.1) ||
    Math.abs(candidateTotal - invoiceGrossCents) <= 2;

  return plausibleTotal ? uniqueCandidates.slice(0, 20) : [];
}

function findAsinLineItems(
  lines: string[],
  {
    vendor,
    invoiceGrossCents,
    vatRate
  }: { vendor: string; invoiceGrossCents: number; vatRate: number }
): InvoiceLineItem[] {
  const asinIndexes = lines
    .map((line, index) => ({ index, asin: findAsinCode(line, lines[index + 1]) }))
    .filter((entry): entry is { index: number; asin: string } => Boolean(entry.asin));

  const items: InvoiceLineItem[] = [];

  for (const [asinPosition, entry] of asinIndexes.entries()) {
    const nextAsinIndex = asinIndexes[asinPosition + 1]?.index ?? lines.length;
    const blockStart = findAsinBlockStart(lines, entry.index);
    const blockEnd = findAsinBlockEnd(lines, entry.index, nextAsinIndex);
    const blockLines = lines.slice(blockStart, blockEnd);
    const description = findAsinDescription(blockLines, entry.asin);
    const grossCents = findAsinBlockGrossCents(blockLines, invoiceGrossCents);

    if (!description || grossCents <= 0) {
      continue;
    }

    items.push({
      description,
      asin: entry.asin,
      grossCents,
      netCents: Math.round(grossCents / (1 + vatRate)),
      vatRate,
      category: inferCategory(`${vendor} ${description}`)
    });
  }

  return items;
}

function findAsinCode(line: string, nextLine?: string) {
  const normalizedLine = normalizeAmazonFieldLine(line);
  const sameLineMatch = normalizedLine.match(/\bASIN\b[^A-Z0-9]{0,20}([A-Z0-9]{10})\b/i);
  if (sameLineMatch) {
    return sameLineMatch[1].toUpperCase();
  }

  if (/\bASIN\b/i.test(normalizedLine) && nextLine) {
    const nextLineMatch = normalizeAmazonFieldLine(nextLine).match(/\b([A-Z0-9]{10})\b/i);
    if (nextLineMatch) {
      return nextLineMatch[1].toUpperCase();
    }
  }

  return "";
}

function findAsinBlockStart(lines: string[], asinIndex: number) {
  let index = asinIndex;

  while (index > 0 && index >= asinIndex - 4) {
    const previousLine = lines[index - 1];
    if (
      isInvoiceTableHeaderLine(previousLine) ||
      isNonProductAmountLine(previousLine) ||
      findMoneyValues(previousLine).length > 0
    ) {
      break;
    }
    index -= 1;
  }

  return index;
}

function findAsinBlockEnd(lines: string[], asinIndex: number, nextAsinIndex: number) {
  let index = asinIndex + 1;
  const hardEnd = Math.min(lines.length, nextAsinIndex, asinIndex + 10);

  while (index < hardEnd) {
    if (index > asinIndex + 1 && isNonProductAmountLine(lines[index])) {
      break;
    }
    index += 1;
  }

  return index;
}

function findAsinDescription(blockLines: string[], asin: string) {
  const sameLine = blockLines.find(
    (line) =>
      new RegExp(`\\b${escapeRegExp(asin)}\\b`, "i").test(line) &&
      !isBareAsinCodeLine(line, asin)
  );
  const sameLineDescription = sameLine
    ? cleanLineItemDescription(removeAsinFields(sameLine))
    : "";

  if (isLikelyLineItemDescription(sameLineDescription)) {
    return sameLineDescription;
  }

  const titleLines = blockLines
    .map(removeAsinFields)
    .filter((line) => !isBareAsinCodeLine(line, asin))
    .filter((line) => !isInvoiceTableHeaderLine(line))
    .filter((line) => !isNonProductAmountLine(line))
    .map(cleanLineItemDescription)
    .filter(isLikelyLineItemDescription);

  return titleLines[0] ?? "";
}

function removeAsinFields(line: string) {
  return normalizeAmazonFieldLine(line)
    .replace(/\bASIN\b[^A-Z0-9]{0,20}[A-Z0-9]{10}\b/gi, " ")
    .replace(/\bASIN\b/gi, " ");
}

function isBareAsinCodeLine(line: string, asin: string) {
  const normalizedLine = normalizeAmazonFieldLine(line).replace(/\s+/g, " ").trim();
  return normalizedLine === asin;
}

function findAsinBlockGrossCents(blockLines: string[], invoiceGrossCents: number) {
  const amounts = blockLines
    .filter((line) => !isNonProductAmountLine(line))
    .flatMap((line) => findMoneyValues(line))
    .filter((amount) => amount > 0 && (invoiceGrossCents <= 0 || amount <= invoiceGrossCents));

  return amounts.length > 0 ? Math.max(...amounts) : 0;
}

function parseLineItemCandidate(
  line: string,
  {
    vendor,
    invoiceGrossCents,
    vatRate
  }: { vendor: string; invoiceGrossCents: number; vatRate: number }
): InvoiceLineItem | null {
  if (isNonProductAmountLine(line)) {
    return null;
  }

  const amounts = findMoneyValues(line);
  if (amounts.length === 0) {
    return null;
  }

  const grossCents = Math.max(...amounts);
  if (grossCents <= 0 || (invoiceGrossCents > 0 && grossCents > invoiceGrossCents)) {
    return null;
  }

  const description = cleanLineItemDescription(line);
  if (!isLikelyLineItemDescription(description)) {
    return null;
  }

  return {
    description,
    grossCents,
    netCents: Math.round(grossCents / (1 + vatRate)),
    vatRate,
    category: inferCategory(`${vendor} ${description}`)
  };
}

function cleanLineItemDescription(line: string) {
  return normalizeAmazonFieldLine(line)
    .replace(/(?:€|eur)\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})/gi, " ")
    .replace(/(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})\s*(?:€|eur)\b/gi, " ")
    .replace(/(?:€|eur)\s*\d{1,6}(?![\d,.])/gi, " ")
    .replace(/(?<![\d,.])\b\d{1,6}(?![\d,.])\s*(?:€|eur)\b/gi, " ")
    .replace(/\b\d+\s*(?:x|stk\.?|pcs?\.?|stueck|stück)\b/gi, " ")
    .replace(/\b(?:x|stk\.?|pcs?\.?|stueck|stück)\s*\d+\b/gi, " ")
    .replace(/\b\d+\s+(?=\d)/g, " ")
    .replace(/\b(?:ust|mwst|vat|tax)\s*\d{1,2}\s*%/gi, " ")
    .replace(/\b\d{1,2}\s*%(?=\s|$)/g, " ")
    .replace(/\b(?:asin|sku|fnsku|art\.?-?nr\.?|artikelnummer)\b[^A-Z0-9]{0,20}[A-Z0-9-]+\b/gi, " ")
    .replace(/\b(?:verkauft von|sold by|zustand|condition|bestell(?:nummer)?|order(?: number)?|lieferung|shipment)\b.*$/gi, " ")
    .replace(/^\d+\s+(?:of|von)\s*:\s*/i, "")
    .replace(/^[#*\-\s]+/, "")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .slice(0, 160);
}

function normalizeAmazonFieldLine(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isNonProductAmountLine(line: string) {
  return /^(?:gesamt|gesamtpreis|summe|zwischensumme|subtotal|total|amount due|balance due|zu zahlen|zahlbetrag|rechnungsbetrag|brutto|netto|ust|mwst|vat|tax|steuer|shipping|versand|lieferung|delivery|gutschein|rabatt|discount)\b/i.test(
    line
  );
}

function isInvoiceTableHeaderLine(line: string) {
  const lower = line.toLowerCase();
  const headerWords = [
    "beschreibung",
    "description",
    "artikel",
    "product",
    "produkt",
    "menge",
    "quantity",
    "qty",
    "preis",
    "price",
    "gesamt",
    "total",
    "asin"
  ];

  return headerWords.filter((word) => lower.includes(word)).length >= 3;
}

function isLikelyLineItemDescription(value: string) {
  if (value.length < 4 || value.length > 160) {
    return false;
  }

  if (!/[a-zA-ZÄÖÜäöüß]{3}/.test(value)) {
    return false;
  }

  return !/^(?:beschreibung|description|menge|quantity|preis|price|gesamt|total)$/i.test(value);
}

function dedupeLineItems(items: InvoiceLineItem[]) {
  const seen = new Set<string>();
  const uniqueItems: InvoiceLineItem[] = [];

  for (const item of items) {
    const key = `${normalizeSubscriptionKey(item.description)}-${item.grossCents}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findVendor(text: string) {
  if (/\bamazon(?:\.[a-z]{2,3})?\b/i.test(text)) {
    const amazonLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /\bamazon(?:\.[a-z]{2,3})?\b/i.test(line));

    return amazonLine?.match(/\bamazon(?:\.[a-z]{2,3})?\b/i)?.[0] ?? "Amazon";
  }

  return text
    .split("\n")
    .map((line) => line.replace(/\bBill to\b.*$/i, "").trim())
    .find((line) => isLikelyVendorLine(line)) ?? null;
}

function findService(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const descriptionIndex = lines.findIndex((line) => /^description\b/i.test(line));
  const searchLines = descriptionIndex >= 0 ? lines.slice(descriptionIndex + 1) : lines;

  const serviceLine = searchLines.find((line) => {
    return (
      /[a-zA-ZÄÖÜäöüß]{3}/.test(line) &&
      !/^subtotal|^total|^vat|^tax|^amount due|^page\b/i.test(line) &&
      /subscription|monthly|seat|license|lizenz|plan|service|hosting|cloud|pro|plus/i.test(line)
    );
  });

  if (!serviceLine) {
    return null;
  }

  return serviceLine
    .replace(/\s+\d+\s+(?:€|eur).+$/i, "")
    .replace(/\s+(?:€|eur)\s*\d+[,.]\d{2}.*$/i, "")
    .replace(/\s+\d+[,.]\d{2}\s*(?:€|eur).+$/i, "")
    .replace(/\s+\d+\s+\d{1,3}[,.]\d{2}.*$/i, "")
    .replace(/\s{2,}.+$/g, "")
    .trim();
}

function classifyInvoice(text: string, service: string): InvoiceClassification {
  const lower = `${text}\n${service}`.toLowerCase();
  const hasMonthlySignal =
    /\bsubscription\b|\bmonthly\b|\bmonth\b|\bper seat\b|\bmonatlich\b|\babo\b|\babonnement\b|\blizenz\b/.test(lower);
  const hasMonthlyPeriod =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\s*[–-]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\.?\s*\d{1,2},?\s+20\d{2}\b/i.test(text) ||
    /\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\s*[–-]\s*\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/.test(text);

  if (hasMonthlySignal || hasMonthlyPeriod) {
    return "monthly";
  }

  if (/\bone[-\s]?time\b|\beinmalig\b|\bsingle payment\b/i.test(text)) {
    return "oneTime";
  }

  return "uncertain";
}

function isLikelyVendorLine(value: string) {
  if (value.length < 3 || value.length > 100) {
    return false;
  }

  if (
    /\d{1,3}[,.]\d{2}|rechnung|invoice|datum|date|seite|page|betrag|summe|gesamt|total|beschreibung|description|menge|quantity|preis|price|subtotal|vat|tax|asin/i.test(
      value
    )
  ) {
    return false;
  }

  return /[a-zA-ZÄÖÜäöüß]{3}/.test(value);
}

function inferCategory(value: string) {
  const lower = value.toLowerCase();
  const matches: Array<[string, string[]]> = [
    ["AI Tools", ["openai", "chatgpt", "anthropic", "claude", "midjourney"]],
    ["Software", ["software", "app", "license", "lizenz", "saas", "adobe", "figma"]],
    ["Marketing", ["google ads", "meta", "facebook", "instagram", "werbung", "marketing"]],
    ["Kommunikation", ["telefon", "mobile", "slack", "zoom", "teams"]],
    ["Internet", ["internet", "domain", "hosting", "server", "cloud"]],
    ["Transport", ["uber", "taxi", "bahn", "oebb", "öbb", "flight", "airline"]],
    ["Finanzen", ["bank", "stripe", "paypal", "steuer", "finance"]]
  ];

  return matches.find(([_category, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    ?.[0] ?? "Sonstiges";
}

function cleanFilename(filename: string) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExtractedText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSubscriptionKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(limited|ltd|gmbh|inc|llc|ireland|austria|rechnung|invoice)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function getMonthIndex(value: string) {
  const normalized = value.toLowerCase();
  const monthIndexes: Record<string, number> = {
    january: 0,
    januar: 0,
    february: 1,
    februar: 1,
    march: 2,
    maerz: 2,
    "märz": 2,
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

  return monthIndexes[normalized] ?? 0;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
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
    : `${cleaned || "rechnung"}.pdf`;
}
