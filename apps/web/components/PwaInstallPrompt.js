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

function isLocalDevHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isLikelyIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const noChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && noChrome;
}

function isLikelyAndroidChromium() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isChromiumFamily = /Chrome|CriOS|EdgA|SamsungBrowser|OPR/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  return isAndroid && isChromiumFamily && !isFirefox;
}

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const deferredRef = useRef(null);
  const [showChromium, setShowChromium] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showAndroidHint, setShowAndroidHint] = useState(false);
  const [showFallbackHint, setShowFallbackHint] = useState(false);
  const [showHttpHint, setShowHttpHint] = useState(false);
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
    setShowAndroidHint(false);
    setShowFallbackHint(false);
    setShowHttpHint(false);
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

    const { protocol, hostname } = window.location;
    if (protocol === "http:" && !isLocalDevHost(hostname)) {
      setShowHttpHint(true);
      return;
    }

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShowChromium(true);
      setShowIosHint(false);
      setShowAndroidHint(false);
      setShowFallbackHint(false);
      setShowHttpHint(false);
    };

    const onAppInstalled = () => {
      setDeferred(null);
      setShowChromium(false);
      setShowIosHint(false);
      setShowAndroidHint(false);
      setShowFallbackHint(false);
      setShowHttpHint(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const timer = window.setTimeout(() => {
      if (deferredRef.current) return;
      if (isLikelyIosSafari()) {
        if (window.navigator.standalone === true) return;
        setShowIosHint(true);
        return;
      }
      if (isLikelyAndroidChromium()) {
        setShowAndroidHint(true);
        return;
      }
      setShowFallbackHint(true);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    const promptEvent = deferredRef.current;
    if (!promptEvent) return;
    setInstalling(true);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      /* user dismissed native sheet or prompt failed */
    } finally {
      setInstalling(false);
      deferredRef.current = null;
      setDeferred(null);
      setShowChromium(false);
    }
  };

  if (!showChromium && !showIosHint && !showAndroidHint && !showFallbackHint && !showHttpHint) return null;

  return (
    <div className="pwa-install" role="region" aria-label="Install app">
      <div className="pwa-install-inner">
        {showHttpHint ? (
          <>
            <div className="pwa-install-text">
              <strong className="pwa-install-title">Secure connection required</strong>
              <p className="pwa-install-desc">
                Installing this app requires HTTPS. Open the site with <span className="pwa-install-kbd">https://</span> in the address
                bar, or ask your administrator to enable SSL.
              </p>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="btn pwa-install-primary" onClick={dismiss}>
                OK
              </button>
            </div>
          </>
        ) : showChromium ? (
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
        ) : showIosHint ? (
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
        ) : showAndroidHint ? (
          <>
            <div className="pwa-install-text">
              <strong className="pwa-install-title">Install from browser menu</strong>
              <p className="pwa-install-desc">
                Open your browser menu (<span className="pwa-install-kbd">⋮</span>) and tap{" "}
                <span className="pwa-install-kbd">Install app</span> or <span className="pwa-install-kbd">Add to Home screen</span>.
              </p>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="btn pwa-install-primary" onClick={dismiss}>
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pwa-install-text">
              <strong className="pwa-install-title">Install this app</strong>
              <p className="pwa-install-desc">
                In Chrome or Edge, look for the install icon in the address bar, or open the menu (<span className="pwa-install-kbd">⋮</span>
                ) and choose <span className="pwa-install-kbd">Install Shroom Agritech</span> or{" "}
                <span className="pwa-install-kbd">Apps</span> → <span className="pwa-install-kbd">Install this site as an app</span>.
              </p>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="btn btn-secondary pwa-install-dismiss" onClick={dismiss}>
                Not now
              </button>
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
