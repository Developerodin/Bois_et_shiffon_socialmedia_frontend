/**
 * Call when a dialog opens; call the result once it has closed. Radix puts focus back on the opener by itself, but
 * a reload behind the dialog can replace that button, so fall back to the tab panel rather than leave focus on the page.
 */
export function rememberFocus(fallbackId: string) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return () =>
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      (opener?.isConnected ? opener : document.getElementById(fallbackId))?.focus();
    }, 50);
}
