import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { session } from "@/api/client";

/** Entry: signed-in people go straight to their posts; everyone else starts at sign-in. */
export default function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void session.token().then((t) => setSignedIn(!!t));
  }, []);
  if (signedIn === null) return null; // splash is still up for a moment while the keychain is read
  // A stored token isn't proof it's still valid: the root layout checks it with the server in the background and
  // sends people back to sign-in if it's been rejected.
  return <Redirect href={signedIn ? "/posts" : "/onboarding/sign-in"} />;
}
