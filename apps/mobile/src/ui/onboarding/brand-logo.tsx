import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import type { BrandAssetsView } from "@/api/endpoints";
import { imageSource } from "@/ui/onboarding/use-brand-assets";
import { color } from "@/theme/tokens";

/**
 * The brand's logo from its website at the given height, as wide as its own shape needs (up to 3× the height),
 * so wordmarks show whole. Its first letter when there's no logo.
 */
export function BrandLogo({ brand, size }: { brand: BrandAssetsView | null; size: number }) {
  const [ratio, setRatio] = useState(1);
  const logo = brand?.assets?.logo;
  if (logo) {
    return (
      <Image
        source={imageSource(logo)}
        style={{ height: size, width: size * Math.min(3, Math.max(1, ratio)) }}
        contentFit="contain"
        onLoad={(e) => e.source.height > 0 && setRatio(e.source.width / e.source.height)}
        accessibilityLabel={brand.name}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: size * 0.6, color: color.inkSecondary }}>{brand?.name.slice(0, 1).toUpperCase() ?? ""}</Text>
    </View>
  );
}
