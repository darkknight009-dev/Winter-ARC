"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";
import { Flame, LayoutGrid, Trophy } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Today", icon: Flame },
  { href: "/progress", label: "Progress", icon: LayoutGrid },
  { href: "/report", label: "Report", icon: Trophy },
];

/**
 * Per-item pending state from React's useLinkStatus (Next.js 16).
 * The tapped tab pulses ember while its page streams in — the user
 * sees immediate feedback instead of a frozen screen.
 */
function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Flame;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <Link
      href={href}
      className="nav-item flex-1"
      data-active={active}
      style={pending ? { opacity: 0.5 } : undefined}
    >
      <Icon
        size={19}
        strokeWidth={active ? 2.2 : 1.8}
        className={pending ? "text-ember at-risk" : undefined}
      />
      {label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={active}
            />
          );
        })}
      </div>
    </nav>
  );
}
