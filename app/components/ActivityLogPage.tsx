"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleX,
  RefreshCw,
  Trash2
} from "lucide-react";
import type { ActivityLogEntry, ActivityLogLevel } from "@/app/lib/activity-log";

const levelStyles: Record<ActivityLogLevel, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-900"
};

const sourceLabels = {
  scanner: "Scanner",
  model: "Lokales Modell",
  storage: "Speicher"
};

export function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const response = await fetch("/api/activity-log", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Das Aktivitaetsprotokoll konnte nicht geladen werden.");
      }
      const payload = (await response.json()) as { entries: ActivityLogEntry[] };
      setEntries(payload.entries);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unbekannter Protokollfehler.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    const interval = window.setInterval(() => void loadEntries(), 2_000);
    return () => window.clearInterval(interval);
  }, [loadEntries]);

  async function clearEntries() {
    if (!window.confirm("Aktivitaetsprotokoll wirklich leeren?")) {
      return;
    }
    const response = await fetch("/api/activity-log", { method: "DELETE" });
    if (response.ok) {
      setEntries([]);
      setError(null);
    } else {
      setError("Das Aktivitaetsprotokoll konnte nicht geleert werden.");
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Lokale Buchhaltung
            </p>
            <div className="mt-1 flex items-center gap-3">
              <Activity aria-hidden="true" className="text-blue-700" size={26} />
              <div>
                <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                  Hintergrundaktivitaeten
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Automatische Aktualisierung alle zwei Sekunden
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-grid hover:bg-slate-50"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Zurueck
            </Link>
            <button
              type="button"
              onClick={() => void loadEntries(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-grid hover:bg-slate-50"
            >
              <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : ""} size={16} />
              Aktualisieren
            </button>
            <button
              type="button"
              onClick={() => void clearEntries()}
              disabled={entries.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 shadow-grid hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 aria-hidden="true" size={16} />
              Leeren
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-4 py-3 shadow-grid">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            Live-Protokoll
          </div>
          <span className="text-sm text-slate-500">{entries.length} Eintraege</span>
        </div>

        <section className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-grid">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
              <RefreshCw aria-hidden="true" className="animate-spin" size={17} />
              Protokoll wird geladen
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-slate-500">
              Noch keine Aktivitaeten. Starte einen Rechnungsscan, um den Ablauf hier zu sehen.
            </div>
          ) : (
            <ol className="divide-y divide-slate-200">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[150px_1fr]">
                  <div className="text-xs text-slate-500">
                    <div className="font-semibold text-slate-700">{formatTimestamp(entry.timestamp)}</div>
                    <div className="mt-1">{sourceLabels[entry.source]}</div>
                    {entry.scanId ? (
                      <div className="mt-1 font-mono text-[10px]" title={entry.scanId}>
                        Scan {entry.scanId.slice(0, 8)}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="flex items-start gap-2">
                      <LevelIcon level={entry.level} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{entry.message}</p>
                        {entry.details && Object.keys(entry.details).length > 0 ? (
                          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            {Object.entries(entry.details).map(([key, value]) => (
                              <div key={key} className="flex gap-1">
                                <dt className="font-semibold text-slate-500">{formatDetailKey(key)}:</dt>
                                <dd className="break-all">{formatDetailValue(key, value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
    </main>
  );
}

function LevelIcon({ level }: { level: ActivityLogLevel }) {
  const className = `mt-0.5 shrink-0 rounded-full border p-1 ${levelStyles[level]}`;
  if (level === "success") return <CheckCircle2 aria-hidden="true" className={className} size={23} />;
  if (level === "warning") return <AlertTriangle aria-hidden="true" className={className} size={23} />;
  if (level === "error") return <CircleX aria-hidden="true" className={className} size={23} />;
  return <Activity aria-hidden="true" className={className} size={23} />;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "medium" });
}

function formatDetailKey(key: string) {
  const labels: Record<string, string> = {
    filename: "Datei",
    bytes: "Groesse",
    pages: "Seiten",
    durationMs: "Dauer",
    totalDurationMs: "Gesamtdauer",
    loadDurationMs: "Ladezeit",
    evaluationDurationMs: "Modellzeit",
    outputTokens: "Ausgabetokens",
    model: "Modell",
    endpoint: "Endpunkt",
    vendor: "Anbieter",
    invoiceId: "Rechnungsnr.",
    classification: "Einordnung",
    grossCents: "Brutto",
    vatRate: "USt",
    lineItems: "Positionen",
    error: "Fehler",
    result: "Ergebnis",
    description: "Beschreibung",
    rowId: "Zeilen-ID"
  };
  return labels[key] ?? key;
}

function formatDetailValue(key: string, value: string | number | boolean | null) {
  if (value === null || value === "") return "-";
  if (key === "bytes" && typeof value === "number") return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (key.toLowerCase().includes("duration") && typeof value === "number") return `${(value / 1000).toFixed(2)} s`;
  if (key === "grossCents" && typeof value === "number") return `${(value / 100).toFixed(2)} EUR`;
  if (key === "vatRate" && typeof value === "number") return `${Math.round(value * 100)} %`;
  return String(value);
}
