import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { session } from "@/api/client";
import { signedInHome } from "@/ui/account-actions";

/** Entry: signed-in people go to their posts, or to onboarding if they have no business yet; everyone else starts at sign-in. */
export default function Index() {
  const [home, setHome] = useState<Awaited<ReturnType<typeof signedInHome>> | "/onboarding/sign-in" | null>(null);
  useEffect(() => {
    void session.token().then(async (t) => setHome(t ? await signedInHome() : "/onboarding/sign-in"));
  }, []);
  // A blank moment while the keychain is read; with no business saved on this phone, the server is asked too.
  if (home === null) return null;
  // A stored token isn't proof it's still valid: the root layout checks it with the server in the background and
  // sends people back to sign-in if it's been rejected.
  return <Redirect href={home} />;
}
