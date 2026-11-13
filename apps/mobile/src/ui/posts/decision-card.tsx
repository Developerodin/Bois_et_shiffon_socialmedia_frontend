import { Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { posts, type PostRelease, type PostStatus, type ProductIssue } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Card } from "@/ui/layout";
import { color, space, type } from "@/theme/tokens";
import { usePermissions } from "@/ui/use-permissions";

/**
 * The approver's word on a post or story: its issues (a product sold out, removed or repriced; the offer ended or
 * changed) with "Ask for changes", and "Approve anyway" when every refusing issue is overridable (stock, an ended offer)
 * and they hold rules.approve too, as on the web.
 *
 * `approve` (stories): the version waits for approval, so the card also offers a plain Approve (when nothing refuses)
 * and "Request changes" without any issue. Posts are approved by scheduling them instead.
 * `onDecided` gets the new release (null after a plain approve, whose answer the caller re-reads). `errorText` turns a
 * refusal into the app's words (stories pass storyError); the default is the error's own message.
 */
export function DecisionCard({
  id,
  version,
  status,
  issues,
  approve,
  onDecided,
  errorText = (e) => (e instanceof Error ? e.message : String(e)),
}: {
  id: string;
  version: number;
  status: PostStatus;
  issues: ProductIssue[];
  approve?: () => Promise<unknown>;
  onDecided: (release: PostRelease | null) => void | Promise<void>;
  errorText?: (e: unknown) => string;
}) {
  const { t } = useTranslation("posts");
  const { can } = usePermissions();
  const [busy, setBusy] = useState<"anyway" | "ask" | "approve" | null>(null);
  // "Ask for changes" on a product issue: null = not touched yet (prefilled from the issues / the default below). Kept per
  // version, so a new version starts from its own issues again.
  const [draft, setDraft] = useState<{ version: number; note: string | null; pick: boolean | null }>({ version, note: null, pick: null });
  const { note: askNote, pick: switchPick } = draft.version === version ? draft : { note: null, pick: null };
  const setAskNote = (note: string | null) => setDraft({ version, note, pick: switchPick });
  const setSwitchPick = (pick: boolean | null) => setDraft({ version, note: askNote, pick });
  const [error, setError] = useState<string | null>(null);

  const refused = issues.some((i) => i.refuses);
  const canAsk = issues.length > 0 && (status === "AWAITING_APPROVAL" || status === "APPROVED") && can("content.approve");
  const plain = !!approve && status === "AWAITING_APPROVAL" && can("content.approve");
  const canAnyway = canAsk && refused && can("rules.approve") && issues.every((i) => !i.refuses || i.overridable);
  // Prefilled with the issues for "Ask for changes"; empty when "Approve anyway" is on offer (its note says why it can go out).
  const note = askNote ?? (canAnyway ? "" : issues.map((i) => i.message).join("\n"));
  const unavailable = issues.some((i) => i.refuses && i.kind === "availability");
  const switchProducts = switchPick ?? unavailable;
  if (!issues.length && !plain) return null;

  const run = async (key: "anyway" | "ask" | "approve", needs: string | null, call: () => Promise<PostRelease | null>) => {
    if (needs && !note.trim()) return setError(t(needs));
    setError(null);
    setBusy(key);
    try {
      const r = await call();
      setDraft({ version, note: null, pick: null });
      await onDecided(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ marginTop: space[12], gap: space[8] }}>
      {issues.length ? (
        <>
          <Text style={styles.eyebrow}>{t("detail.issues")}</Text>
          {issues.map((i) => (
            <Text key={(i.productId ?? i.campaignId) + i.kind + i.message} style={[type.body, i.refuses && { color: color.error }]}>
              {i.message}
              {!i.refuses && i.overridable ? ` ${t("detail.approvedAnyway")}` : ""}
            </Text>
          ))}
        </>
      ) : null}
      {canAsk || plain ? (
        <>
          <Field label={t(canAnyway ? "detail.decisionNote" : issues.length ? "detail.askNote" : "stories.detail.changesNote")} multiline value={note} onChangeText={setAskNote} maxLength={canAnyway ? 500 : 2000} error={error} />
          {issues.some((i) => i.kind !== "offer") ? (
            <>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: switchProducts }} onPress={() => setSwitchPick(!switchProducts)} style={[styles.row8, { minHeight: 44 }]}>
                <View style={[styles.box, switchProducts && { backgroundColor: color.primary, borderColor: color.primary }]}>
                  {switchProducts ? <Check size={14} color={color.onPrimary} strokeWidth={2.5} /> : null}
                </View>
                <Text style={type.body}>{t("detail.suggestProduct")}</Text>
              </Pressable>
              {!switchProducts && unavailable ? <Text style={type.meta}>{t("detail.productStays")}</Text> : null}
            </>
          ) : null}
          {plain && !refused ? (
            <Button label={busy === "approve" ? t("detail.approving") : t("stories.detail.approve")} height={44} disabled={busy !== null} onPress={() => void run("approve", null, async () => (await approve(), null))} />
          ) : null}
          {canAnyway ? (
            <Button label={busy === "anyway" ? t("detail.approving") : t("detail.approveAnyway")} height={44} disabled={busy !== null} onPress={() => void run("anyway", "detail.anywayNeeded", () => posts.approveAnyway(id, version, note.trim()))} />
          ) : null}
          <Button
            label={busy === "ask" ? t("detail.sending") : t(issues.length ? "detail.askChanges" : "stories.detail.requestChanges")}
            variant="outline"
            height={44}
            disabled={busy !== null}
            onPress={() => void run("ask", "detail.noteNeeded", () => posts.sendBack(id, version, note.trim(), issues.length ? switchProducts : undefined))}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  eyebrow: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  box: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1.5, borderColor: color.controlOutline },
});
