// One document is edited at a time, so one flag is enough: DocPane sets it while its text differs from what it
// opened, and clears it when that stops (saved, cancelled, or the editor closed). Before closing that editor, these
// ask first: Cancel, choosing another document, the workspace back button and browser Back on the workspace, in-app
// links that leave the page (sidebar included), and the business and workspace switchers. Closing or reloading the
// tab is DocPane's beforeunload.
const DISCARD = "Discard your unsaved changes to this document?";
let unsaved = false;

export function setUnsaved(value: boolean) {
  unsaved = value;
}

/** True when it's fine to close the editor: nothing unsaved, or the person agreed to discard it. */
export function okToDiscard() {
  return !unsaved || window.confirm(DISCARD);
}
