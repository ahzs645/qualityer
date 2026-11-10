// The original app's native SQLite importers, reused as-is (untyped JS).
declare module '*/native-project-import.mjs' {
  import type { Database } from 'sql.js'
  export function nativeProjectChoices(db: Database): { format: string; projects: { id: string | number; name?: string }[] } | null
  export function readNativeProject(db: Database, options?: { projectId?: string | number }): any
}
