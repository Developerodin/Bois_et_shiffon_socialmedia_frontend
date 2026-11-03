import { router, type Href } from "expo-router";

/**
 * Goes to `href` with nothing behind it: pops the stack to its first screen, then replaces that one. For leaving
 * onboarding (or signing out), where Back must not return to sign-in, the code step or the connect step.
 */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}
