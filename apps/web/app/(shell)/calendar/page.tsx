import { redirect } from "next/navigation";

/** The content calendar lives in the workspace as a panel; old links land there. */
export default function Page() {
  redirect("/?panel=content");
}
