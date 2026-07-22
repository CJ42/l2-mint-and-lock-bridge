export interface LogEntry {
  status: string
  [key: string]: unknown
}

export type Log = (entry: LogEntry) => void

export function logJson(entry: LogEntry): void {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...entry,
      },
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    ),
  )
}
