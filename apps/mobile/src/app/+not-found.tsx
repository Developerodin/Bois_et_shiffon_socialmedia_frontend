import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import { ErrorScreen } from "@/ui/error-screen";

/** Any link to a screen that doesn't exist (an old notification, a mistyped deep link). */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <ErrorScreen title={t("notFound.title")} body={t("notFound.body")}>
      <Button label={t("notFound.home")} onPress={() => router.replace("/")} />
    </ErrorScreen>
  );
}
