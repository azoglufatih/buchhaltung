export type CostType = "Fix" | "Variabel";
export type Interval = "Monatlich" | "Jaehrlich" | "Einmalig";
export type UploadField = "invoiceFile" | "cardStatementFile";
export type AmountInputType = "gross" | "net";
export type ColumnType =
  | "text"
  | "select"
  | "month"
  | "number"
  | "percent"
  | "money"
  | "pdf";

export type FileAttachment = {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
  paymentDate?: string;
  invoiceId?: string;
  invoiceDate?: string;
  grossCents?: number;
  netCents?: number;
  vatRate?: number;
  fileHash?: string;
};

export type FileAttachmentList = Array<FileAttachment | null>;

export type ExpenseRow = {
  id: string;
  year: string;
  costType: CostType;
  interval: Interval;
  category: string;
  name: string;
  description: string;
  invoiceNumber: string;
  startMonth: number;
  paymentsPerYear: number;
  vatRate: number;
  grossCents: number;
  netCents: number;
  amountInputType: AmountInputType;
  subscriptionKey?: string;
  invoiceFile: FileAttachmentList;
  cardStatementFile: FileAttachmentList;
};

export type ExpensePayload = {
  rows: ExpenseRow[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSource = {
  type: "document" | "expense";
  label: string;
  href?: string;
  rowId?: string;
};

export type ChatResponse = {
  answer: string;
  sources: ChatSource[];
};
