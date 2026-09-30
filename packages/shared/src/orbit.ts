/** Atlas ↔ Orbit shared constants (no credentials). */

export const DeviceProvider = {
  ORBIT: "orbit",
  XTREME: "xtreme",
  LED_CONTROLLER: "led_controller",
  OTHER: "other",
} as const;
export type DeviceProvider = (typeof DeviceProvider)[keyof typeof DeviceProvider];

export const DeviceType = {
  ORBIT_EDGE: "orbit_edge",
  ORBIT_EDGE_SENSE: "orbit_edge_sense",
  MEDIA_PLAYER: "media_player",
  LED_CONTROLLER: "led_controller",
  OTHER: "other",
} as const;
export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

export const DeviceStatus = {
  UNKNOWN: "unknown",
  PENDING: "pending",
  ONLINE: "online",
  OFFLINE: "offline",
  REVOKED: "revoked",
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const ORBIT_TENANT_ID = "skyarc";

export const OrbitEventType = {
  DEVICE_CONNECTED: "orbit.device.connected",
  DEVICE_DISCONNECTED: "orbit.device.disconnected",
  DEVICE_HEALTH_CHANGED: "orbit.device.health_changed",
  ALERT_CREATED: "orbit.alert.created",
} as const;
export type OrbitEventType = (typeof OrbitEventType)[keyof typeof OrbitEventType];
