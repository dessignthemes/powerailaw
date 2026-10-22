import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, layout, button, h, APP_URL } from "@/lib/email/send";
import { getNotificationSettings } from "@/lib/email/settings";

// The 9 AM check-in: one email per team member with what needs them today, so
// they open LawPower. Sent when it's 9 in the firm's time zone.

type Task = { id: string; title: string; due_date: string | null; status: string; board_id: string | null; priority: string | null; matter_id: string | null };

function localParts(tz: string, now = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { hour: Number(p.hour) % 24, ymd: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday };
}
const pretty = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export async function buildDigest(orgId: string, user: { id: string; email: string; full_name: string | null }, tz: string) {
  const s = createAdminClient();
  const { ymd, weekday } = localParts(tz);
  const weekEnd = new Date(`${ymd}T12:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekYmd = weekEnd.toISOString().slice(0, 10);
  const [{ data: t }, { data: n }, { data: m }] = await Promise.all([
    s.from("tasks").select("id, title, due_date, status, board_id, priority, matter_id").eq("org_id", orgId).eq("assignee", user.email).neq("status", "done").limit(500),
    s.from("notifications").select("id, kind, title").eq("org_id", orgId).eq("user_id", user.id).is("read_at", null).limit(200),
    s.from("matters").select("id, title, matter_number, due_date").eq("org_id", orgId).eq("assigned_to", user.id).neq("status", "Closed").not("due_date", "is", null).lte("due_date", weekYmd).limit(50),
  ]);
  const tasks = (t ?? []) as Task[];
  const overdue = tasks.filter((x) => x.due_date && x.due_date < ymd).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const today = tasks.filter((x) => x.due_date === ymd);
  const week = tasks.filter((x) => x.due_date && x.due_date > ymd && x.due_date <= weekYmd);
  const noDate = tasks.filter((x) => !x.due_date);
  const alerts = (n ?? []) as { id: string; kind: string; title: string }[];
  const portalMsgs = alerts.filter((a) => a.kind === "portal_message");
  const matters = (m ?? []) as { id: string; title: string; matter_number: string | null; due_date: string }[];
  const mattersOverdue = matters.filter((x) => x.due_date < ymd);
  const mattersSoon = matters.filter((x) => x.due_date >= ymd);

  const first = (user.full_name ?? "").split(" ")[0] || "there";
  const quiet = !overdue.length && !today.length && !portalMsgs.length && !mattersOverdue.length;
  const taskLine = (x: Task) =>
    `<li style="margin:4px 0"><a href="${APP_URL}/dashboard/task-board?task=${x.id}" style="color:#1B191A">${h(x.title)}</a>${x.due_date ? ` <span style="color:#6B7280">· due ${h(pretty(x.due_date))}</span>` : ""}${x.priority === "High" ? ` <span style="color:#B42318;font-weight:600">· High</span>` : ""}</li>`;
  const section = (title: string, items: string[], color = "#1B191A") => (items.length ? `<h2 style="font-size:14px;margin:18px 0 6px;color:${color}">${h(title)}</h2><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${items.join("")}</ul>` : "");

  let body = `<p style="font-size:15px;line-height:1.6">Good morning ${h(first)}. ${quiet ? "Nothing overdue and nothing waiting on you this morning. A quick look at your dashboard keeps it that way." : "Here's what needs you today."}</p>`;
  body += section(`Overdue tasks (${overdue.length})`, overdue.slice(0, 10).map(taskLine), "#B42318");
  body += section(`Due today (${today.length})`, today.slice(0, 10).map(taskLine));
  if (portalMsgs.length)
    body += section(
      `Clients waiting for a reply (${portalMsgs.length})`,
      portalMsgs.slice(0, 8).map((a) => `<li style="margin:4px 0"><a href="${APP_URL}/dashboard/matters" style="color:#1B191A">${h(a.title)}</a></li>`),
      "#8A4B14"
    );
  if (mattersOverdue.length || mattersSoon.length)
    body += section(
      "Matter deadlines this week",
      [...mattersOverdue, ...mattersSoon]
        .slice(0, 8)
        .map((x) => `<li style="margin:4px 0"><a href="${APP_URL}/dashboard/matters/${x.id}" style="color:#1B191A">${h(x.matter_number ? `${x.matter_number} · ${x.title}` : x.title)}</a> <span style="color:${x.due_date < ymd ? "#B42318" : "#6B7280"}">· ${x.due_date < ymd ? "was due" : "due"} ${h(pretty(x.due_date))}</span></li>`)
    );
  const extras: string[] = [];
  if (week.length) extras.push(`${week.length} task${week.length === 1 ? "" : "s"} due later this week`);
  if (noDate.length) extras.push(`${noDate.length} open task${noDate.length === 1 ? "" : "s"} with no due date`);
  if (alerts.length - portalMsgs.length > 0) extras.push(`${alerts.length - portalMsgs.length} unread alert${alerts.length - portalMsgs.length === 1 ? "" : "s"}`);
  if (extras.length) body += `<p style="font-size:13px;color:#6B7280;margin-top:16px">Also: ${h(extras.join(" · "))}.</p>`;
  body += button(`${APP_URL}/dashboard`, "Open my dashboard");

  const counts = [overdue.length ? `${overdue.length} overdue` : "", today.length ? `${today.length} due today` : "", portalMsgs.length ? `${portalMsgs.length} client message${portalMsgs.length === 1 ? "" : "s"}` : ""].filter(Boolean);
  const subject = `${weekday} check-in: ${counts.length ? counts.join(", ") : "you're all caught up"}`;
  const text = `Good morning ${first}.\n\n${overdue.length ? `Overdue: ${overdue.map((x) => x.title).join("; ")}\n` : ""}${today.length ? `Due today: ${today.map((x) => x.title).join("; ")}\n` : ""}${portalMsgs.length ? `Clients waiting: ${portalMsgs.length}\n` : ""}\nOpen your dashboard: ${APP_URL}/dashboard`;
  return { subject, html: layout("Your LawPower check-in", body, "Your morning check-in from LawPower AI. To stop these, click your name at the bottom left of LawPower and switch off Morning check-in email."), text };
}

