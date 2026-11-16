import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { completeSocialConnect } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { ownedByConnectSocial } from "@/ui/connect-social";
import { ErrorScreen } from "@/ui/error-screen";
import { onboarding } from "@/ui/onboarding/state";
import { PageLoading } from "@/ui/page-loading";

/**
 * espanda://connect, the Instagram/Facebook consent page's return link. Normally connectSocial (ui/connect-social.ts)
 * handles it inside the open browser session; if the link also reaches the router then, this just steps back. When
 * Android killed the app while the consent page was open, the link starts the app here instead: this sends the code
 * on, then lands where connecting continues: A12 while onboarding (its answers are restored at start), else Connections.
 */
export default function ConnectReturn() {
  const { t } = useTranslation();
  const { provider, state, code } = useLocalSearchParams<{ provider?: string; state?: string; code?: string }>();
  const [error, setError] = useState<string | null>(null);
  const onboardingOpen = !!onboarding.brandId; // cleared when onboarding finishes
  const [owned] = useState(() => ownedByConnectSocial(state));
  const incomplete = !provider || !state || !code;
  const failed = error ?? (!owned && incomplete && !onboardingOpen ? t("onboarding:connect.errors.cancelled") : null);

  useEffect(() => {
    if (owned) return void (router.canGoBack() ? router.back() : router.replace("/"));
    if (incomplete) {
      if (onboardingOpen) router.replace({ pathname: "/onboarding/connect", params: { failed: t("onboarding:connect.errors.cancelled") } });
      return;
    }
    completeSocialConnect(provider, state, code).then(
      ({ connected }) => router.replace(onboardingOpen ? { pathname: "/onboarding/connect", params: { connected: connected.join(", ") } } : "/business/connections"),
      (e: unknown) => {
        const message = e instanceof Error ? e.message : t("onboarding:connect.errors.failed");
        if (onboardingOpen) router.replace({ pathname: "/onboarding/connect", params: { failed: message } });
        else setError(message);
      },
    );
    // Once: the link's params don't change while this screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!failed) return <PageLoading />;
  return (
    <ErrorScreen title={t("onboarding:connect.errors.failed")} body={failed}>
      <Button label={t("continue")} onPress={() => router.replace("/business/connections")} />
    </ErrorScreen>
  );
}
