"use client";

import {
  ChangeEvent,
  DragEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Calculator,
  Columns3,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import type {
  ColumnType,
  CostType,
  ExpensePayload,
  ExpenseRow,
  FileAttachment,
  FileAttachmentList,
  Interval,
  UploadField
} from "@/app/lib/types";
import { AccountingChat } from "@/app/components/AccountingChat";

type ColumnKey =
  | "year"
  | "costType"
  | "interval"
  | "category"
  | "name"
  | "description"
  | "invoiceNumber"
  | "startMonth"
  | "paymentsPerYear"
  | "vatRate"
  | "grossCents"
  | "netCents"
  | "annualGrossCents"
  | "annualNetCents"
  | "monthlyNetCents"
  | "monthlyGrossCents"
  | "invoiceFile"
  | "cardStatementFile";

type ColumnDefinition = {
  key: ColumnKey;
  label: string;
  defaultType: ColumnType;
  width: string;
  readOnly?: boolean;
  separatorAfter?: boolean;
};

type DashboardView = "sheet" | "statistics" | "files";
type GroupingKey = "interval" | "category" | "costType" | "none";
type SortKey =
  | "name"
  | "description"
  | "invoiceNumber"
  | "category"
  | "startMonth"
  | "grossCents"
  | "netCents"
  | "annualGrossCents"
  | "annualNetCents";
type SortDirection = "asc" | "desc";

type ScanInvoiceDraft = {
  invoiceId: string | null;
  invoiceDate: string;
  vendor: string;
  service: string;
  description: string;
  category: string;
  grossCents: number;
  netCents: number;
  vatRate: number;
  classification: "monthly" | "oneTime" | "uncertain";
  lineItems?: ScanInvoiceLineItem[];
};

type ScanInvoiceLineItem = {
  description: string;
  asin?: string;
  grossCents: number;
  netCents: number;
  vatRate: number;
  category: string;
};

type ScanInvoiceResponse =
  | { status: "attached" | "created"; row: ExpenseRow }
  | { status: "createdMany"; rows: ExpenseRow[] }
  | { status: "duplicate"; row: ExpenseRow; message: string }
  | {
      status: "needsConfirmation";
      draft: ScanInvoiceDraft;
      analysis: string;
      clientFileId?: string | null;
    };

type ProcessedScanInvoiceResult = Exclude<ScanInvoiceResponse, { status: "needsConfirmation" }>;

type BatchScanResponse =
  | {
      status: "batchCompleted";
      results: BatchProcessedScanResult[];
    }
  | {
      status: "needsConfirmationMany";
      results: BatchProcessedScanResult[];
      pending: BatchPendingScanResult[];
    };

type PendingBatchScanConfirmation = {
  items: PendingBatchScanItem[];
};

type PendingBatchScanItem = {
  fileId: string;
  file: File;
  draft: ScanInvoiceDraft;
  analysis: string;
};

type BatchProcessedScanResult = {
  fileName: string;
  clientFileId: string | null;
  result: ProcessedScanInvoiceResult;
};

type BatchPendingScanResult = {
  fileName: string;
  clientFileId: string | null;
  draft: ScanInvoiceDraft;
  analysis: string;
};

type BatchDecisionMode = "monthly" | "oneTimeCombined" | "oneTimeSeparate";

type BatchScanDecision = {
  fileId: string;
  classificationOverride: "monthly" | "oneTime";
  splitMode?: "combined" | "separate";
};

type PendingPlacementSuggestion = {
  rowId: string;
  field: UploadField;
  fromSlot: number;
  toSlot: number;
  fromDateLabel: string;
  toDateLabel: string;
  fileName: string;
};

const columns: ColumnDefinition[] = [
  { key: "year", label: "Jahr", defaultType: "select", width: "w-28" },
  { key: "costType", label: "Fix/Variabel", defaultType: "select", width: "w-40" },
  { key: "interval", label: "Intervall", defaultType: "select", width: "w-36" },
  { key: "category", label: "Kategorie", defaultType: "select", width: "w-48" },
  { key: "name", label: "Name", defaultType: "text", width: "w-56" },
  { key: "description", label: "Beschreibung", defaultType: "text", width: "w-72" },
  { key: "invoiceNumber", label: "Rechnungsnummer", defaultType: "text", width: "w-48" },
  { key: "startMonth", label: "Startmonat", defaultType: "month", width: "w-36" },
  {
    key: "paymentsPerYear",
    label: "Anzahl Zahlungen/Jahr",
    defaultType: "number",
    width: "w-56"
  },
  { key: "vatRate", label: "USt", defaultType: "percent", width: "w-28" },
  { key: "grossCents", label: "Brutto", defaultType: "money", width: "w-36" },
  { key: "netCents", label: "Netto", defaultType: "money", width: "w-36" },
  {
    key: "annualGrossCents",
    label: "Jahresbrutto EUR",
    defaultType: "money",
    width: "w-48",
    readOnly: true,
    separatorAfter: true
  },
  {
    key: "annualNetCents",
    label: "Jahresnetto EUR",
    defaultType: "money",
    width: "w-48",
    readOnly: true,
    separatorAfter: true
  },
  {
    key: "monthlyNetCents",
    label: "Monatsnetto EUR",
    defaultType: "money",
    width: "w-48",
    readOnly: true
  },
  {
    key: "monthlyGrossCents",
    label: "Monatsbrutto EUR",
    defaultType: "money",
    width: "w-48",
    readOnly: true,
    separatorAfter: true
  },
  {
    key: "invoiceFile",
    label: "Rechnungen",
    defaultType: "pdf",
    width: "w-96",
    separatorAfter: true
  },
  {
    key: "cardStatementFile",
    label: "Kartenabrechnung",
    defaultType: "pdf",
    width: "w-96",
    separatorAfter: true
  }
];

const defaultHiddenColumnKeys = new Set<ColumnKey>([
  "annualGrossCents",
  "annualNetCents",
  "monthlyNetCents",
  "monthlyGrossCents"
]);

const columnTypeLabels: Record<ColumnType, string> = {
  text: "Text",
  select: "Auswahl",
  month: "Monat",
  number: "Zahl",
  percent: "Prozent",
  money: "Geld",
  pdf: "PDF"
};

const groupingControlLabels: Record<GroupingKey, string> = {
  interval: "Gruppiert: Intervall",
  category: "Gruppiert: Kategorie",
  costType: "Gruppiert: Fix/Variabel",
  none: "Keine Gruppierung"
};

const sortControlLabels: Record<SortKey, string> = {
  name: "Sortiert: Name",
  description: "Sortiert: Beschreibung",
  invoiceNumber: "Sortiert: Rechnungsnummer",
  category: "Sortiert: Kategorie",
  startMonth: "Sortiert: Startmonat",
  grossCents: "Sortiert: Brutto",
  netCents: "Sortiert: Netto",
  annualGrossCents: "Sortiert: Jahresbrutto",
  annualNetCents: "Sortiert: Jahresnetto"
};

const intervalGroupLabels: Record<Interval, string> = {
  Monatlich: "Monatliche Zahlungen",
  Jaehrlich: "Jaehrliche Zahlungen",
  Einmalig: "Einmalige Zahlungen"
};

const costTypes: CostType[] = ["Fix", "Variabel"];
const intervals: Interval[] = ["Monatlich", "Jaehrlich", "Einmalig"];
const vatRates = [0, 0.1, 0.13, 0.2];
const months = Array.from({ length: 12 }, (_item, index) => index + 1);
const paymentCountOptions = months.map(String);
const years = ["2026", "2027", "2028", "2029", "2030"];
const fallbackCategories = [
  "AI Tools",
  "Animation",
  "Designer",
  "Finanzen",
  "Infrastruktur",
  "Internet",
  "Kommunikation",
  "Marketing",
  "Mobilitaet",
  "Software",
  "Transport",
  "Sonstiges"
];

const moneyFormatter = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR"
});

