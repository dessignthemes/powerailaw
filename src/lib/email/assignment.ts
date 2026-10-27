import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, layout, button, h, APP_URL } from "@/lib/email/send";
import { getNotificationSettings } from "@/lib/email/settings";

// "You've been assigned a task" (or offered one, or a matter): sent to the
// person when someone else assigns it to them.
export async function emailAssignment(opts: {
  orgId: string;
  toUserId: string;
  actorId?: string | null;
  kind: "task_assigned" | "task_offered" | "matter_assigned" | "task_accepted" | "portal_message" | "internal_message";
  refId: string;
  title: string;
  actorName: string | null;
}) {
  if (opts.kind !== "task_assigned" && opts.kind !== "task_offered" && opts.kind !== "matter_assigned") return;
  if (!(await getNotificationSettings(opts.orgId)).assignEmails) return; // turned off in Administration
  const s = createAdminClient();
  const { data: who } = await s.from("profiles").select("email, full_name").eq("id", opts.toUserId).maybeSingle();
  const to = (who as { email?: string } | null)?.email;
  if (!to) return;

  let details = "";
  let link = `${APP_URL}/dashboard`;
  if (opts.kind === "matter_assigned") {
    link = `${APP_URL}/dashboard/matters/${opts.refId}`;
  } else {
    const { data: t } = await s.from("tasks").select("due_date, priority, board_id, description").eq("org_id", opts.orgId).eq("id", opts.refId).maybeSingle();
    const task = t as { due_date: string | null; priority: string | null; board_id: string | null; description: string | null } | null;
    link = `${APP_URL}/dashboard/task-board?task=${opts.refId}${task?.board_id ? `&board=${task.board_id}` : ""}`;
    const parts: string[] = [];
    if (task?.due_date) parts.push(`<b>Due:</b> ${h(new Date(`${task.due_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}`);
    if (task?.priority) parts.push(`<b>Priority:</b> ${h(task.priority)}`);
    const desc = (task?.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    if (desc) parts.push(`<b>Details:</b> ${h(desc)}${desc.length === 300 ? "…" : ""}`);
    details = parts.length ? `<p style="font-size:14px;line-height:1.6;color:#374151">${parts.join("<br>")}</p>` : "";
  }
  const by = opts.actorName ? ` by ${opts.actorName}` : "";
  const what = opts.kind === "task_offered" ? "A task was offered to you" : opts.kind === "matter_assigned" ? "A matter was assigned to you" : "A task was assigned to you";
  const action = opts.kind === "task_offered" ? "Open the task to accept it" : opts.kind === "matter_assigned" ? "Open the matter" : "Open the task";
  const subject = `${opts.kind === "task_offered" ? "Task offered" : opts.kind === "matter_assigned" ? "Matter assigned" : "New task"}: ${opts.title}`.slice(0, 200);
  const html = layout(what, `<p style="font-size:15px;line-height:1.6"><b>${h(opts.title)}</b>${h(by)}.</p>${details}${button(link, action)}`);
  const text = `${what}${by}: ${opts.title}\n\n${action}: ${link}`;
  // From the person who assigned it (their own Outlook / Gmail); else to themself from their own mailbox.
  await sendEmail({ orgId: opts.orgId, to, subject, html, text, kind: opts.kind, via: [opts.actorId, opts.toUserId] });
}
