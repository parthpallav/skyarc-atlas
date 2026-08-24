import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SKYARC_BRAND, SKYARC_LOGO_WHITE_URL } from "@skyarc/shared";
import { AppText, Button } from "../../../src/components/ui";
import { logout } from "../../../src/lib/auth";
import { colors, radii, spacing } from "../../../src/theme";

const MENU_ITEMS = [
  {
    icon: "add-circle-outline" as const,
    label: "New field survey",
    subtitle: "Capture GPS, photos, and notes",
    onPress: () => router.push("/location/create"),
  },
] as const;

export default function MenuScreen() {
  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandCard}>
          <Image
            source={{ uri: SKYARC_LOGO_WHITE_URL }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>{SKYARC_BRAND.tagline}</Text>
        </View>

        <AppText variant="label" style={styles.section}>
          Quick actions
        </AppText>
        {MENU_ITEMS.map((item) => (
          <Pressable key={item.label} style={styles.menuRow} onPress={item.onPress}>
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}

        <View style={styles.logoutWrap}>
          <Button label="Sign out" variant="ghost" onPress={handleLogout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  brandCard: {
    backgroundColor: colors.black,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  logo: { width: 160, height: 48 },
  tagline: { color: colors.onDarkMuted, fontSize: 14, marginTop: spacing.sm },
  section: { marginBottom: spacing.sm },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 16, fontWeight: "600", color: colors.text },
  menuSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  logoutWrap: { marginTop: spacing.lg },
});