export function ExpenseDashboard() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);
  const [removingCell, setRemovingCell] = useState<string | null>(null);
  const [scanningInvoice, setScanningInvoice] = useState(false);
  const [scanDropActive, setScanDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingScanConfirmation, setPendingScanConfirmation] =
    useState<PendingBatchScanConfirmation | null>(null);
  const [pendingPlacementSuggestion, setPendingPlacementSuggestion] =
    useState<PendingPlacementSuggestion | null>(null);
  const [activeColumnMenu, setActiveColumnMenu] = useState<ColumnKey | null>(null);
  const [columnViewMenuOpen, setColumnViewMenuOpen] = useState(false);
  const [editingColumnType, setEditingColumnType] = useState<ColumnKey | null>(null);
  const [accountingYear, setAccountingYear] = useState(years[0]);
  const [dashboardView, setDashboardView] = useState<DashboardView>("sheet");
  const [groupingKey, setGroupingKey] = useState<GroupingKey>("interval");
  const [sortKey, setSortKey] = useState<SortKey>("startMonth");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showDocumentHints, setShowDocumentHints] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [pinnedSelectedRowId, setPinnedSelectedRowId] = useState<string | null>(null);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<ColumnKey>>(
    () =>
      new Set(
        columns
          .filter((column) => !defaultHiddenColumnKeys.has(column.key))
          .map((column) => column.key)
      )
  );
  const [columnTypes, setColumnTypes] = useState<Record<ColumnKey, ColumnType>>(() =>
    columns.reduce(
      (result, column) => ({ ...result, [column.key]: column.defaultType }),
      {} as Record<ColumnKey, ColumnType>
    )
  );
  const initialLoadComplete = useRef(false);
  const scanInvoiceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadRows() {
      try {
        const response = await fetch("/api/expenses", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Die Ausgaben konnten nicht geladen werden.");
        }

        const payload = (await response.json()) as ExpensePayload;

        if (mounted) {
          setRows(payload.rows);
          initialLoadComplete.current = true;
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unbekannter Ladefehler.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadRows();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initialLoadComplete.current || !dirty) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch("/api/expenses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Die Tabelle konnte nicht gespeichert werden.");
        }

        setDirty(false);
      } catch (saveError) {
        if (!controller.signal.aborted) {
          setError(saveError instanceof Error ? saveError.message : "Unbekannter Speicherfehler.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setSaving(false);
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [dirty, rows]);

  const categories = useMemo(() => {
    return Array.from(new Set([...fallbackCategories, ...rows.map((row) => row.category)])).sort(
      (left, right) => left.localeCompare(right, "de")
    );
  }, [rows]);

  const accountingYears = useMemo(() => {
    return Array.from(new Set([...years, ...rows.map((row) => row.year)])).sort(
      compareYearStrings
    );
  }, [rows]);
  const yearRows = useMemo(
    () => rows.filter((row) => row.year === accountingYear),
    [accountingYear, rows]
  );
  const totals = useMemo(() => getTotals(yearRows), [yearRows]);
  const groupedTotals = useMemo(() => getGroupedTotals(yearRows), [yearRows]);
  const monthlyTotals = useMemo(() => getMonthlyTotals(yearRows), [yearRows]);
  const statisticsHighlights = useMemo(() => {
    const highestMonth = monthlyTotals.reduce(
      (highest, month) => (month.grossCents > highest.grossCents ? month : highest),
      monthlyTotals[0]
    );
    const largestCategory = [...groupedTotals.byCategory].sort(
      (left, right) => right.grossCents - left.grossCents
    )[0];
    const rowsWithReceipts = yearRows.filter(hasAttachedPdf).length;

    return {
      highestMonth,
      largestCategory,
      receiptCoverage: yearRows.length === 0 ? 0 : Math.round((rowsWithReceipts / yearRows.length) * 100)
    };
  }, [groupedTotals.byCategory, monthlyTotals, yearRows]);
  const visibleRows = useMemo(() => {
    if (dashboardView !== "files") {
      return sortRows(yearRows, sortKey, sortDirection);
    }

    return yearRows.filter(hasAttachedPdf).sort(compareRowsByYearMonth);
  }, [dashboardView, sortDirection, sortKey, yearRows]);
  const visibleRowGroups = useMemo(
    () => groupRows(visibleRows, groupingKey),
    [groupingKey, visibleRows]
  );
  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnKeys.has(column.key)),
    [visibleColumnKeys]
  );
  const tableMinWidth = useMemo(
    () =>
      80 +
      visibleColumns.reduce((width, column) => width + getColumnWidthPx(column.width), 0),
    [visibleColumns]
  );
  const visibleRowIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);
  const focusedSelectedRow = useMemo(
    () => visibleRows.find((row) => row.id === pinnedSelectedRowId) ?? null,
    [pinnedSelectedRowId, visibleRows]
  );
  const allVisibleRowsSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((rowId) => selectedRowIds.has(rowId));

  useEffect(() => {
    setSelectedRowIds((currentSelection) => {
      const visibleRowIdSet = new Set(visibleRowIds);
      const nextSelection = new Set(
        Array.from(currentSelection).filter((rowId) => visibleRowIdSet.has(rowId))
      );

      return nextSelection.size === currentSelection.size ? currentSelection : nextSelection;
    });
  }, [visibleRowIds]);

  useEffect(() => {
    if (pinnedSelectedRowId && !selectedRowIds.has(pinnedSelectedRowId)) {
      setPinnedSelectedRowId(selectedRowIds.values().next().value ?? null);
    }
  }, [pinnedSelectedRowId, selectedRowIds]);

  function patchRow(rowId: string, patch: Partial<ExpenseRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    setDirty(true);
  }

  function updateGross(rowId: string, grossCents: number) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              grossCents,
              netCents: getNetFromGross(grossCents, row.vatRate),
              amountInputType: "gross"
            }
          : row
      )
    );
    setDirty(true);
  }

  function updateNet(rowId: string, netCents: number) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              grossCents: getGrossFromNet(netCents, row.vatRate),
              netCents,
              amountInputType: "net"
            }
          : row
      )
    );
    setDirty(true);
  }

  function updateVat(rowId: string, vatRate: number) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        if (row.amountInputType === "net") {
          return {
            ...row,
            vatRate,
            grossCents: getGrossFromNet(row.netCents, vatRate)
          };
        }

        return {
          ...row,
          vatRate,
          netCents: getNetFromGross(row.grossCents, vatRate)
        };
      })
    );
    setDirty(true);
  }

  function addRow() {
    const newRow: ExpenseRow = {
      id: `exp-${Date.now()}`,
      year: accountingYear,
      costType: "Fix",
      interval: "Monatlich",
      category: "Sonstiges",
      name: "",
      description: "",
      invoiceNumber: "",
      startMonth: 1,
      paymentsPerYear: 12,
      vatRate: 0.2,
      grossCents: 0,
      netCents: 0,
      amountInputType: "gross",
      invoiceFile: [],
      cardStatementFile: []
    };

    setRows((currentRows) => [...currentRows, newRow]);
    setDirty(true);
  }

  function toggleRowSelection(rowId: string) {
    const willSelect = !selectedRowIds.has(rowId);

    setSelectedRowIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(rowId)) {
        nextSelection.delete(rowId);
      } else {
        nextSelection.add(rowId);
      }

      return nextSelection;
    });

    if (willSelect) {
      setPinnedSelectedRowId(rowId);
    } else if (pinnedSelectedRowId === rowId) {
      setPinnedSelectedRowId(
        Array.from(selectedRowIds).find((selectedRowId) => selectedRowId !== rowId) ?? null
      );
    }
  }

  function toggleVisibleRowsSelection() {
    setSelectedRowIds((currentSelection) => {
      if (allVisibleRowsSelected) {
        return new Set();
      }

      return new Set([...currentSelection, ...visibleRowIds]);
    });
    setPinnedSelectedRowId(allVisibleRowsSelected ? null : visibleRowIds[0] ?? null);
  }

  function deleteSelectedRows() {
    if (selectedRowIds.size === 0) {
      return;
    }

    setRows((currentRows) => currentRows.filter((row) => !selectedRowIds.has(row.id)));
    setSelectedRowIds(new Set());
    setPinnedSelectedRowId(null);
    setDirty(true);
  }

  function isColumnVisible(columnKey: ColumnKey) {
    return visibleColumnKeys.has(columnKey);
  }

  function toggleColumnVisibility(columnKey: ColumnKey) {
    setVisibleColumnKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(columnKey)) {
        nextKeys.delete(columnKey);
      } else {
        nextKeys.add(columnKey);
      }

      return nextKeys;
    });
  }

  async function uploadPdf(
    rowId: string,
    field: UploadField,
    slotIndex: number,
    file: File | null,
    paymentDate?: string
  ) {
    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Nur PDF-Dateien sind erlaubt.");
      return;
    }

    const uploadKey = `${rowId}-${field}-${slotIndex}`;
    setUploadingCell(uploadKey);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("rowId", rowId);
      formData.append("field", field);
      formData.append("slotIndex", String(slotIndex));
      if (paymentDate) {
        formData.append("paymentDate", paymentDate);
      }
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Die PDF-Datei konnte nicht hochgeladen werden.");
      }

      const payload = (await response.json()) as { attachment: FileAttachment; slotIndex: number };
      const currentRow = rows.find((row) => row.id === rowId);
      const updatedRow = currentRow
        ? replaceAttachmentInRow(currentRow, field, payload.slotIndex, payload.attachment)
        : null;
      const placementSuggestion = updatedRow
        ? getPlacementSuggestion(updatedRow, field, payload.slotIndex)
        : null;

      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }

          const attachments = [...row[field]];
          attachments[payload.slotIndex] = payload.attachment;
          return { ...row, [field]: attachments };
        })
      );
      setDirty(true);
      if (placementSuggestion) {
        setPendingPlacementSuggestion(placementSuggestion);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unbekannter Upload-Fehler.");
    } finally {
      setUploadingCell(null);
    }
  }

  function updatePaymentDate(
    rowId: string,
    field: UploadField,
    slotIndex: number,
    paymentDate: string
  ) {
    const currentRow = rows.find((row) => row.id === rowId);
    const currentAttachment = currentRow?.[field][slotIndex] ?? null;
    const updatedAttachment = currentAttachment
      ? {
          ...currentAttachment,
          paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined
        }
      : null;
    const updatedRow =
      currentRow && updatedAttachment
        ? replaceAttachmentInRow(currentRow, field, slotIndex, updatedAttachment)
        : null;
    const placementSuggestion =
      updatedRow && paymentDate ? getPlacementSuggestion(updatedRow, field, slotIndex) : null;

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        const attachment = row[field][slotIndex];
        if (!attachment) {
          return row;
        }

        const attachments = [...row[field]];
        attachments[slotIndex] = {
          ...attachment,
          paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined
        };
        return { ...row, [field]: attachments };
      })
    );
    setDirty(true);
    if (placementSuggestion) {
      setPendingPlacementSuggestion(placementSuggestion);
    }
  }

  function applyPlacementSuggestion(suggestion: PendingPlacementSuggestion) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== suggestion.rowId) {
          return row;
        }

        const attachments = [...row[suggestion.field]];
        const fromAttachment = attachments[suggestion.fromSlot] ?? null;
        attachments[suggestion.fromSlot] = attachments[suggestion.toSlot] ?? null;
        attachments[suggestion.toSlot] = fromAttachment;
        return { ...row, [suggestion.field]: trimTrailingEmptyAttachments(attachments) };
      })
    );
    setPendingPlacementSuggestion(null);
    setDirty(true);
  }

  async function removePdf(rowId: string, field: UploadField, slotIndex: number) {
    const removeKey = `${rowId}-${field}-${slotIndex}`;
    setRemovingCell(removeKey);
    setError(null);

    try {
      const response = await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, field, slotIndex })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Die PDF-Datei konnte nicht entfernt werden.");
      }

      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }

          const attachments = [...row[field]];
          attachments[slotIndex] = null;
          return { ...row, [field]: trimTrailingEmptyAttachments(attachments) };
        })
      );
      setDirty(true);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unbekannter Entfernen-Fehler.");
    } finally {
      setRemovingCell(null);
    }
  }

  function isPdfFile(file: File) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  function applyProcessedScanResult(
    fileName: string,
    payload: ProcessedScanInvoiceResult,
    options?: { suppressNotice?: boolean }
  ) {
    const suppressNotice = options?.suppressNotice ?? false;

    if (payload.status === "createdMany") {
      setRows((currentRows) =>
        payload.rows.reduce(
          (updatedRows, scannedRow) => upsertScannedRow(updatedRows, scannedRow),
          currentRows
        )
      );
      const createdYear = payload.rows[0]?.year;
      if (createdYear) {
        setAccountingYear(createdYear);
      }
      if (!suppressNotice) {
        setNotice(
          `${payload.rows.length} Positionen aus "${fileName}" wurden fuer ${createdYear ?? accountingYear} angelegt.`
        );
      }
      return;
    }

    setRows((currentRows) => upsertScannedRow(currentRows, payload.row));
    setAccountingYear(payload.row.year);

    if (suppressNotice) {
      return;
    }

    if (payload.status === "attached") {
      setNotice(`"${fileName}" wurde zu "${payload.row.name || payload.row.description}" hinzugefuegt.`);
    } else if (payload.status === "duplicate") {
      setNotice(`"${fileName}": ${payload.message}`);
    } else {
      setNotice(`Neue Position "${payload.row.name || payload.row.description}" aus "${fileName}" wurde angelegt.`);
    }
  }

  function buildScanSummary(processedCount: number, pendingCount: number) {
    const processedLabel =
      processedCount === 0
        ? "Keine Rechnung wurde direkt verarbeitet"
        : processedCount === 1
          ? "1 Rechnung direkt verarbeitet"
          : `${processedCount} Rechnungen direkt verarbeitet`;
    if (pendingCount === 0) {
      return processedLabel;
    }

    const pendingLabel =
      pendingCount === 1 ? "1 Rechnung braucht Einordnung" : `${pendingCount} Rechnungen brauchen Einordnung`;
    return `${processedLabel}. ${pendingLabel}.`;
  }

  async function scanInvoices(files: FileList | File[] | null | undefined) {
    if (!files || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files);
    const pdfFiles = selectedFiles.filter(isPdfFile);
    const skippedCount = selectedFiles.length - pdfFiles.length;

    if (pdfFiles.length === 0) {
      setError("Nur PDF-Rechnungen sind erlaubt.");
      return;
    }

    setError(
      skippedCount > 0
        ? `${skippedCount} Datei${skippedCount === 1 ? "" : "en"} wurde uebersprungen. Nur PDFs sind erlaubt.`
        : null
    );
    setNotice(null);

    setScanningInvoice(true);
    setPendingScanConfirmation(null);

    try {
      const formData = new FormData();
      const selectedEntries = pdfFiles.map((file) => ({
        fileId: crypto.randomUUID(),
        file
      }));

      for (const entry of selectedEntries) {
        formData.append("file", entry.file);
        formData.append("clientFileId", entry.fileId);
      }

      const response = await fetch("/api/scan-invoice", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Die Rechnung konnte nicht gescannt werden.");
      }

      const payload = (await response.json()) as BatchScanResponse | ScanInvoiceResponse;

      if ("results" in payload) {
        payload.results.forEach((result) =>
          applyProcessedScanResult(result.fileName, result.result, { suppressNotice: true })
        );

        if (payload.status === "needsConfirmationMany") {
          const pendingItems = payload.pending.flatMap((pending) => {
            if (!pending.clientFileId) {
              return [];
            }

            const matchingEntry = selectedEntries.find((entry) => entry.fileId === pending.clientFileId);
            if (!matchingEntry) {
              return [];
            }

            return [
              {
                fileId: pending.clientFileId,
                file: matchingEntry.file,
                draft: pending.draft,
                analysis: pending.analysis
              }
            ];
          });

          setPendingScanConfirmation({ items: pendingItems });
          setNotice(buildScanSummary(payload.results.length, pendingItems.length));
          return;
        }

        setNotice(buildScanSummary(payload.results.length, 0));
        return;
      }

      const firstFile = pdfFiles[0];
      if (payload.status === "needsConfirmation") {
        setPendingScanConfirmation({
          items: [
            {
              fileId: payload.clientFileId ?? crypto.randomUUID(),
              file: firstFile,
              draft: payload.draft,
              analysis: payload.analysis
            }
          ]
        });
        setNotice(buildScanSummary(0, 1));
        return;
      }

      applyProcessedScanResult(firstFile.name, payload);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unbekannter Scan-Fehler.");
    } finally {
      setScanningInvoice(false);
    }
  }

  async function confirmPendingScans(decisions: BatchScanDecision[]) {
    if (!pendingScanConfirmation) {
      return;
    }

    const pendingItems = pendingScanConfirmation.items;
    const decisionMap = new Map(decisions.map((decision) => [decision.fileId, decision]));

    setScanningInvoice(true);
    setError(null);
    setNotice(null);

    try {
      let processedCount = 0;

      for (const item of pendingItems) {
        const decision = decisionMap.get(item.fileId);
        if (!decision) {
          continue;
        }

        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("analysis", item.analysis);
        formData.append("classificationOverride", decision.classificationOverride);
        if (decision.splitMode) {
          formData.append("splitMode", decision.splitMode);
        }

        const response = await fetch("/api/scan-invoice", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message || `Die Rechnung "${item.file.name}" konnte nicht verarbeitet werden.`);
        }

        const payload = (await response.json()) as ScanInvoiceResponse;
        if (payload.status === "needsConfirmation") {
          throw new Error(`Die Rechnung "${item.file.name}" konnte nicht eindeutig verarbeitet werden.`);
        }

        applyProcessedScanResult(item.file.name, payload, { suppressNotice: true });
        processedCount += 1;
      }

      setPendingScanConfirmation(null);
      setNotice(
        processedCount === 1
          ? "1 Rechnung aus der Uebersicht wurde verarbeitet."
          : `${processedCount} Rechnungen aus der Uebersicht wurden verarbeitet.`
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unbekannter Scan-Fehler.");
    } finally {
      setScanningInvoice(false);
    }
  }

  function handleScanDragOver(event: DragEvent<HTMLButtonElement>) {
    if (loading || scanningInvoice || !event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setScanDropActive(true);
  }

  function handleScanDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setScanDropActive(false);
    }
  }

  function handleScanDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setScanDropActive(false);

    if (loading || scanningInvoice) {
      return;
    }

    void scanInvoices(event.dataTransfer.files);
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-[1760px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Lokale Buchhaltung
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                Accountant Expense Overview
              </h1>
              <div
                className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shadow-grid"
                aria-label="Ansicht wechseln"
              >
                {([
                  { key: "sheet", label: "Tabelle", icon: Calculator },
                  { key: "statistics", label: "Statistiken", icon: BarChart3 },
                  { key: "files", label: "Steuerberater Ansicht", icon: FileText }
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={dashboardView === key}
                    onClick={() => {
                      setColumnViewMenuOpen(false);
                      setActiveColumnMenu(null);
                      setEditingColumnType(null);
                      setDashboardView(key);
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition sm:px-3 ${
                      dashboardView === key
                        ? "bg-blue-700 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon aria-hidden="true" size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/logs"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-grid transition hover:bg-slate-50"
            >
              <Activity aria-hidden="true" size={16} />
              Aktivitaeten
            </Link>
            <StatusBadge loading={loading} saving={saving} dirty={dirty} />
            <button
              type="button"
              onClick={addRow}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white shadow-grid transition hover:bg-emerald-800"
            >
              <Plus aria-hidden="true" size={16} />
              Zeile
            </button>
            <button
              type="button"
              onClick={() => scanInvoiceInputRef.current?.click()}
              onDragOver={handleScanDragOver}
              onDragLeave={handleScanDragLeave}
              onDrop={handleScanDrop}
              disabled={loading || scanningInvoice}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white shadow-grid transition disabled:cursor-not-allowed disabled:bg-blue-300 ${
                scanDropActive
                  ? "bg-blue-900 ring-2 ring-blue-300 ring-offset-2"
                  : "bg-blue-700 hover:bg-blue-800"
              }`}
            >
              {scanningInvoice ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              ) : (
                <Upload aria-hidden="true" size={16} />
              )}
              {scanDropActive ? "PDFs hier ablegen" : "Rechnungen scannen"}
            </button>
            <input
              ref={scanInvoiceInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void scanInvoices(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        <section className="rounded-md border border-slate-300 bg-white shadow-grid">
          <div className="sticky top-0 z-50 flex flex-col gap-2 rounded-t-md border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur transition-shadow sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {dashboardView === "statistics" ? (
                  <BarChart3 aria-hidden="true" size={16} />
                ) : dashboardView === "files" ? (
                  <FileText aria-hidden="true" size={16} />
                ) : (
                  <Calculator aria-hidden="true" size={16} />
                )}
                {dashboardView === "statistics"
                  ? "Statistiken"
                  : dashboardView === "files"
                    ? "Steuerberater Ansicht"
                    : "Ausgaben-Tabelle"}
              </div>
              <select
                aria-label="Buchhaltungsjahr"
                value={accountingYear}
                onChange={(event) => setAccountingYear(event.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"
              >
                {accountingYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {dashboardView === "sheet" ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setColumnViewMenuOpen((current) => !current);
                        setActiveColumnMenu(null);
                        setEditingColumnType(null);
                      }}
                      className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${
                        columnViewMenuOpen
                          ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-800"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Columns3 aria-hidden="true" size={14} />
                      Spalten
                    </button>
                    {columnViewMenuOpen ? (
                      <div className="absolute right-0 top-10 z-40 w-72 rounded-md border border-slate-200 bg-white p-2 text-slate-900 shadow-lg">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-1 pb-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Sichtbare Spalten
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleColumnKeys(
                                new Set(
                                  columns
                                    .filter((column) => !defaultHiddenColumnKeys.has(column.key))
                                    .map((column) => column.key)
                                )
                              )
                            }
                            className="h-7 rounded px-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                          >
                            Standard
                          </button>
                        </div>
                        <div className="mt-2 grid max-h-80 gap-1 overflow-y-auto pr-1">
                          {columns.map((column) => (
                            <label
                              key={column.key}
                              className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-xs font-medium text-slate-800 transition hover:bg-slate-100"
                            >
                              <input
                                type="checkbox"
                                checked={visibleColumnKeys.has(column.key)}
                                onChange={() => toggleColumnVisibility(column.key)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-700"
                              />
                              <span className="min-w-0 truncate">{column.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <select
                    aria-label="Gruppierung"
                    value={groupingKey}
                    onChange={(event) => {
                      setColumnViewMenuOpen(false);
                      setActiveColumnMenu(null);
                      setEditingColumnType(null);
                      setGroupingKey(event.target.value as GroupingKey);
                    }}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition hover:bg-slate-50 focus:border-blue-500"
                  >
                    {(Object.keys(groupingControlLabels) as GroupingKey[]).map((key) => (
                      <option key={key} value={key}>
                        {groupingControlLabels[key]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sortierung"
                    value={sortKey}
                    onChange={(event) => {
                      setColumnViewMenuOpen(false);
                      setActiveColumnMenu(null);
                      setEditingColumnType(null);
                      setSortKey(event.target.value as SortKey);
                    }}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition hover:bg-slate-50 focus:border-blue-500"
                  >
                    {(Object.keys(sortControlLabels) as SortKey[]).map((key) => (
                      <option key={key} value={key}>
                        {sortControlLabels[key]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setColumnViewMenuOpen(false);
                      setActiveColumnMenu(null);
                      setEditingColumnType(null);
                      setSortDirection((currentDirection) =>
                        currentDirection === "asc" ? "desc" : "asc"
                      );
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    aria-label="Sortierreihenfolge wechseln"
                    title="Sortierreihenfolge wechseln"
                  >
                    <ArrowUpDown aria-hidden="true" size={14} />
                    {sortDirection === "asc" ? "Aufsteigend" : "Absteigend"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={showDocumentHints}
                    onClick={() => setShowDocumentHints((current) => !current)}
                    className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${
                      showDocumentHints
                        ? "border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    title={
                      showDocumentHints
                        ? "Dokumentenhinweise ausblenden und Zeilen weiß anzeigen"
                        : "Fehlende Dokumente mit roten und orangen Zeilen markieren"
                    }
                  >
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className={`h-2.5 w-2.5 rounded-sm ${showDocumentHints ? "bg-red-400" : "border border-slate-300 bg-white"}`} />
                      <span className={`h-2.5 w-2.5 rounded-sm ${showDocumentHints ? "bg-orange-300" : "border border-slate-300 bg-white"}`} />
                    </span>
                    {showDocumentHints ? "UX-Hinweise an" : "Basis weiß"}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedRows}
                    disabled={selectedRowIds.size === 0}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                    Auswahl loeschen
                  </button>
                  {focusedSelectedRow ? (
                    <span
                      className="max-w-72 truncate rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-900"
                      title={focusedSelectedRow.name || focusedSelectedRow.description}
                      aria-live="polite"
                    >
                      {selectedRowIds.size > 1 ? `${selectedRowIds.size} ausgewaehlt · ` : "Ausgewaehlt · "}
                      {focusedSelectedRow.name || focusedSelectedRow.description || "Ohne Name"}
                    </span>
                  ) : null}
                </>
              ) : null}
              {dashboardView !== "statistics" ? (
                <span className="text-xs text-slate-500">
                  {visibleRows.length}
                  {dashboardView === "files" ? ` von ${yearRows.length}` : ""} Positionen
                </span>
              ) : null}
            </div>
          </div>
          {dashboardView === "statistics" ? (
            <div className="grid gap-3 bg-slate-50 p-3 sm:p-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Jahresbrutto"
                  value={formatMoney(totals.annualGrossCents)}
                  tone="blue"
                />
                <Metric
                  label="Jahresnetto"
                  value={formatMoney(totals.annualNetCents)}
                  tone="green"
                />
                <Metric
                  label="Monatlich brutto"
                  value={formatMoney(Math.round(totals.annualGrossCents / 12))}
                  tone="amber"
                />
                <Metric
                  label="Monatlich netto"
                  value={formatMoney(Math.round(totals.annualNetCents / 12))}
                  tone="slate"
                />
              </section>
              <section className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Kostenstaerkster Monat"
                  value={
                    statisticsHighlights.highestMonth
                      ? `${statisticsHighlights.highestMonth.label}: ${formatMoney(statisticsHighlights.highestMonth.grossCents)}`
                      : "–"
                  }
                  tone="blue"
                />
                <Metric
                  label="Groesste Kategorie"
                  value={
                    statisticsHighlights.largestCategory
                      ? `${statisticsHighlights.largestCategory.label}: ${formatMoney(statisticsHighlights.largestCategory.grossCents)}`
                      : "–"
                  }
                  tone="amber"
                />
                <Metric
                  label="Belegabdeckung"
                  value={`${statisticsHighlights.receiptCoverage} %`}
                  tone="green"
                />
              </section>
              <section className="grid gap-3 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <MonthlyExpenseChart months={monthlyTotals} />
                </div>
                <CostTypeChart rows={groupedTotals.byCostType} />
              </section>
              <CategoryChart rows={groupedTotals.byCategory} />
              <section className="grid gap-3 lg:grid-cols-2">
                <GroupedTotals title="Kategorie" rows={groupedTotals.byCategory} />
                <GroupedTotals title="Fix/Variabel" rows={groupedTotals.byCostType} />
              </section>
            </div>
          ) : dashboardView === "files" ? (
            <AccountantFilesTable
              rows={visibleRows}
              loading={loading}
              accountingYear={accountingYear}
            />
          ) : (
            <div className="spreadsheet-scroll overflow-x-auto">
              <table
                className="w-full table-fixed border-collapse text-left text-xs"
                style={{ minWidth: tableMinWidth }}
              >
              <thead>
                <tr className="bg-[#2f6fa6] text-white">
                  <th className="sticky left-0 z-20 w-20 whitespace-nowrap border-r-4 border-r-slate-200 bg-[#2f6fa6] px-2 py-2 font-semibold">
                    <div className="flex h-8 items-center justify-center gap-2">
                      <input
                        type="checkbox"
                        aria-label="Alle sichtbaren Eintraege auswaehlen"
                        checked={allVisibleRowsSelected}
                        disabled={visibleRowIds.length === 0}
                        onChange={toggleVisibleRowsSelection}
                        className="h-4 w-4 rounded border-blue-200 bg-white text-blue-700"
                      />
                      <span>Aktion</span>
                    </div>
                  </th>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className={`relative ${column.width} ${getHeaderBorderClass(column)} px-2 py-2 align-top font-semibold`}
                    >
                      <div className="flex h-8 items-center justify-between gap-2">
                        <span className="min-w-0 whitespace-nowrap">{column.label}</span>
                        <button
                          type="button"
                          aria-label={`${column.label} Optionen`}
                          onClick={() => {
                            setColumnViewMenuOpen(false);
                            setActiveColumnMenu((current) =>
                              current === column.key ? null : column.key
                            );
                            setEditingColumnType(null);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-white transition hover:bg-blue-800 focus:bg-blue-800 focus:outline-none"
                        >
                          <MoreHorizontal aria-hidden="true" size={16} />
                        </button>
                      </div>
                      {activeColumnMenu === column.key ? (
                        <div className="absolute right-2 top-10 z-30 w-48 rounded-md border border-slate-200 bg-white p-2 text-left text-slate-900 shadow-lg">
                          <button
                            type="button"
                            onClick={() => setEditingColumnType(column.key)}
                            className="flex h-8 w-full items-center rounded px-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                          >
                            Feldtyp bearbeiten
                          </button>
                          {editingColumnType === column.key ? (
                            <select
                              aria-label={`${column.label} Spaltentyp`}
                              value={columnTypes[column.key]}
                              onChange={(event) =>
                                setColumnTypes((current) => ({
                                  ...current,
                                  [column.key]: event.target.value as ColumnType
                                }))
                              }
                              className="mt-2 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500"
                            >
                              {(Object.keys(columnTypeLabels) as ColumnType[]).map((type) => (
                                <option key={type} value={type}>
                                  {columnTypeLabels[type]}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-3 py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                        Tabelle wird geladen
                      </span>
                    </td>
                  </tr>
                ) : null}
                {!loading && visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-3 py-10 text-center text-slate-500">
                      {`Noch keine Ausgaben fuer ${accountingYear} erfasst.`}
                    </td>
                  </tr>
                ) : null}
                {(() => {
                  let rowIndex = 0;

                  return visibleRowGroups.map((group) => (
                    <Fragment key={group.key}>
                      {groupingKey !== "none" ? (
                        <tr className="bg-slate-100 text-slate-800">
                          <td
                            colSpan={visibleColumns.length + 1}
                            className="border-y border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                          >
                            <span>{group.label}</span>
                            <span className="ml-2 font-medium normal-case tracking-normal text-slate-500">
                              {group.rows.length} Positionen
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      {group.rows.map((row) => {
                        const index = rowIndex;
                        rowIndex += 1;
                        const isSelected = selectedRowIds.has(row.id);
                        const isPinnedSelectedRow = isSelected && pinnedSelectedRowId === row.id;
                        const netCents = getNetCents(row);
                        const annualGrossCents = getAnnualGrossCents(row);
                        const annualNetCents = getAnnualNetCents(row);
                        const monthlyGrossCents = getMonthlyGrossCents(row);
                        const monthlyNetCents = getMonthlyNetCents(row);
                        const documentWarning = showDocumentHints ? getDocumentWarning(row) : null;

                        return (
                          <tr
                            key={row.id}
                            className={`${documentWarning?.className ?? "bg-white"} ${
                              isPinnedSelectedRow
                                ? "shadow-[inset_0_0_0_2px_#2563eb] outline outline-2 outline-blue-600"
                                : isSelected
                                  ? "outline outline-2 outline-blue-500"
                                  : ""
                            } transition-[box-shadow,outline-color] duration-200`}
                            title={documentWarning?.message}
                          >
                      <td className="sticky left-0 z-10 border-r-4 border-r-slate-300 bg-inherit px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          aria-label="Eintrag auswaehlen"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(row.id)}
                          className="h-4 w-4 rounded border-slate-400 text-blue-700"
                        />
                      </td>
                      {isColumnVisible("year") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={row.year}
                            options={years}
                            onChange={(value) => patchRow(row.id, { year: value })}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("costType") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={row.costType}
                            options={costTypes}
                            onChange={(value) => patchRow(row.id, { costType: value as CostType })}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("interval") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={row.interval}
                            options={intervals}
                            onChange={(value) => {
                              const interval = value as Interval;
                              patchRow(row.id, {
                                interval,
                                paymentsPerYear:
                                  interval === "Monatlich"
                                    ? row.interval === "Monatlich"
                                      ? row.paymentsPerYear
                                      : 12
                                    : 1
                              });
                            }}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("category") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={row.category}
                            options={categories}
                            onChange={(value) => patchRow(row.id, { category: value })}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("name") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <input
                            value={row.name}
                            onChange={(event) => patchRow(row.id, { name: event.target.value })}
                            className="h-7 w-full rounded-sm border border-transparent bg-transparent px-2 text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("description") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <input
                            value={row.description}
                            onChange={(event) => patchRow(row.id, { description: event.target.value })}
                            className="h-7 w-full rounded-sm border border-transparent bg-transparent px-2 text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("invoiceNumber") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <input
                            value={row.invoiceNumber}
                            onChange={(event) =>
                              patchRow(row.id, { invoiceNumber: event.target.value })
                            }
                            className="h-7 w-full rounded-sm border border-transparent bg-transparent px-2 text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("startMonth") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={String(row.startMonth)}
                            options={months.map(String)}
                            onChange={(value) =>
                              patchRow(row.id, { startMonth: clamp(Number(value), 1, 12) })
                            }
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("paymentsPerYear") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={String(row.paymentsPerYear)}
                            options={row.interval === "Monatlich" ? paymentCountOptions : ["1"]}
                            onChange={(value) =>
                              patchRow(row.id, { paymentsPerYear: clamp(Number(value), 1, 12) })
                            }
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("vatRate") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <SelectCell
                            value={String(row.vatRate)}
                            options={vatRates.map(String)}
                            labels={Object.fromEntries(
                              vatRates.map((rate) => [String(rate), `${Math.round(rate * 100)}%`])
                            )}
                            onChange={(value) => updateVat(row.id, Number(value))}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("grossCents") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <MoneyCell
                            cents={row.grossCents}
                            onChange={(grossCents) => updateGross(row.id, grossCents)}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("netCents") ? (
                        <td className="border-r border-slate-300 px-1 py-1">
                          <MoneyCell
                            cents={netCents}
                            onChange={(updatedNetCents) => updateNet(row.id, updatedNetCents)}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("annualGrossCents") ? (
                        <td className="border-r-4 border-r-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                          {formatMoney(annualGrossCents)}
                        </td>
                      ) : null}
                      {isColumnVisible("annualNetCents") ? (
                        <td className="border-r-4 border-r-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                          {formatMoney(annualNetCents)}
                        </td>
                      ) : null}
                      {isColumnVisible("monthlyNetCents") ? (
                        <td className="border-r border-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                          {formatMoney(monthlyNetCents)}
                        </td>
                      ) : null}
                      {isColumnVisible("monthlyGrossCents") ? (
                        <td className="border-r-4 border-r-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                          {formatMoney(monthlyGrossCents)}
                        </td>
                      ) : null}
                      {isColumnVisible("invoiceFile") ? (
                        <td className="border-r-4 border-r-slate-300 px-1 py-1">
                          <PdfCell
                            rowId={row.id}
                            field="invoiceFile"
                            files={row.invoiceFile}
                            slotCount={getPdfSlotCount(row, row.invoiceFile)}
                            uploadingSlot={getUploadingSlot(uploadingCell, row.id, "invoiceFile")}
                            removingSlot={getUploadingSlot(removingCell, row.id, "invoiceFile")}
                            onUpload={uploadPdf}
                            onPaymentDateChange={updatePaymentDate}
                            onRemove={removePdf}
                          />
                        </td>
                      ) : null}
                      {isColumnVisible("cardStatementFile") ? (
                        <td className="border-r-4 border-r-slate-300 px-1 py-1">
                          <PdfCell
                            rowId={row.id}
                            field="cardStatementFile"
                            files={row.cardStatementFile}
                            slotCount={getPdfSlotCount(row, row.cardStatementFile)}
                            uploadingSlot={getUploadingSlot(uploadingCell, row.id, "cardStatementFile")}
                            removingSlot={getUploadingSlot(removingCell, row.id, "cardStatementFile")}
                            onUpload={uploadPdf}
                            onPaymentDateChange={updatePaymentDate}
                            onRemove={removePdf}
                          />
                        </td>
                      ) : null}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ));
                })()}
              </tbody>
              </table>
            </div>
          )}
        </section>

      </section>
      {pendingScanConfirmation ? (
        <BatchScanConfirmationDialog
          items={pendingScanConfirmation.items}
          scanning={scanningInvoice}
          onCancel={() => setPendingScanConfirmation(null)}
          onConfirm={confirmPendingScans}
        />
      ) : null}
      {pendingPlacementSuggestion ? (
        <PlacementSuggestionDialog
          suggestion={pendingPlacementSuggestion}
          onCancel={() => setPendingPlacementSuggestion(null)}
          onConfirm={() => applyPlacementSuggestion(pendingPlacementSuggestion)}
        />
      ) : null}
      <AccountingChat accountingYear={accountingYear} />
    </main>
  );
}

function AccountantFilesTable({
  rows,
  loading,
  accountingYear
}: {
  rows: ExpenseRow[];
  loading: boolean;
  accountingYear: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
            <th className="w-[34%] border-r border-slate-200 px-4 py-3">Name</th>
            <th className="w-[33%] border-r border-slate-200 px-4 py-3">Rechnungen</th>
            <th className="w-[33%] px-4 py-3">Kartenabrechnung</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                  Tabelle wird geladen
                </span>
              </td>
            </tr>
          ) : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                {`Keine Rechnungen oder Kartenabrechnungen fuer ${accountingYear} vorhanden.`}
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className={`border-t border-slate-200 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
            >
              <td className="border-r border-slate-200 px-4 py-3 align-top">
                <div className="font-semibold text-slate-950">
                  {row.name.trim() || row.description.trim() || row.category}
                </div>
                {row.name.trim() || row.description.trim() ? (
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {row.name.trim() && row.description.trim() ? row.description : row.category}
                  </div>
                ) : null}
              </td>
              <td className="border-r border-slate-200 px-4 py-3 align-top">
                <AttachmentDownloadList files={row.invoiceFile} emptyLabel="Keine Rechnung" />
              </td>
              <td className="px-4 py-3 align-top">
                <AttachmentDownloadList
                  files={row.cardStatementFile}
                  emptyLabel="Keine Kartenabrechnung"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlacementSuggestionDialog({
  suggestion,
  onCancel,
  onConfirm
}: {
  suggestion: PendingPlacementSuggestion;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-md rounded-md border border-slate-300 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">Zahlungen sortieren?</h2>
        </div>
        <div className="grid gap-3 px-4 py-4 text-sm text-slate-700">
          <p>
            Die Datei <span className="font-semibold text-slate-950">{suggestion.fileName}</span>{" "}
            passt nach Datum nicht zur Reihenfolge der Zahlungsplaetze.
          </p>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
            <div>
              {`Zahlung ${suggestion.fromSlot + 1}: ${suggestion.fromDateLabel}`}
            </div>
            <div>
              {`Zahlung ${suggestion.toSlot + 1}: ${suggestion.toDateLabel}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            So lassen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Zahlungen tauschen
          </button>
        </div>
      </section>
    </div>
  );
}

function AttachmentDownloadList({
  files,
  emptyLabel
}: {
  files: FileAttachmentList;
  emptyLabel: string;
}) {
  const attachments = files
    .map((file, index) => (file ? { file, index } : null))
    .filter((entry): entry is { file: FileAttachment; index: number } => entry !== null);

  if (attachments.length === 0) {
    return <span className="text-sm text-slate-400">{emptyLabel}</span>;
  }

  return (
    <div className="grid gap-2">
      {attachments.map(({ file, index }) => (
        <div key={`${file.path}-${index}`} className="grid gap-1">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {`Zahlung ${index + 1}`}
            {getAttachmentDateLabel(file) ? ` - ${getAttachmentDateLabel(file)}` : ""}
          </div>
          <a
            href={`/api/files/${encodeFilePath(file.path)}`}
            target="_blank"
            rel="noreferrer"
            download={file.name}
            className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
            title={file.name}
          >
            <Download aria-hidden="true" size={15} className="shrink-0" />
            <span className="min-w-0 truncate">{file.name}</span>
          </a>
        </div>
      ))}
    </div>
  );
}

function getAttachmentDateLabel(file: FileAttachment | null | undefined) {
  if (!file) {
    return "";
  }

  return formatDateLabel(file.paymentDate || file.invoiceDate);
}

function replaceAttachmentInRow(
  row: ExpenseRow,
  field: UploadField,
  slotIndex: number,
  attachment: FileAttachment
) {
  const attachments = [...row[field]];
  attachments[slotIndex] = attachment;
  return { ...row, [field]: attachments };
}

function getPlacementSuggestion(
  row: ExpenseRow,
  field: UploadField,
  changedSlotIndex: number
): PendingPlacementSuggestion | null {
  const attachments = row[field];
  const changedAttachment = attachments[changedSlotIndex];
  const changedDate = getAttachmentDateTime(changedAttachment);

  if (!changedAttachment || changedDate === null) {
    return null;
  }

  for (let index = 0; index < changedSlotIndex; index += 1) {
    const comparisonAttachment = attachments[index];
    const comparisonDate = getAttachmentDateTime(comparisonAttachment);

    if (comparisonAttachment && comparisonDate !== null && comparisonDate > changedDate) {
      return buildPlacementSuggestion({
        row,
        field,
        fromSlot: changedSlotIndex,
        toSlot: index,
        fromAttachment: changedAttachment,
        toAttachment: comparisonAttachment
      });
    }
  }

  for (let index = changedSlotIndex + 1; index < attachments.length; index += 1) {
    const comparisonAttachment = attachments[index];
    const comparisonDate = getAttachmentDateTime(comparisonAttachment);

    if (comparisonAttachment && comparisonDate !== null && comparisonDate < changedDate) {
      return buildPlacementSuggestion({
        row,
        field,
        fromSlot: changedSlotIndex,
        toSlot: index,
        fromAttachment: changedAttachment,
        toAttachment: comparisonAttachment
      });
    }
  }

  return null;
}

function buildPlacementSuggestion({
  row,
  field,
  fromSlot,
  toSlot,
  fromAttachment,
  toAttachment
}: {
  row: ExpenseRow;
  field: UploadField;
  fromSlot: number;
  toSlot: number;
  fromAttachment: FileAttachment;
  toAttachment: FileAttachment;
}): PendingPlacementSuggestion {
  return {
    rowId: row.id,
    field,
    fromSlot,
    toSlot,
    fromDateLabel: getAttachmentDateLabel(fromAttachment),
    toDateLabel: getAttachmentDateLabel(toAttachment),
    fileName: fromAttachment.name
  };
}

function getAttachmentDateTime(file: FileAttachment | null | undefined) {
  const value = file?.paymentDate || file?.invoiceDate;
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function formatDateLabel(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("de-AT");
}

function toDateInputValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function StatusBadge({
  loading,
  saving,
  dirty
}: {
  loading: boolean;
  saving: boolean;
  dirty: boolean;
}) {
  if (loading) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-600">
        <Loader2 aria-hidden="true" className="animate-spin" size={15} />
        Laden
      </span>
    );
  }

  if (saving) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm text-amber-900">
        <Loader2 aria-hidden="true" className="animate-spin" size={15} />
        Speichern
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-800">
      <Save aria-hidden="true" size={15} />
      {dirty ? "Aenderungen offen" : "Gespeichert"}
    </span>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    slate: "border-slate-300 bg-white text-slate-950"
  };

  return (
    <div className={`rounded-md border px-3 py-3 shadow-grid ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function getDefaultBatchDecisionMode(draft: ScanInvoiceDraft): BatchDecisionMode {
  if ((draft.lineItems?.length ?? 0) > 1) {
    return "oneTimeCombined";
  }

  return draft.classification === "monthly" ? "monthly" : "oneTimeCombined";
}

function getBatchDecision(mode: BatchDecisionMode): Omit<BatchScanDecision, "fileId"> {
  if (mode === "monthly") {
    return { classificationOverride: "monthly", splitMode: "combined" };
  }

  if (mode === "oneTimeSeparate") {
    return { classificationOverride: "oneTime", splitMode: "separate" };
  }

  return { classificationOverride: "oneTime", splitMode: "combined" };
}

function BatchScanConfirmationDialog({
  items,
  scanning,
  onCancel,
  onConfirm
}: {
  items: PendingBatchScanItem[];
  scanning: boolean;
  onCancel: () => void;
  onConfirm: (decisions: BatchScanDecision[]) => void;
}) {
  const [decisionModes, setDecisionModes] = useState<Record<string, BatchDecisionMode>>(() =>
    Object.fromEntries(items.map((item) => [item.fileId, getDefaultBatchDecisionMode(item.draft)]))
  );

  function setAllDecisionModes(mode: BatchDecisionMode) {
    setDecisionModes(
      Object.fromEntries(
        items.map((item) => [
          item.fileId,
          (item.draft.lineItems?.length ?? 0) > 1 || mode !== "oneTimeSeparate" ? mode : "oneTimeCombined"
        ])
      )
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">Rechnungen gesammelt einordnen</h2>
          <p className="mt-1 text-sm text-slate-600">
            {items.length === 1
              ? "1 Rechnung braucht noch eine Entscheidung."
              : `${items.length} Rechnungen brauchen noch eine Entscheidung.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setAllDecisionModes("monthly")}
            disabled={scanning}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Alle monatlich
          </button>
          <button
            type="button"
            onClick={() => setAllDecisionModes("oneTimeCombined")}
            disabled={scanning}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Alle einmalig
          </button>
          <button
            type="button"
            onClick={() => setAllDecisionModes("oneTimeSeparate")}
            disabled={scanning}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Positionen einzeln
          </button>
        </div>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-4 py-4">
          {items.map((item) => {
            const invoiceDate = new Date(item.draft.invoiceDate);
            const formattedDate = Number.isNaN(invoiceDate.getTime())
              ? "-"
              : invoiceDate.toLocaleDateString("de-AT");
            const lineItems = item.draft.lineItems ?? [];
            const hasLineItemSuggestion = lineItems.length > 1;

            return (
              <div key={item.fileId} className="rounded-md border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{item.file.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.draft.classification === "uncertain"
                        ? "Modell konnte die Art nicht sicher bestimmen"
                        : item.draft.classification === "monthly"
                          ? "Modell vermutet monatliche Ausgabe"
                          : "Modell vermutet einmalige Ausgabe"}
                    </div>
                  </div>
                  <select
                    value={decisionModes[item.fileId]}
                    onChange={(event) =>
                      setDecisionModes((current) => ({
                        ...current,
                        [item.fileId]: event.target.value as BatchDecisionMode
                      }))
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  >
                    <option value="monthly">Als monatlich speichern</option>
                    <option value="oneTimeCombined">Als einmalig speichern</option>
                    {hasLineItemSuggestion ? (
                      <option value="oneTimeSeparate">Einzeln speichern</option>
                    ) : null}
                  </select>
                </div>
                <div className="grid gap-2 px-4 py-4 text-sm text-slate-700">
                  <DraftRow label="Anbieter" value={item.draft.vendor || "-"} />
                  <DraftRow label="Leistung" value={item.draft.service || item.draft.description || "-"} />
                  <DraftRow label="Datum" value={formattedDate} />
                  <DraftRow label="Rechnungsnr." value={item.draft.invoiceId || "-"} />
                  <DraftRow label="Brutto" value={formatMoney(item.draft.grossCents)} />
                  <DraftRow label="Netto" value={formatMoney(item.draft.netCents)} />
                  <DraftRow label="USt" value={`${Math.round(item.draft.vatRate * 100)}%`} />
                  {hasLineItemSuggestion ? (
                    <div className="mt-3 rounded-md border border-blue-200 bg-blue-50">
                      <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-900">
                          {lineItems.length} Positionen erkannt
                        </span>
                        <span className="text-xs font-semibold text-blue-900">
                          {formatMoney(lineItems.reduce((sum, lineItem) => sum + lineItem.grossCents, 0))}
                        </span>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {lineItems.map((lineItem, index) => (
                          <div
                            key={`${lineItem.description}-${index}`}
                            className="grid grid-cols-[1fr_auto] gap-3 border-b border-blue-100 px-3 py-2 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <div className="break-words font-semibold text-slate-950">
                                {lineItem.description}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-600">
                                {lineItem.asin ? `ASIN ${lineItem.asin} · ` : ""}
                                {lineItem.category} · Netto {formatMoney(lineItem.netCents)} · USt{" "}
                                {Math.round(lineItem.vatRate * 100)}%
                              </div>
                            </div>
                            <div className="whitespace-nowrap text-right font-semibold text-slate-950">
                              {formatMoney(lineItem.grossCents)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={scanning}
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                items.map((item) => ({
                  fileId: item.fileId,
                  ...getBatchDecision(decisionModes[item.fileId] ?? getDefaultBatchDecisionMode(item.draft))
                }))
              )
            }
            disabled={scanning}
            className="inline-flex h-9 items-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {scanning ? <Loader2 aria-hidden="true" className="mr-2 animate-spin" size={15} /> : null}
            Alle uebernehmen
          </button>
        </div>
      </section>
    </div>
  );
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-950">{value}</span>
    </div>
  );
}

function SelectCell({
  value,
  options,
  labels,
  onChange
}: {
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1 text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function MoneyCell({
  cents,
  onChange
}: {
  cents: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-1 rounded-sm border border-transparent bg-transparent px-1 focus-within:border-blue-500 focus-within:bg-white">
      <input
        type="number"
        min={0}
        step="0.01"
        value={(cents / 100).toFixed(2)}
        onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) * 100)))}
        className="min-w-0 flex-1 bg-transparent text-right text-slate-900 outline-none"
      />
      <span className="text-[11px] font-semibold text-slate-500">EUR</span>
    </div>
  );
}

function PdfCell({
  rowId,
  field,
  files,
  slotCount,
  uploadingSlot,
  removingSlot,
  onUpload,
  onPaymentDateChange,
  onRemove
}: {
  rowId: string;
  field: UploadField;
  files: FileAttachmentList;
  slotCount: number;
  uploadingSlot: number | null;
  removingSlot: number | null;
  onUpload: (
    rowId: string,
    field: UploadField,
    slotIndex: number,
    file: File | null,
    paymentDate?: string
  ) => void;
  onPaymentDateChange: (
    rowId: string,
    field: UploadField,
    slotIndex: number,
    paymentDate: string
  ) => void;
  onRemove: (rowId: string, field: UploadField, slotIndex: number) => void;
}) {
  const visibleSlotCount = Math.max(1, slotCount, files.length);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [draftPaymentDates, setDraftPaymentDates] = useState<Record<number, string>>({});
  const selectedFile = files[selectedSlot] ?? null;
  const uploadedCount = files.filter(Boolean).length;
  const inputId = `${rowId}-${field}-${selectedSlot}`;
  const selectedPaymentDate =
    draftPaymentDates[selectedSlot] ??
    toDateInputValue(selectedFile?.paymentDate || selectedFile?.invoiceDate);

  useEffect(() => {
    if (selectedSlot >= visibleSlotCount) {
      setSelectedSlot(visibleSlotCount - 1);
    }
  }, [selectedSlot, visibleSlotCount]);

  return (
    <div className="grid min-h-[64px] gap-1">
      <div className="flex items-center gap-1">
        {visibleSlotCount > 1 ? (
          <select
            aria-label="PDF-Option"
            value={selectedSlot}
            onChange={(event) => setSelectedSlot(Number(event.target.value))}
            className="h-7 w-28 shrink-0 rounded-sm border border-slate-200 bg-white px-2 text-slate-900 outline-none focus:border-blue-500"
          >
            {Array.from({ length: visibleSlotCount }, (_item, index) => (
              <option key={index} value={index}>
                {`Zahlung ${index + 1}`}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex h-7 shrink-0 items-center rounded-sm border border-slate-200 bg-white px-2 font-semibold text-slate-700">
            Zahlung 1
          </span>
        )}
        {visibleSlotCount > 1 ? (
          <span className="inline-flex h-7 shrink-0 items-center rounded-sm bg-slate-100 px-2 text-[11px] font-semibold text-slate-600">
            {uploadedCount}/{visibleSlotCount}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <label
            htmlFor={inputId}
            className="inline-flex h-7 w-8 cursor-pointer items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
            title={selectedFile ? "PDF ersetzen" : "PDF hochladen"}
          >
            {uploadingSlot === selectedSlot ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={14} />
            ) : (
              <Upload aria-hidden="true" size={14} />
            )}
          </label>
          {selectedFile ? (
            <button
              type="button"
              onClick={() => onRemove(rowId, field, selectedSlot)}
              disabled={removingSlot === selectedSlot}
              className="inline-flex h-7 w-8 items-center justify-center rounded border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 disabled:hover:bg-white"
              title="PDF entfernen"
              aria-label="PDF entfernen"
            >
              {removingSlot === selectedSlot ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={14} />
              ) : (
                <Trash2 aria-hidden="true" size={14} />
              )}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {selectedFile ? (
          <>
            <a
              href={`/api/files/${encodeFilePath(selectedFile.path)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-blue-800 underline-offset-2 hover:underline"
              title={selectedFile.name}
            >
              <FileText aria-hidden="true" size={14} className="shrink-0" />
              <span className="truncate">{selectedFile.name}</span>
            </a>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500">Datum</span>
              <input
                type="date"
                aria-label="Zahlungsdatum"
                value={selectedPaymentDate}
                onChange={(event) => {
                  const paymentDate = event.target.value;
                  setDraftPaymentDates((currentDates) => ({
                    ...currentDates,
                    [selectedSlot]: paymentDate
                  }));
                  onPaymentDateChange(rowId, field, selectedSlot, paymentDate);
                }}
                className="h-7 w-32 rounded-sm border border-slate-200 bg-white px-2 text-slate-900 outline-none focus:border-blue-500"
              />
            </div>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-slate-400">Keine PDF hochgeladen</span>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onUpload(rowId, field, selectedSlot, event.target.files?.[0] ?? null, selectedPaymentDate);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function GroupedTotals({
  title,
  rows
}: {
  title: string;
  rows: { label: string; grossCents: number; netCents: number }[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-grid">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
        Summe nach {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-500">
              <th className="px-3 py-2 text-left">{title}</th>
              <th className="px-3 py-2 text-right">Jahresbrutto</th>
              <th className="px-3 py-2 text-right">Jahresnetto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(row.grossCents)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(row.netCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type StatisticsRow = { label: string; grossCents: number; netCents: number };

function MonthlyExpenseChart({ months }: { months: StatisticsRow[] }) {
  const maxValue = Math.max(1, ...months.map((month) => month.grossCents));

  return (
    <section className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Monatliche Ausgaben</div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Brutto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Netto
          </span>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="grid h-64 min-w-[720px] grid-cols-12 gap-2 border-b border-slate-200">
          {months.map((month) => (
            <div key={month.label} className="flex min-w-0 flex-col items-center justify-end gap-2">
              <div className="text-center text-[10px] font-semibold leading-tight text-slate-600">
                {formatMoney(month.grossCents)}
              </div>
              <div className="flex h-44 w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-t bg-blue-600 transition-[height] sm:w-4"
                  style={{ height: `${Math.max(2, (month.grossCents / maxValue) * 100)}%` }}
                  title={`${month.label} brutto: ${formatMoney(month.grossCents)}`}
                />
                <div
                  className="w-3 rounded-t bg-emerald-500 transition-[height] sm:w-4"
                  style={{ height: `${Math.max(2, (month.netCents / maxValue) * 100)}%` }}
                  title={`${month.label} netto: ${formatMoney(month.netCents)}`}
                />
              </div>
              <div className="pb-2 text-xs font-semibold text-slate-600">{month.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CostTypeChart({ rows }: { rows: StatisticsRow[] }) {
  const fixed = rows.find((row) => row.label === "Fix")?.grossCents ?? 0;
  const variable = rows.find((row) => row.label === "Variabel")?.grossCents ?? 0;
  const total = fixed + variable;
  const fixedShare = total === 0 ? 0 : Math.round((fixed / total) * 100);

  return (
    <section className="rounded-md border border-slate-300 bg-white shadow-grid">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
        Kostenstruktur
      </div>
      <div className="flex h-[296px] flex-col items-center justify-center gap-5 p-4">
        <div
          className="relative h-40 w-40 rounded-full"
          style={{
            background: `conic-gradient(#2563eb 0 ${fixedShare}%, #f59e0b ${fixedShare}% 100%)`
          }}
          role="img"
          aria-label={`${fixedShare} Prozent Fixkosten, ${100 - fixedShare} Prozent variable Kosten`}
        >
          <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-2xl font-bold text-slate-950">{fixedShare} %</span>
            <span className="text-xs font-semibold text-slate-500">Fixkosten</span>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-semibold text-blue-700">Fix</div>
            <div className="mt-0.5 text-slate-600">{formatMoney(fixed)}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-amber-600">Variabel</div>
            <div className="mt-0.5 text-slate-600">{formatMoney(variable)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryChart({ rows }: { rows: StatisticsRow[] }) {
  const topRows = [...rows].sort((left, right) => right.grossCents - left.grossCents).slice(0, 8);
  const maxValue = Math.max(1, ...topRows.map((row) => row.grossCents));

  return (
    <section className="rounded-md border border-slate-300 bg-white shadow-grid">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
        Groesste Ausgabenkategorien
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {topRows.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Kategorien fuer dieses Jahr vorhanden.</div>
        ) : (
          topRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[minmax(100px,1fr)_2fr_auto] items-center gap-3">
              <div className="truncate text-xs font-semibold text-slate-700" title={row.label}>
                {row.label}
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${(row.grossCents / maxValue) * 100}%` }}
                />
              </div>
              <div className="w-24 text-right text-xs font-medium text-slate-600">
                {formatMoney(row.grossCents)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function getTotals(rows: ExpenseRow[]) {
  return rows.reduce(
    (totals, row) => ({
      annualGrossCents: totals.annualGrossCents + getAnnualGrossCents(row),
      annualNetCents: totals.annualNetCents + getAnnualNetCents(row)
    }),
    { annualGrossCents: 0, annualNetCents: 0 }
  );
}

function getMonthlyTotals(rows: ExpenseRow[]): StatisticsRow[] {
  const monthLabels = ["Jan", "Feb", "Maer", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const totals = monthLabels.map((label) => ({ label, grossCents: 0, netCents: 0 }));

  for (const row of rows) {
    const paymentCount = row.interval === "Jaehrlich" ? 1 : row.paymentsPerYear;

    for (let paymentIndex = 0; paymentIndex < paymentCount; paymentIndex += 1) {
      const monthIndex = (row.startMonth - 1 + paymentIndex) % 12;
      totals[monthIndex].grossCents += row.grossCents;
      totals[monthIndex].netCents += getNetCents(row);
    }
  }

  return totals;
}

function getGroupedTotals(rows: ExpenseRow[]) {
  const byCategory = new Map<string, { label: string; grossCents: number; netCents: number }>();
  const byCostType = new Map<string, { label: string; grossCents: number; netCents: number }>();

  for (const row of rows) {
    addToGroup(byCategory, row.category, row);
    addToGroup(byCostType, row.costType, row);
  }

  return {
    byCategory: Array.from(byCategory.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "de")
    ),
    byCostType: Array.from(byCostType.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "de")
    )
  };
}

function groupRows(rows: ExpenseRow[], groupingKey: GroupingKey) {
  if (groupingKey === "none") {
    return [{ key: "all", label: "Alle Positionen", rows }];
  }

  const groups = new Map<string, ExpenseRow[]>();

  for (const row of rows) {
    const groupValue = getRowGroupValue(row, groupingKey);
    groups.set(groupValue, [...(groups.get(groupValue) ?? []), row]);
  }

  return getGroupOrder(groupingKey, groups).map((groupValue) => ({
    key: `${groupingKey}-${groupValue}`,
    label: getRowGroupLabel(groupValue, groupingKey),
    rows: groups.get(groupValue) ?? []
  }));
}

function getRowGroupValue(row: ExpenseRow, groupingKey: Exclude<GroupingKey, "none">) {
  if (groupingKey === "interval") {
    return row.interval;
  }

  if (groupingKey === "costType") {
    return row.costType;
  }

  return row.category || "Ohne Kategorie";
}

function getGroupOrder(
  groupingKey: Exclude<GroupingKey, "none">,
  groups: Map<string, ExpenseRow[]>
) {
  if (groupingKey === "interval") {
    return intervals.filter((interval) => groups.has(interval));
  }

  if (groupingKey === "costType") {
    return costTypes.filter((costType) => groups.has(costType));
  }

  return Array.from(groups.keys()).sort((left, right) => left.localeCompare(right, "de"));
}

function getRowGroupLabel(groupValue: string, groupingKey: Exclude<GroupingKey, "none">) {
  if (groupingKey === "interval" && isInterval(groupValue)) {
    return intervalGroupLabels[groupValue];
  }

  return groupValue;
}

function isInterval(value: string): value is Interval {
  return intervals.includes(value as Interval);
}

function sortRows(rows: ExpenseRow[], sortKey: SortKey, sortDirection: SortDirection) {
  const directionMultiplier = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const result = compareRowsBySortKey(left, right, sortKey);

    if (result !== 0) {
      return result * directionMultiplier;
    }

    return compareRowsByYearMonth(left, right);
  });
}

function compareRowsBySortKey(left: ExpenseRow, right: ExpenseRow, sortKey: SortKey) {
  if (sortKey === "name") {
    return left.name.localeCompare(right.name, "de");
  }

  if (sortKey === "description") {
    return left.description.localeCompare(right.description, "de");
  }

  if (sortKey === "invoiceNumber") {
    return left.invoiceNumber.localeCompare(right.invoiceNumber, "de", { numeric: true });
  }

  if (sortKey === "category") {
    return left.category.localeCompare(right.category, "de");
  }

  if (sortKey === "startMonth") {
    return left.startMonth - right.startMonth;
  }

  if (sortKey === "grossCents") {
    return left.grossCents - right.grossCents;
  }

  if (sortKey === "netCents") {
    return getNetCents(left) - getNetCents(right);
  }

  if (sortKey === "annualGrossCents") {
    return getAnnualGrossCents(left) - getAnnualGrossCents(right);
  }

  return getAnnualNetCents(left) - getAnnualNetCents(right);
}

function hasAttachedPdf(row: ExpenseRow) {
  return row.invoiceFile.some(Boolean) || row.cardStatementFile.some(Boolean);
}

function getDocumentWarning(row: ExpenseRow) {
  const hasInvoice = row.invoiceFile.some(Boolean);
  const hasCardStatement = row.cardStatementFile.some(Boolean);

  if (!hasInvoice && !hasCardStatement) {
    return {
      className: "bg-red-300",
      message: "Rechnung und Kartenabrechnung fehlen."
    };
  }

  if (!hasInvoice) {
    return {
      className: "bg-orange-200",
      message: "Rechnung fehlt."
    };
  }

  if (!hasCardStatement) {
    return {
      className: "bg-orange-200",
      message: "Kartenabrechnung fehlt."
    };
  }

  return null;
}

function compareRowsByYearMonth(left: ExpenseRow, right: ExpenseRow) {
  const leftYear = Number(left.year);
  const rightYear = Number(right.year);

  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  if (left.startMonth !== right.startMonth) {
    return left.startMonth - right.startMonth;
  }

  return left.description.localeCompare(right.description, "de");
}

function compareYearStrings(left: string, right: string) {
  const leftYear = Number(left);
  const rightYear = Number(right);

  if (Number.isFinite(leftYear) && Number.isFinite(rightYear)) {
    return leftYear - rightYear;
  }

  return left.localeCompare(right, "de");
}

function upsertScannedRow(rows: ExpenseRow[], scannedRow: ExpenseRow) {
  const existingIndex = rows.findIndex((row) => row.id === scannedRow.id);

  if (existingIndex === -1) {
    return [...rows, scannedRow];
  }

  return rows.map((row, index) => (index === existingIndex ? scannedRow : row));
}

function addToGroup(
  group: Map<string, { label: string; grossCents: number; netCents: number }>,
  label: string,
  row: ExpenseRow
) {
  const current = group.get(label) ?? { label, grossCents: 0, netCents: 0 };
  current.grossCents += getAnnualGrossCents(row);
  current.netCents += getAnnualNetCents(row);
  group.set(label, current);
}

function getNetCents(row: ExpenseRow) {
  return row.netCents;
}

function getPdfSlotCount(row: ExpenseRow, files: FileAttachmentList) {
  const paymentSlots = row.interval === "Monatlich" ? row.paymentsPerYear : 1;
  return Math.max(1, paymentSlots, files.length);
}

function getUploadingSlot(uploadingCell: string | null, rowId: string, field: UploadField) {
  const prefix = `${rowId}-${field}-`;
  if (!uploadingCell?.startsWith(prefix)) {
    return null;
  }

  const slotIndex = Number(uploadingCell.slice(prefix.length));
  return Number.isFinite(slotIndex) ? slotIndex : null;
}

function trimTrailingEmptyAttachments(attachments: FileAttachmentList) {
  const trimmed = [...attachments];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === null) {
    trimmed.pop();
  }

  return trimmed;
}

function getAnnualGrossCents(row: ExpenseRow) {
  if (row.interval === "Jaehrlich") {
    return row.grossCents;
  }

  return row.grossCents * row.paymentsPerYear;
}

function getAnnualNetCents(row: ExpenseRow) {
  if (row.interval === "Jaehrlich") {
    return getNetCents(row);
  }

  return getNetCents(row) * row.paymentsPerYear;
}

function getMonthlyGrossCents(row: ExpenseRow) {
  return Math.round(getAnnualGrossCents(row) / 12);
}

function getMonthlyNetCents(row: ExpenseRow) {
  return Math.round(getAnnualNetCents(row) / 12);
}

function getNetFromGross(grossCents: number, vatRate: number) {
  return Math.round(grossCents / (1 + vatRate));
}

function getGrossFromNet(netCents: number, vatRate: number) {
  return Math.round(netCents * (1 + vatRate));
}

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function encodeFilePath(filePath: string) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function getHeaderBorderClass(column: ColumnDefinition) {
  return column.separatorAfter ? "border-r-4 border-r-slate-200" : "border-r border-blue-300";
}

function getColumnWidthPx(widthClass: string) {
  const widthByClass: Record<string, number> = {
    "w-20": 80,
    "w-28": 112,
    "w-36": 144,
    "w-40": 160,
    "w-48": 192,
    "w-56": 224,
    "w-72": 288,
    "w-96": 384
  };

  return widthByClass[widthClass] ?? 160;
}
