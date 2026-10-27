import { Stack, router } from "expo-router";
import { BusinessDrawer } from "@/ui/business/drawer";
import { goBack } from "@/ui/business/kit";

/** M13 · Navigation / Business drawer as a route, so any screen can link to /business/menu. */
export default function BusinessMenu() {
  return (
    <>
      <Stack.Screen options={{ presentation: "transparentModal", animation: "none", contentStyle: { backgroundColor: "transparent" } }} />
      <BusinessDrawer visible onClose={() => goBack()} onSelect={(href) => router.replace(href)} />
    </>
  );
}
