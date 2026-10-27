import { router } from "expo-router";
import { Info } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { ChoiceCard } from "@/ui/choice";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { onboarding, type Goal } from "@/ui/onboarding/state";
import { color, space, type } from "@/theme/tokens";

const plan = require("../../../assets/figma/onboarding/goal-social-plan.jpg");
// key → onboarding:goal.options.<key>.title / .description
const GOALS: { id: Goal; key: string; image: number }[] = [
  { id: "social-plan", key: "socialPlan", image: plan },
  { id: "marketing-videos", key: "marketingVideos", image: require("../../../assets/figma/onboarding/goal-marketing-videos.jpg") },
  { id: "fashion-photoshoot", key: "fashionPhotoshoot", image: require("../../../assets/figma/onboarding/goal-fashion.jpg") },
  { id: "product-photoshoot", key: "productPhotoshoot", image: plan },
];

/** A04 · Onboarding / Creation goal (Figma 408:165). */
export default function GoalScreen() {
  const { t } = useTranslation("onboarding");
  const [goal, setGoal] = useState<Goal>(onboarding.goal);

  return (
    <Screen
      header={<StepHeader step={1} />}
      footer={
        <Button
          label={t("common:continue")}
          arrow
          onPress={() => {
            onboarding.goal = goal;
            router.push("/onboarding/source");
          }}
        />
      }
    >
      <Title title={t("goal.title")} subtitle={t("goal.subtitle")} style={{ paddingBottom: 0 }} />
      <View style={styles.grid} accessibilityRole="radiogroup">
        {[GOALS.slice(0, 2), GOALS.slice(2)].map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((g) => (
              <ChoiceCard key={g.id} image={g.image} title={t(`goal.options.${g.key}.title`)} description={t(`goal.options.${g.key}.description`)} selected={goal === g.id} onPress={() => setGoal(g.id)} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.note}>
        <Info size={16} color={color.inkSecondary} strokeWidth={1.75} />
        <Text style={type.meta}>{t("goal.note")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { paddingTop: space[24], gap: space[16] },
  row: { flexDirection: "row", gap: space[16] },
  note: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[16] },
});