// Sends the check-in to everyone in every firm where it's currently 9 AM
// (unless hour is given: then to firms where the local hour equals it).
export async function sendMorningDigests(opts: { force?: boolean; onlyEmail?: string; orgId?: string } = {}) {
  const s = createAdminClient();
  let oq = s.from("organizations").select("id, timezone");
  if (opts.orgId) oq = oq.eq("id", opts.orgId);
  const { data: orgs } = await oq.limit(500);
  let sent = 0;
  let skipped = 0;
  const firms: string[] = [];
  for (const org of (orgs ?? []) as { id: string; timezone: string | null }[]) {
    const tz = org.timezone || "America/New_York";
    let hour: number;
    try {
      hour = localParts(tz).hour;
    } catch {
      hour = localParts("America/New_York").hour;
    }
    const settings = await getNotificationSettings(org.id);
    if (!opts.force) {
      if (!settings.digest || hour !== settings.digestHour) continue;
      const wd = localParts(tz).weekday;
      if (settings.digestDays === "weekdays" && (wd === "Saturday" || wd === "Sunday")) continue;
    }
    firms.push(org.id);
    const { data: people } = await s.from("profiles").select("id, email, full_name, daily_digest").eq("org_id", org.id).limit(200);
    for (const p of (people ?? []) as { id: string; email: string | null; full_name: string | null; daily_digest?: boolean | null }[]) {
      if (!p.email || p.daily_digest === false) continue;
      if (opts.onlyEmail && p.email.toLowerCase() !== opts.onlyEmail.toLowerCase()) continue;
      const mail = await buildDigest(org.id, { id: p.id, email: p.email, full_name: p.full_name }, tz);
      // From their own mailbox to themselves (free).
      const r = await sendEmail({ orgId: org.id, to: p.email, kind: "daily_digest", via: [p.id], ...mail });
      if (r.ok) sent++;
      else skipped++;
    }
  }
  return { sent, skipped, firms: firms.length };
}
