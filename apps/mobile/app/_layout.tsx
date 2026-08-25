import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme";
import { loadTokens } from "../src/lib/auth";
import { startSyncListener } from "../src/sync/engine";

const headerOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "600" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

export default function RootLayout() {
  useEffect(() => {
    void loadTokens();
    const stop = startSyncListener();
    return stop;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ ...headerOptions, headerShown: true }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Sign in", headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="location/create" options={{ title: "New survey" }} />
        <Stack.Screen name="location/[id]" options={{ title: "Location" }} />
        <Stack.Screen name="location/edit/[id]" options={{ title: "Edit location" }} />
        <Stack.Screen name="campaign/[id]/index" options={{ title: "Campaign" }} />
        <Stack.Screen name="campaign/[id]/plan/[planId]" options={{ title: "Media plan" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
