"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { settingsTabButtonClassName } from "./settingsStyles";
import { COURTOS_CLOUDFLARE_AUTH, COURTOS_PILOT_MODE, isPilotManagedSettingsPath } from "@/app/lib/courtos";

interface TabDef {
    id: string;
    label: string;
    href: string;
}

const TABS: TabDef[] = [
    { id: "account", label: "Account", href: "/settings" },
    {
        id: "personalisation",
        label: "Personalisation",
        href: "/settings/personalisation",
    },
    { id: "memory", label: "Memory", href: "/settings/memory" },
    { id: "appearance", label: "Appearance", href: "/settings/appearance" },
    { id: "features", label: "Features", href: "/settings/features" },
    {
        id: "privacy-data",
        label: "Privacy & Data",
        href: "/settings/privacy-data",
    },
    { id: "security", label: "Security", href: "/settings/security" },
    { id: "models", label: "Model Preferences", href: "/settings/models" },
    {
        id: "byok",
        label: "Bring Your Own Keys",
        href: "/settings/byok",
    },
    { id: "connectors", label: "Connectors", href: "/settings/connectors" },
];

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isAuthenticated, authLoading } = useAuth();
    const managedIdentity = COURTOS_CLOUDFLARE_AUTH && (pathname === "/settings" || pathname === "/settings/security");

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push("/");
        }
    }, [isAuthenticated, authLoading, router]);

    if (authLoading) {
        return (
            <div className="h-dvh flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <header className="mx-auto flex h-16 w-full max-w-5xl shrink-0 items-end px-6 pb-2 md:h-24 md:pb-4">
                <h1 className="text-4xl font-medium font-eb-garamond">
                    Settings
                </h1>
            </header>

            <main className="@container/settings mx-auto w-full max-w-5xl flex-1 px-6 pb-10 pt-4 md:pt-6">
                <div className="grid grid-cols-1 gap-y-6 @min-[52rem]/settings:grid-cols-[224px_minmax(0,1fr)] @min-[52rem]/settings:gap-x-10">
                    <nav
                        aria-label="Settings"
                        className="z-10 -ml-3 min-w-0 self-start @min-[52rem]/settings:sticky @min-[52rem]/settings:top-4"
                    >
                        <div className="-m-1 min-w-0 p-1">
                            <div className="-m-1 min-w-0 overflow-x-auto overflow-y-hidden p-1">
                                <ul className="mb-0 flex gap-1 @min-[52rem]/settings:flex-col">
                                    {TABS.filter((tab) => !COURTOS_PILOT_MODE || !isPilotManagedSettingsPath(tab.href)).map((tab) => {
                                        const active =
                                            pathname === tab.href ||
                                            (tab.href !== "/settings" &&
                                                pathname.startsWith(tab.href));
                                        return (
                                            <li key={tab.id}>
                                                <button
                                                    type="button"
                                                    aria-current={
                                                        active
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    onClick={() =>
                                                        router.push(tab.href)
                                                    }
                                                    className={settingsTabButtonClassName(
                                                        active,
                                                    )}
                                                >
                                                    {tab.label}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    </nav>

                    <div className="min-w-0 outline-none">
                        {managedIdentity ? (
                            <section className="space-y-3 text-sm leading-relaxed">
                                <h2 className="font-serif text-2xl">Ihr CourtOS-Zugang</h2>
                                <p className="[overflow-wrap:anywhere]">{user?.email}</p>
                                <p>Sie melden sich mit dem E-Mail-Code des freigegebenen Zugangs an. CourtOS benötigt dafür kein zusätzliches Passwort. Änderungen am Zugang verwaltet der Betreiber.</p>
                            </section>
                        ) : COURTOS_PILOT_MODE && isPilotManagedSettingsPath(pathname) ? (
                            <section className="space-y-3 text-sm leading-relaxed">
                                <h2 className="font-serif text-2xl">Im Testbetrieb zentral eingerichtet</h2>
                                <p>Modelle, Anbieterzugänge und externe Konnektoren werden für diesen Pilot vom Betreiber festgelegt. Eigene Schlüssel sind nicht nötig.</p>
                                <a href="/pilot" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Zurück zum Einstieg</a>
                            </section>
                        ) : children}
                    </div>
                </div>
            </main>
        </div>
    );
}
