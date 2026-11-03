import { Redirect } from "expo-router";

/** P08 · Posts / Edit story: stories are "coming soon", so nothing opens the editor; a stale link lands on Stories. */
export default function EditStory() {
  return <Redirect href="/posts/stories" />;
}
