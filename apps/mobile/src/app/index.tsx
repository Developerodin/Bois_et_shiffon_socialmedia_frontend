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
  // ponytail: a stored token isn't proof it's still valid; the first API call that gets 401 clears it
  // (api client) and the screen sends people back to sign-in.
  return <Redirect href={signedIn ? "/posts" : "/onboarding/sign-in"} />;
}
