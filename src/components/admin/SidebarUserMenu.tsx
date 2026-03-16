"use client";

import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/admin/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/admin/ui/dropdown-menu";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

export default function SidebarUserMenu({
  userName,
  userEmail,
  logoutAction,
}: {
  userName: string;
  userEmail: string;
  logoutAction: string;
}) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("admin-theme") as Theme | null;
    if (saved) {
      setTheme(saved);
      applyTheme(saved);
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if ((localStorage.getItem("admin-theme") ?? "system") === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const changeTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("admin-theme", t);
    applyTheme(t);
  };

  const themeIcon = (t: Theme) => {
    if (t === "light") return <Sun className="size-4" />;
    if (t === "dark") return <Moon className="size-4" />;
    return <Monitor className="size-4" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-accent/60 flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors">
        <div className="bg-primary/80 text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full font-medium">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium">{userName}</div>
          <div className="text-muted-foreground truncate text-xs">{userEmail}</div>
        </div>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuItem onClick={() => changeTheme("light")}>
          <Sun className="size-4" />
          Light
          {theme === "light" && <span className="ml-auto text-xs">&#10003;</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("dark")}>
          <Moon className="size-4" />
          Dark
          {theme === "dark" && <span className="ml-auto text-xs">&#10003;</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("system")}>
          <Monitor className="size-4" />
          System
          {theme === "system" && <span className="ml-auto text-xs">&#10003;</span>}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            const form = document.createElement("form");
            form.method = "post";
            form.action = logoutAction;
            document.body.appendChild(form);
            form.submit();
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
