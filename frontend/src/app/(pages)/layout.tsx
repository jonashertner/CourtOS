"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { ChatHistoryProvider } from "@/app/contexts/ChatHistoryContext";
import { SidebarContext } from "@/app/contexts/SidebarContext";
import { PageChromeContext } from "@/app/contexts/PageChromeContext";
import { AppSidebar } from "@/app/components/shared/AppSidebar";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { HeaderButtonUI, HeaderButtonsUI } from "@/shared/ui/HeaderButtonsUI";
import { cn } from "@/app/lib/utils";
import { COURTOS_PILOT_MODE, isResearchShellPath, isWordResearchContext } from "@/app/lib/courtos";
import { safeCourtOSResearchNext } from "@/app/lib/authRedirects";
import { ResearchShell } from "@/app/components/courtos/ResearchShell";
import { PilotNotice } from "@/app/components/courtos/PilotNotice";

export default function MikeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isAuthenticated, authLoading } = useAuth();
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => {
        // An outer auth provider may settle before this streamed boundary
        // hydrates. Its first client render must still match the SSR loader.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one hydration transition, independent of auth or streamed content
        setHasMounted(true);
    }, []);
    const router = useRouter();
    const pathname = usePathname();
    const isChatPage =
        /^\/assistant\/chat\/[^/]+\/?$/.test(pathname) ||
        /^\/projects\/[^/]+\/assistant\/chat\/[^/]+\/?$/.test(pathname);
    const [mobileActionsContainer, setMobileActionsContainer] =
        useState<HTMLDivElement | null>(null);

    const [isSidebarOpenDesktop, setIsSidebarOpenDesktop] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("sidebarOpen");
            return saved !== null ? saved === "true" : true;
        }
        return true;
    });

    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            return false;
        }
        return true;
    });

    // Persist what is actually on screen. The mount initializer above reads
    // this key back but `isSidebarOpen` starts open on desktop regardless, so
    // storing anything else leaves the restored preference disagreeing with
    // the rendered sidebar and the first toggle click is spent re-syncing
    // them. Remembering a collapsed sidebar across reloads needs the mount
    // path to apply the stored value too — a separate change.
    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            localStorage.setItem("sidebarOpen", isSidebarOpen.toString());
        }
    }, [isSidebarOpenDesktop]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const isSmall = window.innerWidth < 768;
            if (isSmall && isSidebarOpen) setIsSidebarOpen(false);
            else if (!isSmall && !isSidebarOpen)
                setIsSidebarOpen(isSidebarOpenDesktop);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isSidebarOpen, isSidebarOpenDesktop]);

    const handleSidebarToggle = () => {
        if (window.innerWidth >= 768) {
            setIsSidebarOpenDesktop(!isSidebarOpenDesktop);
            setIsSidebarOpen(!isSidebarOpenDesktop);
        } else {
            setIsSidebarOpen(!isSidebarOpen);
        }
    };

    const handleMobileActionsContainerRef = useCallback(
        (node: HTMLDivElement | null) => {
            setMobileActionsContainer(node);
        },
        [],
    );

    const setSidebarOpen = useCallback((open: boolean) => {
        const isSmall =
            typeof window !== "undefined" && window.innerWidth < 768;
        if (isSmall) {
            if (!open) setIsSidebarOpen(false);
            return;
        }
        setIsSidebarOpen(open);
        setIsSidebarOpenDesktop(open);
    }, []);

    const pageChromeValue = useMemo(
        () => ({ mobileActionsContainer }),
        [mobileActionsContainer],
    );

    const sidebarValue = useMemo(() => ({ setSidebarOpen }), [setSidebarOpen]);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            const next = isWordResearchContext(pathname, new URLSearchParams(window.location.search).get("host"))
                ? "/word/research" : safeCourtOSResearchNext(pathname + window.location.search, "");
            router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
        }
    }, [authLoading, isAuthenticated, pathname, router]);

    if (!hasMounted || authLoading) {
        return <FullScreenLoader />;
    }

    if (!isAuthenticated) return null;

    if (isResearchShellPath(pathname)) {
        return (
            <PageChromeContext.Provider value={pageChromeValue}>
                <SidebarContext.Provider value={sidebarValue}>
                    <ResearchShell>{children}</ResearchShell>
                </SidebarContext.Provider>
            </PageChromeContext.Provider>
        );
    }

    return (
        <ChatHistoryProvider>
            <PageChromeContext.Provider value={pageChromeValue}>
                <SidebarContext.Provider value={sidebarValue}>
                    <div className="h-dvh flex flex-col bg-app-background">
                        <div className="flex-1 flex min-w-0 overflow-visible">
                            <AppSidebar
                                isOpen={isSidebarOpen}
                                onToggle={handleSidebarToggle}
                            />
                            <div className="flex-1 flex flex-col h-dvh md:overflow-hidden relative w-full">
                                {/* Mobile header */}
                                <div
                                    data-slot="mobile-header"
                                    className={cn(
                                        "z-30 flex items-center gap-3 overflow-visible px-4 md:hidden",
                                        isChatPage
                                            ? "pointer-events-none fixed inset-x-0 top-0 bg-transparent py-0.5"
                                            : "relative shrink-0 py-0.5",
                                    )}
                                >
                                    <HeaderButtonsUI
                                        className={cn(
                                            "pointer-events-auto",
                                            // Only the chat page floats this
                                            // bar over scrolling content.
                                            isChatPage && "backdrop-blur-2xl",
                                        )}
                                    >
                                        <HeaderButtonUI
                                            iconOnly
                                            onClick={handleSidebarToggle}
                                            title="Navigation öffnen"
                                            aria-label="Navigation öffnen"
                                            className="min-h-11 min-w-11"
                                        >
                                            <PanelLeft className="h-4 w-4" />
                                        </HeaderButtonUI>
                                    </HeaderButtonsUI>
                                    <div
                                        ref={handleMobileActionsContainerRef}
                                        className="pointer-events-auto ml-auto flex min-w-0 flex-1 items-center justify-end"
                                    />
                                </div>
                                <main className="flex h-full w-full flex-1 flex-col overflow-y-auto md:overflow-hidden">
                                    {COURTOS_PILOT_MODE && <PilotNotice />}
                                    <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
                                </main>
                            </div>
                        </div>
                    </div>
                </SidebarContext.Provider>
            </PageChromeContext.Provider>
        </ChatHistoryProvider>
    );
}
