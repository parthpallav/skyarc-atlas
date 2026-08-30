export const UserRole = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  MEDIA_PLANNER: "MEDIA_PLANNER",
  FIELD_OPERATOR: "FIELD_OPERATOR",
  VENDOR: "VENDOR",
  /** @deprecated Use VENDOR */
  SALES: "SALES",
  /** @deprecated Use MEDIA_PLANNER */
  VIEWER: "VIEWER",
  /** @deprecated Use VENDOR */
  VENDOR_ADMIN: "VENDOR_ADMIN",
  /** @deprecated Use VENDOR */
  VENDOR_OPS: "VENDOR_OPS",
  /** @deprecated Client portal deferred */
  CLIENT_VIEWER: "CLIENT_VIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
