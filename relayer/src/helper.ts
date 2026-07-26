

export function getErrorMessage({ error }: { error: unknown }): string {
    return error instanceof Error ? error.message : String(error)
  }