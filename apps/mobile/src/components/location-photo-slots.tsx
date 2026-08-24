import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PHOTO_VIEW_LABELS, PhotoView, SURVEY_PHOTO_VIEWS } from "@skyarc/shared";
import { compressImageToWebP } from "../lib/media";
import { AppText, Button } from "./ui";
import { colors, radii, spacing } from "../theme";

const VIEW_HINTS: Partial<Record<PhotoView, string>> = {
  [PhotoView.FRONT]: "Full face of the hoarding",
  [PhotoView.APPROACH]: "Road view approaching the site",
  [PhotoView.LEFT]: "Left side angle",
  [PhotoView.RIGHT]: "Right side angle",
  [PhotoView.REVERSE]: "Rear / reverse angle",
  [PhotoView.SURROUNDING]: "Surroundings & landmarks",
};

interface LocationPhotoSlotsProps {
  photos: Partial<Record<PhotoView, string>>;
  onPhotoCaptured: (view: PhotoView, uri: string) => void;
  title?: string;
}

export function LocationPhotoSlots({
  photos,
  onPhotoCaptured,
  title = "Site photos",
}: LocationPhotoSlotsProps) {
  const [activeView, setActiveView] = useState<PhotoView | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const photoCount = SURVEY_PHOTO_VIEWS.filter((view) => photos[view]).length;

  async function openCamera(view: PhotoView) {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Permission required", "Camera access is needed for survey photos.");
        return;
      }
    }
    setActiveView(view);
    setShowCamera(true);
  }

  async function captureFromCamera() {
    if (!cameraRef.current || !activeView) return;
    const photo = await cameraRef.current.takePictureAsync();
    if (!photo?.uri) return;
    const compressed = await compressImageToWebP(photo.uri);
    onPhotoCaptured(activeView, compressed.uri);
    setShowCamera(false);
    setActiveView(null);
  }

  if (showCamera && permission?.granted && activeView) {
    return (
      <View style={styles.cameraScreen}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>{PHOTO_VIEW_LABELS[activeView]} view</Text>
        </View>
        <CameraView ref={cameraRef} style={styles.cameraFull} facing="back" />
        <View style={styles.cameraActions}>
          <Button label="Capture" onPress={captureFromCamera} />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setShowCamera(false);
              setActiveView(null);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <>
      <AppText variant="label" style={styles.sectionLabel}>
        {title} ({photoCount}/{SURVEY_PHOTO_VIEWS.length})
      </AppText>
      <Text style={styles.sectionHint}>
        Tap a slot to capture or replace — Front, Approach, Left, Right, Back, Surrounding
      </Text>

      {SURVEY_PHOTO_VIEWS.map((view) => {
        const uri = photos[view];
        const label = PHOTO_VIEW_LABELS[view];
        const hint = VIEW_HINTS[view];
        return (
          <Pressable
            key={view}
            style={styles.photoSlot}
            onPress={() => void openCamera(view)}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.slotPreview} resizeMode="cover" />
            ) : (
              <View style={styles.slotPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={colors.primary} />
              </View>
            )}
            <View style={styles.slotText}>
              <Text style={styles.slotTitle}>{label}</Text>
              {hint && <Text style={styles.slotHint}>{hint}</Text>}
              {uri && <Text style={styles.slotRetake}>Tap to {photos[view] ? "replace" : "capture"}</Text>}
            </View>
            <Ionicons
              name={uri ? "checkmark-circle" : "chevron-forward"}
              size={22}
              color={uri ? colors.success : colors.muted}
            />
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: spacing.md },
  sectionHint: { color: colors.muted, fontSize: 13, marginBottom: spacing.sm },
  photoSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  slotPreview: {
    width: 72,
    height: 54,
    borderRadius: radii.sm,
    backgroundColor: colors.secondary,
  },
  slotPlaceholder: {
    width: 72,
    height: 54,
    borderRadius: radii.sm,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  slotText: { flex: 1, minWidth: 0 },
  slotTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  slotHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  slotRetake: { fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: "500" },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  cameraHeader: {
    padding: spacing.md,
    backgroundColor: colors.black,
  },
  cameraTitle: {
    color: colors.onDark,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  cameraFull: { flex: 1 },
  cameraActions: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
});
