import { Stack } from "expo-router";
import { colors } from "../../../src/theme";

const headerOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "600" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

export default function CampaignLayout() {
  return (
    <Stack screenOptions={{ ...headerOptions, headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Campaign" }} />
      <Stack.Screen name="plan/[planId]" options={{ title: "Media plan" }} />
    </Stack>
  );
}
