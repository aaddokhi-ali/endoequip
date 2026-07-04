// app/layout.tsx
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/hooks/useAuth";
import "./globals.css";

export const metadata: Metadata = {
  title: "EndoEquip Supply",
  description: "Supply coordination for the endodontic clinics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
