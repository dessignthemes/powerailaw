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
  BarChart3,
  Copy,
  Bookmark,
  Folder,
  ShieldCheck,
  PieChart,
  FileText,
  MessagesSquare,
  type LucideIcon,
  ListChecks,
  ShieldAlert,
  UserSearch,
} from "lucide-react";

// ownerOnly: shown only to the workspace owner (none right now; AI Accountant is open to everyone since Oct 19, 2026).
// sub: shown indented under the link above it in the sidebar (e.g. Potential Leads under Client Intake).
export type NavLink = { label: string; href: string; icon: LucideIcon; ownerOnly?: boolean; sub?: boolean };
export type NavSection = { title: string | null; links: NavLink[] };

// Community and Clients are off the menu for now (their pages still exist).
export const mainLinks: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Client Intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Potential Leads", href: "/dashboard/leads", icon: UserSearch, sub: true },
  { label: "Matters", href: "/dashboard/matters", icon: Folder },
  { label: "Contacts", href: "/dashboard/records", icon: Bookmark },
  { label: "Documents", href: "/dashboard/documents", icon: Copy },
];

export const toolLinks: NavLink[] = [
  { label: "AI Agent", href: "/dashboard/agent", icon: Sparkles },
  { label: "AI Accountant", href: "/dashboard/ai-accountant", icon: Calculator },
  { label: "AI Matter", href: "/dashboard/ai-matter", icon: FolderSearch },
  { label: "Conflict Checks", href: "/dashboard/conflict-checks", icon: ShieldAlert },
  { label: "AI Templates", href: "/dashboard/ai-templates", icon: FileText },
  { label: "Communications", href: "/dashboard/communications", icon: MessagesSquare },
  { label: "Time Tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Power PDF", href: "/dashboard/power-pdf", icon: FilePen },
  { label: "Secure Files", href: "/dashboard/secure-files", icon: ShieldCheck },
  { label: "Reports", href: "/dashboard/reports", icon: PieChart },
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
