import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { UPLOAD_DIR } from "@/app/lib/expenses";

const execFileAsync = promisify(execFile);
const textCache = new Map<string, { modifiedAt: number; text: string }>();

export async function extractStoredPdfText(relativePath: string) {
  const absolutePath = resolveStoredPdfPath(relativePath);
  const stats = await fs.stat(absolutePath);
  const cached = textCache.get(absolutePath);

  if (cached?.modifiedAt === stats.mtimeMs) {
    return cached.text;
  }

  let text = "";
  for (const command of getPdftotextCommands()) {
    try {
      const result = await execFileAsync(command, ["-layout", absolutePath, "-"], {
        maxBuffer: 1024 * 1024 * 8,
        timeout: 30_000
      });
      if (result.stdout.trim()) {
        text = normalizePdfText(result.stdout);
        break;
      }
    } catch {
      // Try the next common Poppler installation path.
    }
  }

  if (!text) {
    text = await extractLoosePdfText(absolutePath);
  }

  textCache.set(absolutePath, { modifiedAt: stats.mtimeMs, text });
  return text;
}

function resolveStoredPdfPath(relativePath: string) {
  const root = path.resolve(UPLOAD_DIR);
  const absolutePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Dateipfad nicht erlaubt.");
  }

  return absolutePath;
}

async function extractLoosePdfText(absolutePath: string) {
  const buffer = await fs.readFile(absolutePath);
  const raw = buffer.toString("latin1");
  const literalStrings = Array.from(raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/g))
    .map((match) => decodePdfLiteral(match[0].slice(1, -1)))
    .join(" ");
  const looseText = raw.replace(/[^\x20-\x7eäöüÄÖÜß€]+/g, " ");
  return normalizePdfText(`${literalStrings} ${looseText}`);
}

function getPdftotextCommands() {
  return ["pdftotext", "/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"];
}

function normalizePdfText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
