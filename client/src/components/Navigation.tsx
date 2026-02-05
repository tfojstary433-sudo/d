import { Link, useLocation } from "wouter";
import { Trophy, CalendarDays, BarChart3, Settings, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Mecze", icon: Trophy },
    { href: "/tournaments", label: "Turnieje", icon: Trophy },
    { href: "/gazetki", label: "Gazetki", icon: Newspaper },
    { href: "/table", label: "Tabela", icon: Trophy },
    { href: "/schedule", label: "Terminarz", icon: CalendarDays },
    { href: "/stats", label: "Statystyki", icon: BarChart3 },
    { href: "/admin", label: "Admin", icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/80 backdrop-blur-lg lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:flex-col lg:justify-start lg:border-r lg:border-t-0 lg:p-6">
      <div className="hidden lg:mb-12 lg:flex lg:items-center lg:gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)]">
          <Trophy className="h-6 w-6" />
        </div>
        <span className="font-display text-2xl font-bold tracking-tight text-white">SCORE<span className="text-primary">SYNC</span></span>
      </div>

      <div className="flex h-16 items-center justify-around px-2 lg:h-auto lg:flex-col lg:items-stretch lg:gap-2 lg:px-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex flex-col items-center justify-center gap-1 rounded-xl p-2 transition-all duration-200 lg:flex-row lg:justify-start lg:gap-4 lg:px-4 lg:py-3",
                isActive
                  ? "text-primary lg:bg-primary/10 lg:shadow-[0_0_20px_rgba(var(--primary),0.1)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95", isActive && "text-primary fill-current")} />
              <span className={cn("text-[10px] font-medium lg:text-sm", isActive ? "font-bold" : "")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
