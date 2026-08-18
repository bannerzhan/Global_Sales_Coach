import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Global Sales Coach",
    short_name: "GSC",
    description: "AI 驱动的外贸销售能力训练教练",
    start_url: "/",
    display: "standalone",
    background_color: "#0f766e",
    theme_color: "#0f766e",
    lang: "zh-CN",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
