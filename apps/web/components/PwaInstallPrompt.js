"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DISMISS_KEY = "vems_pwa_install_dismissed";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") return true;
  const mqStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const mqFullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const mqMinimal = window.matchMedia("(display-mode: minimal-ui)").matches;
  const iosStandalone = typeof window.navigator !== "undefined" && window.navigator.standalone === true;
  return mqStandalone || mqFullscreen || mqMinimal || iosStandalone;
}

function isLikelyIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const noChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && noChrome;
}

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const deferredRef = useRef(null);
  const [showChromium, setShowChromium] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    deferredRef.current = deferred;
  }, [deferred]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowChromium(false);
    setShowIosHint(false);
    setDeferred(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalledDisplayMode()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShowChromium(true);
      setShowIosHint(false);
    };

    const onAppInstalled = () => {
      setDeferred(null);
      setShowChromium(false);
      setShowIosHint(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalledDisplayMode()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const t = window.setTimeout(() => {
      if (deferredRef.current) return;
      if (!isLikelyIosSafari()) return;
      if (window.navigator.standalone === true) return;
      setShowIosHint(true);
    }, 1800);

    return () => window.clearTimeout(t);
  }, []);

  const onInstallClick = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed native sheet or prompt failed */
    } finally {
      setInstalling(false);
      setDeferred(null);
      setShowChromium(false);
    }
  };

  if (!showChromium && !showIosHint) return null;

  return (
    <div className="pwa-install" role="region" aria-label="Install app">
      <div className="pwa-install-inner">
        {showChromium ? (
          <>
            <div className="pwa-install-text">
              <strong className="pwa-install-title">Install Shroom Agritech</strong>
              <p className="pwa-install-desc">Add this app to your home screen for quick access and a full-screen experience.</p>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="btn btn-secondary pwa-install-dismiss" onClick={dismiss}>
                Not now
              </button>
              <button type="button" className="btn pwa-install-primary" onClick={onInstallClick} disabled={installing}>
                {installing ? "Installing…" : "Install app"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pwa-install-text">
              <strong className="pwa-install-title">Add to Home Screen</strong>
              <p className="pwa-install-desc">
                Tap <span className="pwa-install-kbd">Share</span>, then <span className="pwa-install-kbd">Add to Home Screen</span>{" "}
                to install this app on your iPhone or iPad.
              </p>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="btn pwa-install-primary" onClick={dismiss}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
