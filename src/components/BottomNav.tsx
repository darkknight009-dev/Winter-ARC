"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, LayoutGrid, Trophy } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Today", icon: Flame },
  { href: "/progress", label: "Progress", icon: LayoutGrid },
  { href: "/report", label: "Report", icon: Trophy },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="nav-item flex-1" data-active={active}>
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
