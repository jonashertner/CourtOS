/** Public build-time presentation settings. Security policy lives on the server. */
export const COURTOS_PILOT_MODE =
    process.env.NEXT_PUBLIC_COURTOS_PILOT_MODE === "true";
export const COURTOS_CLOUDFLARE_AUTH =
    process.env.NEXT_PUBLIC_COURTOS_AUTH_MODE === "cloudflare";

export const COURTOS_SELF_REGISTRATION =
    COURTOS_PILOT_MODE && COURTOS_CLOUDFLARE_AUTH &&
    process.env.NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION === "true";

export const COURTOS_HOME = "/pilot";
export const COURTOS_HYBRID_PATH = "/hybrid/";
export const COURTOS_GUIDE_PATH = "/guide/";
export const COURTOS_SOURCE_URL = "https://github.com/jonashertner/CourtOS";
export const COURTOS_UPSTREAM_URL = "https://github.com/open-legal-products/mike";

/** UX guard only: the API must enforce provider and connector restrictions. */
export function isPilotManagedSettingsPath(pathname: string): boolean {
    return ["/settings/byok", "/settings/models", "/settings/connectors"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
}
