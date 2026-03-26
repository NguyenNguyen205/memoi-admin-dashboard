"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ArrowRightLeft, Archive, Users } from "lucide-react";

export function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Orders", href: "/orders", icon: Package },
        { name: "Exchanges", href: "/exchanges", icon: ArrowRightLeft },
        { name: "Inventory", href: "/inventory", icon: Archive },
        { name: "Customers", href: "/customers", icon: Users },
    ];

    return (
        <aside className="w-64 border-r border-divider bg-content1 flex flex-col hidden md:flex shrink-0">
            <div className="p-6 border-b border-divider">
                <h1 className="text-xl font-bold tracking-tight">Admin OS</h1>
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-default-500 hover:text-foreground hover:bg-default-100"
                                }`}
                        >
                            <Icon size={20} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}