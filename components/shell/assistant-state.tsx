"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

type Assistant = { open: boolean; setOpen: (open: boolean) => void };

/** The top bar toggle's id: the drawer returns focus to it on close. */
export const ASSISTANT_TOGGLE_ID = "assistant-toggle";

const Ctx = createContext<Assistant | null>(null);

const XL = "(min-width: 1280px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/**
 * Whether the window is 1280 px or wider: the docked sidebar and the docked assistant column. Server and first paint
 * assume wide; the docked parts are CSS-hidden below 1280 until the check runs.
 */
export function useWide() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(XL).matches, () => true);
}

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
