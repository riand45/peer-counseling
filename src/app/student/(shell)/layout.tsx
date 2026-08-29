import { StudentShell } from "@/components/shells/StudentShell";

const navItems = [
  { href: "/student/cerita-saya", label: "Ruang Chat", icon: "💬" },
  { href: "/student/profil", label: "Profil", icon: "🙂" },
];

export default function StudentShellLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell navItems={navItems}>{children}</StudentShell>;
}
