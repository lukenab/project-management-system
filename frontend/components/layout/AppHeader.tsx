"use client";

import { LogOut, Menu, Moon, Settings, Sun, UserRound } from "lucide-react";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { previewUser } from "@/lib/preview-data";

import { AppBrand } from "./AppBrand";
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
          className="icon-button header-control theme-control"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? (
            <Sun size={15} aria-hidden="true" />
          ) : (
            <Moon size={15} aria-hidden="true" />
          )}
        </button>
        <NotificationDropdown />
        <div className="header-separator" />
        <DropdownMenu
          label="Account"
          triggerLabel={`Account options for ${previewUser.fullName}`}
          triggerClassName="profile-trigger"
          trigger={
            <span className="user-avatar" aria-hidden="true">
              {previewUser.initials}
            </span>
          }
          header={
            <div className="profile-summary">
              <span className="user-avatar" aria-hidden="true">
                {previewUser.initials}
              </span>
              <span className="profile-summary-copy">
                <strong>{previewUser.fullName}</strong>
                <span>{previewUser.email}</span>
              </span>
            </div>
          }
          groups={[
            [
              { label: "Profile", icon: UserRound },
              { label: "Account settings", icon: Settings },
            ],
            [
              {
                label: "Log out",
                icon: LogOut,
                href: "/login",
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
