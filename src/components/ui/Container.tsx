import { type HTMLAttributes, type ReactNode } from "react";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  as?: "div" | "section" | "article" | "main";
  padding?: boolean;
}

/**
 * Responsive layout container — mobile-first, desktop-ready.
 *
 * Built today with mobile defaults. A future desktop rule can be added
 * without touching the component's internal structure:
 *
 *   <Container className="desktop:max-w-desktop">...</Container>
 *
 * The breakpoint system uses Tailwind's `tablet:` / `desktop:` prefixes.
 */
export function Container({
  children,
  as: Tag = "div",
  padding = true,
  className = "",
  ...props
}: ContainerProps) {
  return (
    <Tag
      className={`
        w-full mx-auto
        max-w-7xl
        ${padding ? "px-spacing-lg tablet:px-spacing-xl" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * Responsive grid — mobile-first single column, expands on larger screens.
 */
interface GridProps {
  children: ReactNode;
  /** Number of columns at each breakpoint: [mobile, tablet, desktop] */
  cols?: [number, number?, number?];
  gap?: string;
  className?: string;
}

export function Grid({
  children,
  cols = [1, 2, 3],
  gap = "gap-spacing-lg",
  className = "",
}: GridProps) {
  const [mobile, tablet, desktop] = cols;

  /* Tailwind v4 requires static class names — map the tuple to safe values */
  const mobileClass = mobile === 2 ? "grid-cols-2" : "grid-cols-1";
  const tabletClass =
    tablet === 2
      ? "tablet:grid-cols-2"
      : tablet === 3
        ? "tablet:grid-cols-3"
        : "";
  const desktopClass =
    desktop === 2
      ? "desktop:grid-cols-2"
      : desktop === 3
        ? "desktop:grid-cols-3"
        : desktop === 4
          ? "desktop:grid-cols-4"
          : "";

  return (
    <div
      className={`grid ${mobileClass} ${tabletClass} ${desktopClass} ${gap} ${className}`}
    >
      {children}
    </div>
  );
}
