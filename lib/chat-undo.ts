/** What the chat shows after Undo: the old thread, unless the business changed meanwhile (then leave the new one alone). */
export function restoreThread<T extends { base: string }>(current: T | null, prev: T): T | null {
  return current?.base === prev.base ? prev : current;
}
