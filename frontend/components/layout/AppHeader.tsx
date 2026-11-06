"use client";

import { LogOut, Menu, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { signOut, useCurrentUser } from "@/lib/current-user";

import { AppBrand } from "./AppBrand";
import styles from "./header-motion.module.css";
import { HeaderSearch } from "./HeaderSearch";
import { NotificationDropdown } from "./NotificationDropdown";

type AppHeaderProps = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenNavigation: () => void;
};

export function AppHeader({
  theme,
  onToggleTheme,
  onOpenNavigation,
}: AppHeaderProps) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const isAdmin = user?.systemRole === "SYSTEM_ADMINISTRATOR";
  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-button mobile-menu"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
        >
          <Menu size={19} aria-hidden="true" />
        </button>
        <span className="mobile-header-brand">
          <AppBrand />
        </span>
        <HeaderSearch />
      </div>
      <div className="header-actions">
        <button
          type="button"
          className={`icon-button header-control theme-control ${styles.themeToggle}`}
          data-theme={theme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        >
          <span className={styles.themeGlyph} aria-hidden="true">
            <Sun size={15} className={styles.sun} />
            <Moon size={15} className={styles.moon} />
          </span>
        </button>
        <NotificationDropdown />
        <div className="header-separator" />
        <DropdownMenu
          label="Account"
          triggerLabel={`Account options for ${user?.fullName ?? "your account"}`}
          triggerClassName="profile-trigger"
          trigger={
            <span className="user-avatar" aria-hidden="true">
              {user?.initials ?? ""}
            </span>
          }
          header={
            <div className="profile-summary">
              <span className="user-avatar" aria-hidden="true">
                {user?.initials ?? ""}
              </span>
              <span className="profile-summary-copy">
                <strong>{user?.fullName ?? ""}</strong>
                <span>{user?.email ?? ""}</span>
              </span>
            </div>
          }
          groups={[
            [
              { label: "Profile", icon: UserRound, href: "/profile" },
              ...(isAdmin
                ? [
                    {
                      label: "Administration",
                      icon: ShieldCheck,
                      href: "/admin/users",
                    },
                  ]
                : []),
            ],
            [
              {
                label: "Log out",
                icon: LogOut,
                onSelect: async () => {
                  await signOut().catch(() => undefined);
                  router.replace("/login");
                  router.refresh();
                },
                tone: "danger",
              },
            ],
          ]}
          className="profile-dropdown"
        />
      </div>
    </header>
  );
}
