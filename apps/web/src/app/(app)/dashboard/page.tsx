"use client";

import { showAdtechBooking } from "@/lib/feature-flags";
import { DashboardClassic } from "@/components/dashboard-classic";
import { DashboardAdtech } from "@/components/dashboard-adtech";

/**
 * Classic inventory/media-plan dashboard by default.
 * Booking/reservation dashboard only when NEXT_PUBLIC_ADTECH_BOOKING=true.
 */
export default function DashboardPage() {
  if (showAdtechBooking()) return <DashboardAdtech />;
  return <DashboardClassic />;
}
