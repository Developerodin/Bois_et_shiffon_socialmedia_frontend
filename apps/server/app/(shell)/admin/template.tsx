/** Re-runs on every navigation (unlike layout.tsx), so each page and tab rises in as it arrives. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="rise-in flex min-w-0 flex-col gap-10">{children}</div>;
}
