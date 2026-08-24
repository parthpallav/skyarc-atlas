import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "../theme";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppText({
  children,
  variant = "body",
  style,
}: {
  children: React.ReactNode;
  variant?: "title" | "subtitle" | "body" | "caption" | "label";
  style?: object;
}) {
  const variantStyle = {
    title: styles.title,
    subtitle: styles.subtitle,
    body: styles.body,
    caption: styles.caption,
    label: styles.label,
  }[variant];
  return <Text style={[variantStyle, style]}>{children}</Text>;
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variantStyles = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    ghost: styles.btnGhost,
  };
  return (
    <Pressable
      style={[styles.btn, variantStyles[variant], (disabled || loading) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : colors.text} />
      ) : (
        <Text
          style={[
            styles.btnText,
            variant === "secondary" && styles.btnTextSecondary,
            variant === "ghost" && styles.btnTextGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Badge({ label, tone = "warning" }: { label: string; tone?: "warning" | "success" | "muted" }) {
  const toneStyles = {
    warning: { box: styles.badgeWarning, text: styles.badgeTextWarning },
    success: { box: styles.badgeSuccess, text: styles.badgeTextSuccess },
    muted: { box: styles.badgeMuted, text: styles.badgeTextMuted },
  }[tone];
  return (
    <View style={[styles.badge, toneStyles.box]}>
      <Text style={[styles.badgeText, toneStyles.text]}>{label}</Text>
    </View>
  );
}

export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.caption}>{message}</Text>
    </View>
  );
}

export function LocationThumbnail({
  uri,
  size = 72,
  style,
}: {
  uri?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.thumb, { width: size, height: size }, style]}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name="image-outline" size={size * 0.35} color={colors.placeholder} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.muted, marginTop: spacing.sm },
  label: { fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radii.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 16,
  },
  btn: {
    borderRadius: radii.sm,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.secondary },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.cardBorder },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  btnTextSecondary: { color: colors.text },
  btnTextGhost: { color: colors.muted },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  badgeWarning: { backgroundColor: "#FEF3C7" },
  badgeSuccess: { backgroundColor: "#D1FAE5" },
  badgeMuted: { backgroundColor: colors.secondary },
  badgeText: { fontSize: 12, fontWeight: "600" },
  badgeTextWarning: { color: "#B45309" },
  badgeTextSuccess: { color: "#047857" },
  badgeTextMuted: { color: colors.muted },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  thumb: {
    borderRadius: radii.sm,
    overflow: "hidden",
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
});
