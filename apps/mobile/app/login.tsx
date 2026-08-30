import { router } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SKYARC_BRAND, SKYARC_LOGO_WHITE_URL } from "@skyarc/shared";
import { login } from "../src/lib/auth";
import { AppText, Button, Input } from "../src/components/ui";
import { colors, spacing } from "../src/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/locations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.brandPanel}>
        <Image
          source={{ uri: SKYARC_LOGO_WHITE_URL }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Skyarc"
        />
        <Text style={styles.atlasLabel}>Atlas</Text>
        <Text style={styles.tagline}>{SKYARC_BRAND.tagline.toUpperCase()}</Text>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
            <AppText variant="title" style={styles.formTitle}>
              Sign in
            </AppText>
            <AppText variant="caption" style={styles.formSubtitle}>
              Field survey & billboard intelligence
            </AppText>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              style={styles.field}
            />
            <Input
              placeholder="Password"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              style={styles.field}
            />

            <Button
              label="Sign in"
              onPress={handleLogin}
              loading={loading}
              disabled={!email.trim() || !password}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.black },
  brandPanel: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: "center",
    backgroundColor: colors.black,
  },
  logo: { width: 220, height: 56 },
  atlasLabel: {
    color: colors.onDark,
    fontSize: 18,
    fontWeight: "700",
    marginTop: spacing.sm,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tagline: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginTop: spacing.xs,
  },
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  formTitle: { fontSize: 22 },
  formSubtitle: { marginTop: 4, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: colors.error, fontSize: 14 },
});
