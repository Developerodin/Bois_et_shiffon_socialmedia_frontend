import { redirect } from "next/navigation";

/** The chat lives in the panel beside every page, so this route just goes to the Overview. */
export default function Page() {
  redirect("/");
}
