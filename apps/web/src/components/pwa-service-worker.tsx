"use client";

import { useEffect } from "react";

export function PwaServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for worker updates
          reg.update();
        })
        .catch(() => {
          // Silent fallback
        });
    }
  }, []);

  return null;
}
