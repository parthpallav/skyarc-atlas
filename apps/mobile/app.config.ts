import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "SkyArc Atlas";
const SLUG = "skyarc-atlas";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: SLUG,
  version: "1.0.0",
  orientation: "portrait",
  scheme: SLUG,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/brand/skyarc-logo-dark.png",
  splash: {
    image: "./assets/brand/skyarc-logo-light.png",
    resizeMode: "contain",
    backgroundColor: "#0f172a",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "in.skyarc.atlas",
    infoPlist: {
      NSCameraUsageDescription:
        "SkyArc Atlas captures location survey photos and videos.",
      NSLocationWhenInUseUsageDescription:
        "SkyArc Atlas records GPS coordinates for billboard locations.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/brand/skyarc-logo-dark.png",
      backgroundColor: "#0f172a",
    },
    package: "in.skyarc.atlas",
    permissions: ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow SkyArc Atlas to capture location survey photos and videos.",
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow SkyArc Atlas to capture GPS for billboard locations.",
      },
    ],
    "expo-sqlite",
    "expo-font",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001",
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
