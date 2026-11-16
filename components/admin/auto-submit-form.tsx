"use client";

/** A GET filter form that applies as soon as a dropdown changes (Enter applies a text box). Without JavaScript, its button does. */
export function AutoSubmitForm(props: React.ComponentProps<"form">) {
  return <form {...props} onChange={(e) => e.target instanceof HTMLSelectElement && e.currentTarget.requestSubmit()} />;
}
