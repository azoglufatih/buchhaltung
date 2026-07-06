"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  X
} from "lucide-react";
import type { ChatMessage, ChatResponse, ChatSource } from "@/app/lib/types";

const STORAGE_KEY = "buchhaltung-chat-history-v1";
const MAX_STORED_MESSAGES = 40;

type StoredChatMessage = ChatMessage & {
  id: string;
  sources?: ChatSource[];
};

const suggestions = [
  "Wie hoch sind meine Bruttoausgaben im ausgewählten Jahr?",
  "Welche Rechnungen haben 20 % Umsatzsteuer?",
  "Fasse meine größten Kostenpositionen zusammen."
];

export function AccountingChat({ accountingYear }: { accountingYear: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter(isStoredMessage).slice(-MAX_STORED_MESSAGES));
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))
    );
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function submitQuestion(question: string) {
    const content = question.trim();
    if (!content || loading) return;

    const userMessage: StoredChatMessage = {
      id: createMessageId(),
      role: "user",
      content
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const apiMessages = nextMessages
        .slice(-12)
        .map<ChatMessage>(({ role, content: messageContent }) => ({
          role,
          content: messageContent
        }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, accountingYear })
      });
      const payload = (await response.json()) as ChatResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Die Antwort konnte nicht geladen werden.");
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: payload.answer,
          sources: payload.sources
        }
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Die Antwort konnte nicht geladen werden."
      );
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitQuestion(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion(input);
    }
  }

  function clearHistory() {
    setMessages([]);
    setError(null);
    window.localStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 sm:bottom-6 sm:right-6"
        aria-label="Buchhaltungsassistent öffnen"
        title="Buchhaltungsassistent"
      >
        <MessageCircle aria-hidden="true" size={25} />
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Buchhaltungsassistent"
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100vh-3rem))] sm:w-[420px] sm:rounded-xl sm:border sm:border-slate-300"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600">
            <Bot aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Buchhaltungsassistent</h2>
            <p className="truncate text-xs text-slate-300">Lokal · Nur Lesezugriff · Jahr {accountingYear}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearHistory}
            disabled={messages.length === 0 || loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Chatverlauf löschen"
            title="Chatverlauf löschen"
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-800 hover:text-white"
            aria-label="Chat schließen"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col justify-center">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MessageCircle aria-hidden="true" className="text-blue-700" size={18} />
                Fragen zu Ausgaben und Rechnungen
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                Ich durchsuche deine gespeicherten Positionen und vorhandenen PDF-Dokumente. Allgemeine Antworten kennzeichne ich ausdrücklich.
              </p>
            </div>
            <div className="mt-3 grid gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitQuestion(suggestion)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[88%] ${message.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-5 shadow-sm ${
                      message.role === "user"
                        ? "rounded-br-sm bg-blue-700 text-white"
                        : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    {message.content}
                  </div>
                  {message.role === "assistant" && message.sources?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Quellen">
                      {message.sources.map((source, index) =>
                        source.href ? (
                          <a
                            key={`${source.type}-${source.rowId}-${index}`}
                            href={source.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                            title={source.label}
                          >
                            <FileText aria-hidden="true" size={11} />
                            <span className="max-w-48 truncate">{source.label}</span>
                            <ExternalLink aria-hidden="true" size={10} />
                          </a>
                        ) : (
                          <span
                            key={`${source.type}-${source.rowId}-${index}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
                            title={source.label}
                          >
                            <span className="max-w-48 truncate">Position: {source.label}</span>
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600 shadow-sm">
                  <Loader2 aria-hidden="true" className="animate-spin text-blue-700" size={16} />
                  Antwort wird erstellt …
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3">
        {error ? (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            {error}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-lg border border-slate-300 bg-white p-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 4_000))}
            onKeyDown={handleInputKeyDown}
            rows={1}
            maxLength={4_000}
            disabled={loading}
            placeholder="Frage zu Rechnungen, Kosten, USt. …"
            aria-label="Nachricht"
            className="max-h-28 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Nachricht senden"
          >
            {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={17} /> : <Send aria-hidden="true" size={17} />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">
          Enter sendet · Shift + Enter fügt eine Zeile ein
        </p>
      </form>
    </section>
  );
}

function createMessageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function isStoredMessage(value: unknown): value is StoredChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredChatMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
}
