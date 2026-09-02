import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";

type RoleShellProps = {
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function StudentShell(props: RoleShellProps) {
  return <AppShell title="Area Murid" layoutMode="mobile" {...props} />;
}
