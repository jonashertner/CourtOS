/** Public build-time presentation settings. Security policy lives on the server. */
export const COURTOS_PILOT_MODE =
    process.env.NEXT_PUBLIC_COURTOS_PILOT_MODE === "true";
export const COURTOS_CLOUDFLARE_AUTH =
    process.env.NEXT_PUBLIC_COURTOS_AUTH_MODE === "cloudflare";

export const COURTOS_SELF_REGISTRATION =
    COURTOS_PILOT_MODE && COURTOS_CLOUDFLARE_AUTH &&
    process.env.NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION === "true";

export const COURTOS_KNOWLEDGE_ENABLED = COURTOS_PILOT_MODE &&
    process.env.NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED === "true";

export const COURTOS_HOME = COURTOS_KNOWLEDGE_ENABLED ? "/research" : "/pilot";

/** Keep specialised workspaces reachable without putting them in research navigation. */
export function isResearchShellPath(pathname: string): boolean {
    return COURTOS_KNOWLEDGE_ENABLED && (pathname === "/research" || pathname === "/knowledge" ||
        pathname === "/library" || pathname.startsWith("/library/"));
}
export const COURTOS_HYBRID_PATH = "/hybrid/";
export const COURTOS_GUIDE_PATH = "/guide/";
/** Official landing page links to this standalone browser application. No document hand-off. */
export const COURTOS_CITECHECK_URL = "https://jonashertner.github.io/citecheck/taskpane.html?lang=de";
export const COURTOS_SOURCE_URL = "https://github.com/jonashertner/CourtOS";
export const COURTOS_UPSTREAM_URL = "https://github.com/open-legal-products/mike";

/** UX guard only: the API must enforce provider and connector restrictions. */
export function isPilotManagedSettingsPath(pathname: string): boolean {
    return ["/settings/byok", "/settings/models", "/settings/connectors"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
}
