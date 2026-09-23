"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      console.log("[Milk Shop] Service Worker не поддерживается");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
      })
      .then((registration) => {
        console.log(
          "[Milk Shop] Service Worker зарегистрирован:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error(
          "[Milk Shop] Ошибка регистрации Service Worker:",
          error
        );
      });
  }, []);

  return null;
}