import { promises as fs } from "fs";
import path from "path";

export type ActivityLogLevel = "info" | "success" | "warning" | "error";
export type ActivityLogSource = "scanner" | "model" | "storage";

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  level: ActivityLogLevel;
  source: ActivityLogSource;
  message: string;
  scanId?: string;
  details?: Record<string, string | number | boolean | null>;
};

const LOG_FILE = path.join(process.cwd(), "data", "activity-log.jsonl");
const MAX_READ_ENTRIES = 400;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export async function recordActivity(
  entry: Omit<ActivityLogEntry, "id" | "timestamp">
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await rotateLogIfNeeded();
    const completeEntry: ActivityLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    await fs.appendFile(LOG_FILE, `${JSON.stringify(completeEntry)}\n`, "utf8");
  } catch (error) {
    console.error("Activity log could not be written:", error);
  }
}

export async function readActivityLog(): Promise<ActivityLogEntry[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_READ_ENTRIES)
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line) as ActivityLogEntry;
          return isActivityLogEntry(entry) ? [entry] : [];
        } catch {
          return [];
        }
      })
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function clearActivityLog() {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, "", "utf8");
}

async function rotateLogIfNeeded() {
  try {
    const stats = await fs.stat(LOG_FILE);
    if (stats.size <= MAX_LOG_BYTES) {
      return;
    }
    const entries = await readActivityLog();
    await fs.writeFile(
      LOG_FILE,
      entries
        .reverse()
        .slice(-Math.floor(MAX_READ_ENTRIES / 2))
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8"
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function isActivityLogEntry(value: ActivityLogEntry) {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.message === "string" &&
    ["info", "success", "warning", "error"].includes(value.level) &&
    ["scanner", "model", "storage"].includes(value.source)
  );
}
