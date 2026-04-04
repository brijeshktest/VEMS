export default function manifest() {
  return {
    name: "Shroom Agritech LLP — Vendor & Expense",
    short_name: "Shroom Agritech",
    description: "Shroom Agritech LLP — vendor and expense tracking",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
