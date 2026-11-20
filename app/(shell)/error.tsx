"use client";

import PageError from "../error";

/** A shell page failed to render: show the error inside the shell so the sidebar and top bar stay. */
export default function ShellError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} inline />;
}
