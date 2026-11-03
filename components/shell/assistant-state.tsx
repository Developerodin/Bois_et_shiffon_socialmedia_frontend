"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Assistant = { open: boolean; setOpen: (open: boolean) => void };

/** The top bar toggle's id: the drawer returns focus to it on close. */
export const ASSISTANT_TOGGLE_ID = "assistant-toggle";

const Ctx = createContext<Assistant | null>(null);

/** Whether the assistant drawer is open below 1280 px. The top bar's toggle and the panel share it; mount it above both. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useAssistant(): Assistant {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistant needs an AssistantProvider above it.");
  return v;
}
