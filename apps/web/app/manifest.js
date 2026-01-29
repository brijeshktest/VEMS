export default function manifest() {
  return {
    name: "Vendor and Expense Management System",
    short_name: "VendorExpense",
    description: "Vendor and expense tracking system",
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
