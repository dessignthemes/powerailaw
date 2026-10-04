// The app's pages, in the order they appear in the sidebar. The sidebar and
// the page switcher at the top of every page both read this list, so they
// always match.

import {
  Home,
  Users,
  Sparkles,
  Calculator,
  Timer,
  UserPlus,
  FilePen,
  Cloud,
  Inbox,
  Calendar,
  ListChecks,
  BarChart3,
  Copy,
  Bookmark,
  CircleUser,
  Folder,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { label: string; href: string; icon: LucideIcon };
export type NavSection = { title: string | null; links: NavLink[] };

export const mainLinks: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Community", href: "/dashboard/community", icon: Users },
];

export const toolLinks: NavLink[] = [
  { label: "AI Agent", href: "/dashboard/agent", icon: Sparkles },
  { label: "AI Accountant", href: "/dashboard/ai-accountant", icon: Calculator },
  { label: "Time Tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Client Intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Power PDF", href: "/dashboard/power-pdf", icon: FilePen },
  { label: "Dropbox", href: "/dashboard/dropbox", icon: Cloud },
];

export const workspaceLinks: NavLink[] = [
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Task Folder", href: "/dashboard/task-folder", icon: ListChecks },
  { label: "Task Board", href: "/dashboard/task-board", icon: BarChart3 },
  { label: "Documents", href: "/dashboard/documents", icon: Copy },
  { label: "Records", href: "/dashboard/records", icon: Bookmark },
  { label: "Clients", href: "/dashboard/clients", icon: CircleUser },
  { label: "Matters", href: "/dashboard/matters", icon: Folder },
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
