// The app's pages, in the order they appear in the sidebar. The sidebar and
// the page switcher at the top of every page both read this list, so they
// always match.

import {
  Home,
  Sparkles,
  Calculator,
  FolderSearch,
  Timer,
  UserPlus,
  FilePen,
  Inbox,
  Calendar,
  ListChecks,
  BarChart3,
  Copy,
  Bookmark,
  Folder,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// ownerOnly: shown only to the workspace owner (none right now; AI Accountant is open to everyone since Oct 19, 2026).
export type NavLink = { label: string; href: string; icon: LucideIcon; ownerOnly?: boolean };
export type NavSection = { title: string | null; links: NavLink[] };

// Community and Clients are off the menu for now (their pages still exist).
export const mainLinks: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Client Intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Matters", href: "/dashboard/matters", icon: Folder },
  { label: "Contacts", href: "/dashboard/records", icon: Bookmark },
  { label: "Documents", href: "/dashboard/documents", icon: Copy },
];

export const toolLinks: NavLink[] = [
  { label: "AI Agent", href: "/dashboard/agent", icon: Sparkles },
  { label: "AI Accountant", href: "/dashboard/ai-accountant", icon: Calculator },
  { label: "AI Matter", href: "/dashboard/ai-matter", icon: FolderSearch },
  { label: "Time Tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Power PDF", href: "/dashboard/power-pdf", icon: FilePen },
  { label: "Secure Files", href: "/dashboard/secure-files", icon: ShieldCheck },
];

export const workspaceLinks: NavLink[] = [
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Task Folder", href: "/dashboard/task-folder", icon: ListChecks },
  { label: "Task Board", href: "/dashboard/task-board", icon: BarChart3 },
];

export const navSections: NavSection[] = [
  { title: null, links: mainLinks },
  { title: "Tools", links: toolLinks },
  { title: "Workspace", links: workspaceLinks },
];

export const allNavLinks: NavLink[] = navSections.flatMap((s) => s.links);

// Whether a link is the current page (sub pages count, e.g. a matter's page).
export function isActiveLink(href: string, pathname: string | null) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}
