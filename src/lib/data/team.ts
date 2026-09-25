import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

export class TeamError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410, message: string) {
    super(message);
  }
}

// Personal / free mail services: a team needs a company domain.
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "zoho.com", "yandex.com", "yandex.ru", "fastmail.com", "hey.com", "tutanota.com", "qq.com",
  "163.com", "wp.pl", "o2.pl", "onet.pl", "interia.pl", "web.de", "t-online.de", "orange.fr", "free.fr",
  "libero.it", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
]);

export function domainOf(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function isCompanyDomain(domain: string) {
  return !!domain && domain.includes(".") && !PUBLIC_EMAIL_DOMAINS.has(domain);
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

export type Me = { id: string; email: string; orgId: string; role: "owner" | "admin" | "member" };

async function me(): Promise<Me> {
  const user = await getSessionUser();
  if (!user) throw new TeamError(401, "Please sign in again.");
  const { data } = await createAdminClient().from("profiles").select("org_id, role, email").eq("id", user.id).maybeSingle();
  if (!data) throw new TeamError(403, "Your account isn't set up yet. Please sign out and sign in again.");
  return { id: user.id, email: (user.email ?? data.email ?? "").toLowerCase(), orgId: data.org_id, role: data.role };
}

function requireManager(m: Me) {
  if (m.role !== "owner" && m.role !== "admin") throw new TeamError(403, "Only the workspace owner or an admin can manage the team.");
}

// ── Reading ───────────────────────────────────────────────────────────────

export async function getTeam(actor?: Me) {
  const m = actor ?? (await me());
  const db = createAdminClient();
  const [members, invites] = await Promise.all([
    db.from("profiles").select("id, email, role, created_at").eq("org_id", m.orgId).order("created_at"),
    db
      .from("workspace_invites")
      .select("id, email, role, invited_by_email, created_at, expires_at")
      .eq("org_id", m.orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  if (members.error) throw members.error;
  const domain = domainOf(m.email);
  const canManage = m.role === "owner" || m.role === "admin";
  return {
    me: { id: m.id, email: m.email, role: m.role },
    members: (members.data ?? []).map((p) => ({ id: p.id as string, email: p.email as string, role: p.role as string, joinedAt: p.created_at as string })),
    invites: canManage
      ? (invites.data ?? []).map((i) => ({ ...i, expired: new Date(i.expires_at as string).getTime() < Date.now() }))
      : [],
    domain,
    canManage,
    canInvite: canManage && isCompanyDomain(domain),
    inviteBlockedReason: !canManage
      ? "Only the workspace owner or an admin can invite people."
      : !isCompanyDomain(domain)
        ? `Teams need a company email address. ${domain || "Your address"} is a personal email service, so this is a solo workspace. Sign in with your firm's email (for example you@yourfirm.com) to invite colleagues.`
        : null,
  };
}

// ── Inviting ──────────────────────────────────────────────────────────────

export async function createInvite(emailRaw: string, roleRaw: string, actor?: Me) {
  const m = actor ?? (await me());
  requireManager(m);
  const email = emailRaw.trim().toLowerCase();
  const role = roleRaw === "admin" ? "admin" : "member";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError(400, "Enter a valid email address.");
  const myDomain = domainOf(m.email);
  if (!isCompanyDomain(myDomain)) {
    throw new TeamError(403, `Teams need a company email address; ${myDomain} is a personal email service.`);
  }
  if (domainOf(email) !== myDomain) {
    throw new TeamError(403, `You can only invite people with an @${myDomain} email address.`);
  }
  if (email === m.email) throw new TeamError(400, "That's your own address.");

  const db = createAdminClient();
  const { data: existing } = await db.from("profiles").select("id").eq("org_id", m.orgId).ilike("email", email).maybeSingle();
  if (existing) throw new TeamError(409, `${email} is already in this workspace.`);

  // Replace any open invite for the same person with a fresh one.
  await db.from("workspace_invites").update({ status: "revoked" }).eq("org_id", m.orgId).eq("email", email).eq("status", "pending");
  const token = newToken();
  const { data, error } = await db
    .from("workspace_invites")
    .insert({ org_id: m.orgId, email, role, token_hash: hashToken(token), invited_by: m.id, invited_by_email: m.email })
    .select("id, email, role, expires_at")
    .single();
  if (error) throw error;
  return { invite: data, token };
}

export async function newInviteLink(inviteId: string, actor?: Me) {
  const m = actor ?? (await me());
  requireManager(m);
  const token = newToken();
  const { data, error } = await createAdminClient()
    .from("workspace_invites")
    .update({ token_hash: hashToken(token), expires_at: new Date(Date.now() + 14 * 86400_000).toISOString() })
    .eq("id", inviteId)
    .eq("org_id", m.orgId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TeamError(404, "That invite is no longer open.");
  return { token };
}

export async function revokeInvite(inviteId: string, actor?: Me) {
  const m = actor ?? (await me());
  requireManager(m);
  await createAdminClient().from("workspace_invites").update({ status: "revoked" }).eq("id", inviteId).eq("org_id", m.orgId).eq("status", "pending");
}

// ── Members ───────────────────────────────────────────────────────────────

export async function changeRole(memberId: string, roleRaw: string, actor?: Me) {
  const m = actor ?? (await me());
  if (m.role !== "owner") throw new TeamError(403, "Only the workspace owner can change roles.");
  if (memberId === m.id) throw new TeamError(400, "You can't change your own role.");
  const role = roleRaw === "admin" ? "admin" : "member";
  const { data } = await createAdminClient()
    .from("profiles")
    .update({ role })
    .eq("id", memberId)
    .eq("org_id", m.orgId)
    .neq("role", "owner")
    .select("id")
    .maybeSingle();
  if (!data) throw new TeamError(404, "Member not found.");
}

// Removing someone gives them a fresh, empty workspace of their own. Tasks,
// clients and matters stay with the team.
export async function removeMember(memberId: string, actor?: Me) {
  const m = actor ?? (await me());
  requireManager(m);
  if (memberId === m.id) throw new TeamError(400, "You can't remove yourself.");
  const db = createAdminClient();
  const { data: target } = await db.from("profiles").select("id, email, role").eq("id", memberId).eq("org_id", m.orgId).maybeSingle();
  if (!target) throw new TeamError(404, "Member not found.");
  if (target.role === "owner") throw new TeamError(403, "The workspace owner can't be removed.");
  if (target.role === "admin" && m.role !== "owner") throw new TeamError(403, "Only the owner can remove an admin.");

  const { data: org, error } = await db.from("organizations").insert({ name: target.email }).select("id").single();
  if (error) throw error;
  await db.from("profiles").update({ org_id: org.id, role: "owner" }).eq("id", memberId);
  // Their private data follows them: mailbox connections, AI chats (general), personal memory.
  await db.from("oauth_connections").update({ org_id: org.id }).eq("connected_by", memberId);
  await db.from("ai_memories").update({ org_id: org.id }).eq("scope", "personal").eq("user_id", memberId);
}

// ── Accepting ─────────────────────────────────────────────────────────────

async function findInvite(token: string) {
  if (!token || token.length < 20) throw new TeamError(404, "This invite link isn't valid.");
  const { data } = await createAdminClient()
    .from("workspace_invites")
    .select("id, org_id, email, role, status, expires_at, invited_by_email")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) throw new TeamError(404, "This invite link isn't valid. Ask for a new one.");
  if (data.status === "accepted") throw new TeamError(410, "This invite has already been used.");
  if (data.status !== "pending") throw new TeamError(410, "This invite was cancelled. Ask for a new one.");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new TeamError(410, "This invite has expired. Ask for a new one.");
  return data;
}

async function workspaceSummary(orgId: string) {
  const db = createAdminClient();
  const count = async (t: string) => (await db.from(t).select("*", { count: "exact", head: true }).eq("org_id", orgId)).count ?? 0;
  const [clients, matters, tasks, documents, members] = await Promise.all([
    count("clients"),
    count("matters"),
    count("tasks"),
    count("documents"),
    count("profiles"),
  ]);
  return { clients, matters, tasks, documents, members };
}

export async function previewInvite(token: string, actor?: Me) {
  const m = actor ?? (await me());
  const inv = await findInvite(token);
  const alreadyMember = m.orgId === inv.org_id;
  const current = alreadyMember ? null : await workspaceSummary(m.orgId);
  return {
    invitedEmail: inv.email,
    invitedBy: inv.invited_by_email,
    role: inv.role,
    teamDomain: domainOf(inv.email),
    signedInAs: m.email,
    emailMatches: m.email === inv.email,
    alreadyMember,
    currentWorkspace: current,
  };
}

export async function acceptInvite(token: string, actor?: Me) {
  const m = actor ?? (await me());
  const inv = await findInvite(token);
  // The invite only works for the exact address it was sent to, and only
  // together with the secret link, so a matching email alone isn't enough.
  if (m.email !== inv.email) {
    throw new TeamError(403, `This invite is for ${inv.email}. You're signed in as ${m.email}. Sign out and sign in with ${inv.email}.`);
  }
  if (!isCompanyDomain(domainOf(inv.email))) throw new TeamError(403, "Team invites need a company email address.");
  if (m.orgId === inv.org_id) throw new TeamError(409, "You're already in this workspace.");

  const db = createAdminClient();
  const { data: claimed } = await db
    .from("workspace_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: m.id })
    .eq("id", inv.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) throw new TeamError(410, "This invite has already been used.");

  const oldOrg = m.orgId;
  const { error } = await db.from("profiles").update({ org_id: inv.org_id, role: inv.role }).eq("id", m.id);
  if (error) throw error;
  await db.from("oauth_connections").update({ org_id: inv.org_id }).eq("connected_by", m.id);
  await db.from("ai_memories").update({ org_id: inv.org_id }).eq("scope", "personal").eq("user_id", m.id);

  // Tidy up the personal workspace they left, but only if it's empty.
  const s = await workspaceSummary(oldOrg);
  if (s.members === 0 && s.clients + s.matters + s.tasks + s.documents === 0) {
    await db.from("organizations").delete().eq("id", oldOrg);
  }
  return { joined: true };
}
