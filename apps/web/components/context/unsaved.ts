// One document is edited at a time, so one flag is enough: DocPane sets it while its text differs from what it opened.
// Anything that would close that editor (Cancel, another document, Back, a workspace or sidebar link) asks first.
const DISCARD = "Discard your unsaved changes to this document?";
let unsaved = false;

export function setUnsaved(value: boolean) {
  unsaved = value;
}

/** True when it's fine to close the editor: nothing unsaved, or the person agreed to discard it (asked once). */
export function okToDiscard() {
  if (!unsaved) return true;
  if (!window.confirm(DISCARD)) return false;
  unsaved = false;
  return true;
}
