"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Check } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton({ className = "" }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already in standalone / installed PWA mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs border border-zinc-700 transition-all active:scale-95 ${className}`}
        title="Install Atlas as a native mobile app"
      >
        <Smartphone className="w-3.5 h-3.5 text-skyarc-purple" />
        <span>Install App</span>
      </button>

      {/* iOS Safari Home Screen Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl border border-violet-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Smartphone className="w-5 h-5 text-primary" />
                <span>Install on iOS</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              To install <strong>Skyarc Atlas</strong> on your iPhone or iPad:
            </p>
            <ol className="text-xs text-slate-700 space-y-2.5 list-decimal list-inside bg-slate-50 p-3 rounded-xl border border-slate-100 font-medium">
              <li>
                Tap the <strong className="text-primary">Share</strong> button in Safari (box with arrow at the bottom).
              </li>
              <li>
                Scroll down and select <strong className="text-slate-900">Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong className="text-primary">Add</strong> in top right. Atlas will now launch full screen like an APK!
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full btn-primary text-xs py-2.5"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
