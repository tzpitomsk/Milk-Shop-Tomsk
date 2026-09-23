import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",

    name: "Milk Shop",

    short_name: "Milk Shop",

    description: "Система управления магазином Milk Shop",

    start_url: "/",

    scope: "/",

    display: "standalone",

    background_color: "#ffffff",

    theme_color: "#ffffff",

    orientation: "portrait",

    lang: "ru",

    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}