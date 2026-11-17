import { forwardRef, type ChangeEventHandler } from "react";

/** The hidden JPG/PNG file input behind an "Add photos" or "Upload new" button. */
export const PhotoFileInput = forwardRef<HTMLInputElement, { multiple?: boolean; onChange: ChangeEventHandler<HTMLInputElement> }>(function PhotoFileInput({ multiple, onChange }, ref) {
  return <input ref={ref} type="file" accept="image/jpeg,image/png" multiple={multiple} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onChange} />;
});

/** Always mounted so screen readers hear each change; empty lines take no height. */
export function StatusLines({ status, error }: { status: string; error: string }) {
  return (
    <div>
      <p aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
      <p role="alert" className="text-sm text-destructive">{error}</p>
    </div>
  );
}
