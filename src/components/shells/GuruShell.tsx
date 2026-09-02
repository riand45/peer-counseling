import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";

type RoleShellProps = {
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function GuruShell(props: RoleShellProps) {
  return <AppShell title="Area Guru" {...props} />;
}
