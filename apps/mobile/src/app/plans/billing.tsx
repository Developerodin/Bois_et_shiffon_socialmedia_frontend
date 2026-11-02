import { Redirect } from "expo-router";

/**
 * L07 · No subscription / Billing: the same screen as Business Billing (M11), which shows "No plan yet" with the
 * real balance and credit history. ponytail: one billing screen instead of two copies.
 */
export default function PlansBilling() {
  return <Redirect href="/business/billing" />;
}
