import type { Metadata } from "next";
// OFL fallbacks and locally embedded CourtOS typefaces; no font CDN.
import "./fonts/fonts.css";
import "./globals.css";
import "./fonts/courtos-fonts.css";
import "./courtos-design.css";
import { Providers } from "@/app/components/providers";

export const metadata: Metadata = {
    title: "CourtOS · Rechtsarbeit mit Quellen",
    description:
        "Ein offener Arbeitsraum für Akten, Recherche und Entwürfe mit OpenCaseLaw. Pilot für Gerichte und Behörden.",
    robots: { index: false, follow: false },
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
        ],
    },
    openGraph: {
        type: "website",
        siteName: "CourtOS",
        title: "CourtOS · Rechtsarbeit mit Quellen",
        description:
            "Ein offener Arbeitsraum für Gerichte und Behörden mit OpenCaseLaw.",
    },
    twitter: {
        card: "summary",
        title: "CourtOS · Rechtsarbeit mit Quellen",
        description:
            "Ein offener Arbeitsraum für Gerichte und Behörden mit OpenCaseLaw.",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="de-CH">
            <body
                className="courtos-web font-sans antialiased"
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
