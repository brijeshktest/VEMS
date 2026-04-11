export default function manifest() {
  return {
    id: "/",
    name: "Shroom Agritech LLP — Vendor & Expense",
    short_name: "Shroom Agritech",
    description: "Shroom Agritech LLP — vendor, materials, and expense tracking",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "natural",
    background_color: "#ffffff",
    theme_color: "#724c1f",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
