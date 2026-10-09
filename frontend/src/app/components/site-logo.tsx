import Link from "next/link";
import { COURTOS_HOME } from "@/app/lib/courtos";

interface SiteLogoProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
    iconClassName?: string;
    animate?: boolean;
    asLink?: boolean;
}

export function SiteLogo({
    size = "md",
    className = "",
    animate = false,
    asLink = false,
}: SiteLogoProps) {
    const sizeClasses = {
        sm: "text-xl",
        md: "text-2xl",
        lg: "text-4xl",
        xl: "text-6xl",
    };

    const logo = (
        <span
            className={`flex items-center gap-1.5 ${sizeClasses[size]} font-light font-serif ${
                animate ? "sidebar-fade-in" : ""
            } ${className}`}
        >
            CourtOS
        </span>
    );

    if (asLink) {
        return (
            <Link
                href={COURTOS_HOME}
                className="cursor-pointer hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-ring"
            >
                {logo}
            </Link>
        );
    }

    return logo;
}
