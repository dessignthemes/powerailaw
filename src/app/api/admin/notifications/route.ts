import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanSettings, getNotificationSettings } from "@/lib/email/settings";
import { sendingMailbox } from "@/lib/mail/sendMail";
import { getUserConnections } from "@/lib/data/oauth";
import { canSend } from "@/lib/mail/tokens";
import { sendMorningDigests } from "@/lib/email/digest";
import { emailAssignment } from "@/lib/email/assignment";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Administration → Email notifications.
// GET → { settings, people: [{ id, email, name, role, digest, canSend }] }
// PATCH { settings?, person?: { id, digest } } → saves.
// POST { test: "digest" | "assignment" } → sends a test to the signed-in person.
export async function GET() {
  try {
    const { orgId } = await requireUserOrg();
    const s = createAdminClient();
    const [settings, { data: people }] = await Promise.all([getNotificationSettings(orgId), s.from("profiles").select("id, email, full_name, role, daily_digest").eq("org_id", orgId).order("email")]);
    const rows = (people ?? []) as { id: string; email: string | null; full_name: string | null; role: string; daily_digest?: boolean | null }[];
    const withSend = await Promise.all(
      rows.map(async (p) => {
        const conns = await getUserConnections(p.id).catch(() => []);
        return { id: p.id, email: p.email, name: p.full_name, role: p.role, digest: p.daily_digest !== false, canSend: conns.some((c) => canSend(c)) };
      })
    );
    return NextResponse.json({ settings, people: withSend });
  } catch (e) {
    console.error("GET /api/admin/notifications failed:", e);
    return NextResponse.json({ error: "Couldn't load the email settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { settings?: unknown; person?: { id?: unknown; digest?: unknown } };
    const s = createAdminClient();
    if (b.settings) {
      const { error } = await s.from("organizations").update({ notification_settings: cleanSettings(b.settings) }).eq("id", orgId);
      if (error) return NextResponse.json({ error: "Couldn't save. Run migration 0051_notification_settings.sql in Supabase first." }, { status: 503 });
    }
    if (b.person && typeof b.person.id === "string") {
      const { error } = await s.from("profiles").update({ daily_digest: b.person.digest !== false }).eq("org_id", orgId).eq("id", b.person.id);
      if (error) return NextResponse.json({ error: "Couldn't save. Run migration 0050_email_log_digest.sql in Supabase first." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, settings: await getNotificationSettings(orgId) });
  } catch (e) {
    console.error("PATCH /api/admin/notifications failed:", e);
    return NextResponse.json({ error: "Couldn't save the email settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { test?: string };
    if (!(await sendingMailbox(user.id)) && !process.env.RESEND_API_KEY)
      return NextResponse.json({ error: "Your mailbox can't send yet. Reconnect Outlook (Inbox → Reconnect Outlook) and keep “Send email” ticked, then try again." }, { status: 400 });
    if (b.test === "digest") {
      const r = await sendMorningDigests({ force: true, onlyEmail: user.email ?? "", orgId });
      return r.sent ? NextResponse.json({ ok: true, to: user.email }) : NextResponse.json({ error: "The test check-in couldn't be sent. Check that Outlook is reconnected with “Send email”." }, { status: 502 });
    }
    if (b.test === "assignment") {
      const { data: t } = await createAdminClient().from("tasks").select("id, title").eq("org_id", orgId).neq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const task = t as { id: string; title: string } | null;
      await emailAssignment({ orgId, toUserId: user.id, actorId: user.id, kind: "task_assigned", refId: task?.id ?? "00000000-0000-0000-0000-000000000000", title: `${task?.title ?? "Example task"} (test)`, actorName: "LawPower test" });
      return NextResponse.json({ ok: true, to: user.email });
    }
    return NextResponse.json({ error: "Unknown test." }, { status: 400 });
  } catch (e) {
    console.error("POST /api/admin/notifications failed:", e);
    return NextResponse.json({ error: "The test couldn't be sent." }, { status: 500 });
  }
}
