import { useCallback, useState } from "react";
import { useFocusEffect, type Href } from "expo-router";
import { Camera, MessageCircle, Phone, type LucideIcon } from "lucide-react-native";
import { inbox, type Conversation, type InboxAccount, type InboxChannel } from "@/api/endpoints";
import { mc } from "@/ui/marketing/kit";

/** Shared by the Customers screens (Inbox, Reply, People). Channel names are product names, not translated. */
export const CHANNEL_ICON: Record<InboxChannel | "WHATSAPP", { Icon: LucideIcon; bg: string; name: string }> = {
  INSTAGRAM: { Icon: Camera, bg: mc.instagram, name: "Instagram Direct" },
  META: { Icon: MessageCircle, bg: mc.chrome, name: "Facebook Messenger" },
  WHATSAPP: { Icon: Phone, bg: mc.whatsapp, name: "WhatsApp Business" },
};

export type InboxData = { accounts: InboxAccount[]; conversations: Conversation[] };

/** Loads the inbox on focus; shared by Inbox and People. */
export function useInbox() {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    inbox.list().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);
  return { data, error, load };
}

export const replyHref = (c: Conversation) => `/marketing/reply?c=${encodeURIComponent(c.connectionId)}&id=${encodeURIComponent(c.id)}` as Href;

