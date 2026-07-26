import { arbitrumSepolia, baseSepolia } from "viem/chains";

export interface LogEntry {
  chain?: string;
  status: string;
  message: string;
}

export type Log = (entry: LogEntry) => void;

const COLUMN_GAP = "  ";

let hasPrintedTopHeader = false;

export function logTerminal(entry: LogEntry): void {
  // print initial top header
  if (!hasPrintedTopHeader) printHeader();

  const date = formatDate(new Date()).padEnd(columnWidths.date);
  const chainName = entry.chain
    ? (chainLabels[entry.chain] ?? entry.chain)
    : "Relayer";
  const chain = chainName.padEnd(columnWidths.chain);
  const status = entry.status.padEnd(columnWidths.status);

  console.log(
    [
      colorize(date, colors.gray),
      colorize(chain, colors.cyan),
      colorize(status, getStatusColor(entry.status)),
      entry.message,
    ].join(COLUMN_GAP),
  );
}

function printHeader(): void {
  hasPrintedTopHeader = true;
  console.log(
    [
      colorize("Date (timestamp)".padEnd(columnWidths.date), colors.bold),
      colorize("Chain".padEnd(columnWidths.chain), colors.bold),
      colorize("Status".padEnd(columnWidths.status), colors.bold),
      colorize("Message", colors.bold),
    ].join(COLUMN_GAP),
  );
}

function formatDate(date: Date): string {
  const isoDate = date.toISOString();
  return `${isoDate.slice(0, 10)} (${isoDate.slice(11, 19)})`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "shutdown-requested":
      return colors.orange;
    case "watcher-stopped":
    case "relayer-stopped":
      return colors.red;
    case "finalized":
      return colors.green;
  }

  if (status.includes("failed") || status.includes("rejected")) {
    return colors.red;
  }

  if (status.includes("retry")) {
    return colors.yellow;
  }

  if (status.includes("updated")) {
    return colors.green;
  }

  return colors.blue;
}

function colorize(value: string, color: string): string {
  // detect if we are running an interactive terminal. Or if we are piping the terminal stdout
  if (!process.stdout.isTTY) return value;
  return `${color}${value}${colors.reset}`;
}

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
} as const;

const columnWidths = {
  date: 24,
  chain: 22,
  status: 22,
} as const;

const chainLabels: Record<string, string> = {
  baseSepolia: `🟦 ${baseSepolia.name}`,
  arbitrumSepolia: `⬜️ ${arbitrumSepolia.name}`,
};
