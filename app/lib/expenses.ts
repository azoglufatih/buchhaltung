import { promises as fs } from "fs";
import path from "path";
import type { ExpensePayload, ExpenseRow, FileAttachment, FileAttachmentList } from "@/app/lib/types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const DATA_FILE = path.join(DATA_DIR, "expenses.json");
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function readExpenses(): Promise<ExpensePayload> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as ExpensePayload;
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows.map(normalizeRow) : []
    };
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError.code !== "ENOENT") {
      throw error;
    }
    const emptyPayload = { rows: [] };
    await writeExpenses(emptyPayload);
    return emptyPayload;
  }
}

export async function writeExpenses(payload: ExpensePayload) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const normalized = {
    rows: Array.isArray(payload.rows) ? payload.rows.map(normalizeRow) : []
  };
  await fs.writeFile(DATA_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function normalizeRow(row: ExpenseRow): ExpenseRow {
  const vatRate = sanitizeVatRate(row.vatRate);
  const amountInputType = row.amountInputType === "net" ? "net" : "gross";
  const grossCents = Math.max(0, Math.round(Number(row.grossCents) || 0));
  const incomingNetCents = Number(row.netCents);
  const netCents = Number.isFinite(incomingNetCents)
    ? Math.max(0, Math.round(incomingNetCents))
    : Math.round(grossCents / (1 + vatRate));
  const invoiceFile = normalizeAttachments(row.invoiceFile);
  const latestInvoiceNumber = [...invoiceFile]
    .reverse()
    .find((attachment) => attachment?.invoiceId)?.invoiceId;

  return {
    id: String(row.id),
    year: String(row.year || new Date().getFullYear()),
    costType: row.costType === "Variabel" ? "Variabel" : "Fix",
    interval:
      row.interval === "Jaehrlich" || row.interval === "Einmalig"
        ? row.interval
        : "Monatlich",
    category: String(row.category || "Sonstiges"),
    name: String(row.name || ""),
    description: String(row.description || ""),
    invoiceNumber: String(row.invoiceNumber || latestInvoiceNumber || ""),
    startMonth: clampInteger(row.startMonth, 1, 12, 1),
    paymentsPerYear: clampInteger(row.paymentsPerYear, 1, 12, 1),
    vatRate,
    grossCents: amountInputType === "net" ? Math.round(netCents * (1 + vatRate)) : grossCents,
    netCents: amountInputType === "gross" ? Math.round(grossCents / (1 + vatRate)) : netCents,
    amountInputType,
    subscriptionKey:
      typeof row.subscriptionKey === "string" && row.subscriptionKey.trim()
        ? normalizeSubscriptionKey(row.subscriptionKey)
        : normalizeSubscriptionKey(row.name || row.description),
    invoiceFile,
    cardStatementFile: normalizeAttachments(row.cardStatementFile)
  };
}

function normalizeAttachments(value: unknown): FileAttachmentList {
  if (Array.isArray(value)) {
    return trimEmptyAttachmentSlots(value.map((item) => normalizeAttachment(item)));
  }

  const attachment = normalizeAttachment(value);
  return attachment ? [attachment] : [];
}

function trimEmptyAttachmentSlots(attachments: FileAttachmentList) {
  const trimmed = [...attachments];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === null) {
    trimmed.pop();
  }
  return trimmed;
}

function isFileAttachment(value: unknown): value is FileAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<FileAttachment>;
  if (
    typeof attachment.name === "string" &&
    typeof attachment.path === "string" &&
    typeof attachment.size === "number" &&
    typeof attachment.uploadedAt === "string"
  ) {
    return true;
  }

  return false;
}

function normalizeAttachment(value: unknown): FileAttachment | null {
  if (!isFileAttachment(value)) {
    return null;
  }

  const attachment = value as FileAttachment;
  return {
    ...attachment,
    paymentDate:
      typeof attachment.paymentDate === "string" && attachment.paymentDate.trim()
        ? attachment.paymentDate
        : typeof attachment.invoiceDate === "string" && attachment.invoiceDate.trim()
          ? attachment.invoiceDate
          : undefined
  };
}

function normalizeSubscriptionKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function sanitizeVatRate(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0.2;
  }
  return Math.min(1, numericValue);
}
