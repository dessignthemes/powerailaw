"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertTriangle, Users, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Preview = {
  invitedEmail: string;
  invitedBy: string | null;
  role: "admin" | "member";
  teamDomain: string;
  signedInAs: string;
  emailMatches: boolean;
  alreadyMember: boolean;
  currentWorkspace: { clients: number; matters: number; tasks: number; documents: number } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "error"; message: string }
  | { kind: "ready"; p: Preview };

function goToLogin(token: string) {
  // The auth callback returns here after sign-in.
  document.cookie = `post_auth_next=${encodeURIComponent(`/invite/${token}`)}; path=/; max-age=900; samesite=lax`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full navigation so the sign-in starts clean
  window.location.href = "/login";
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return setState({ kind: "signin" });
        if (!res.ok) return setState({ kind: "error", message: data?.error ?? "This invite couldn't be opened." });
        setState({ kind: "ready", p: data });
      })
      .catch(() => setState({ kind: "error", message: "Couldn't reach LawPower AI. Check your connection and try again." }));
  }, [token]);

  async function switchAccount() {
    await createClient().auth.signOut();
    goToLogin(token);
  }

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Couldn't join the workspace.");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the new workspace's data loads
      window.location.href = "/dashboard";
    } catch (e) {
      setJoinError((e as Error).message);
      setJoining(false);
    }
  }

  const s = state.kind === "ready" ? state.p : null;
  const leftBehind = s?.currentWorkspace ? s.currentWorkspace.clients + s.currentWorkspace.matters + s.currentWorkspace.tasks + s.currentWorkspace.documents : 0;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="w-full max-w-[440px] bg-card-alt rounded-3xl p-8">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-md bg-dark text-white flex items-center justify-center text-[14px] font-bold font-display">L</div>
          <span className="font-display font-semibold text-[18px]">LawPower AI</span>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center justify-center gap-2 text-[14px] text-muted py-6">
            <Loader2 size={15} className="animate-spin" /> Opening invite…
          </div>
        )}

        {state.kind === "signin" && (
          <div className="text-center">
            <Users size={22} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
            <h1 className="font-display text-[22px] font-semibold mb-2">You&apos;ve been invited to a team</h1>
            <p className="text-[14px] text-muted mb-6">Sign in with the work email address the invite was sent to.</p>
            <button onClick={() => goToLogin(token)} className="w-full bg-dark text-white py-3 rounded-full text-[14.5px] font-medium hover:bg-dark2">
              Sign in to accept
            </button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="text-center">
            <AlertTriangle size={22} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
            <p className="text-[14.5px] mb-6">{state.message}</p>
            <a href="/dashboard" className="text-[14px] underline underline-offset-2 text-muted hover:text-ink">
              Go to your dashboard
            </a>
          </div>
        )}

        {s && s.alreadyMember && (
          <div className="text-center">
            <Check size={22} className="mx-auto mb-3 text-[#2F5E2A]" />
            <p className="text-[14.5px] mb-6">You&apos;re already in the {s.teamDomain} workspace.</p>
            <a href="/dashboard" className="inline-block bg-dark text-white px-6 py-3 rounded-full text-[14.5px] font-medium hover:bg-dark2">
              Go to dashboard
            </a>
          </div>
        )}

        {s && !s.alreadyMember && !s.emailMatches && (
          <div className="text-center">
            <AlertTriangle size={22} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
            <h1 className="font-display text-[20px] font-semibold mb-2">Wrong account</h1>
            <p className="text-[14px] text-muted mb-6">
              This invite is for <span className="text-ink font-medium">{s.invitedEmail}</span>, but you&apos;re signed in as{" "}
              <span className="text-ink font-medium">{s.signedInAs}</span>.
            </p>
            <button onClick={switchAccount} className="w-full bg-dark text-white py-3 rounded-full text-[14.5px] font-medium hover:bg-dark2">
              Sign in as {s.invitedEmail}
            </button>
          </div>
        )}

        {s && !s.alreadyMember && s.emailMatches && (
          <div>
            <Users size={22} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
            <h1 className="font-display text-[22px] font-semibold mb-2 text-center">Join the {s.teamDomain} team</h1>
            <p className="text-[14px] text-muted mb-6 text-center">
              {s.invitedBy ? (
                <>
                  <span className="text-ink font-medium">{s.invitedBy}</span> invited you
                </>
              ) : (
                "You've been invited"
              )}{" "}
              as {s.role === "admin" ? "an admin" : "a member"}. You&apos;ll share clients, matters, documents and tasks with the team.
            </p>
            {leftBehind > 0 && s.currentWorkspace && (
              <div className="rounded-xl bg-[#F5E3B3]/60 border border-[#E6CF8F] px-4 py-3 text-[13px] mb-5">
                Your current workspace has {s.currentWorkspace.clients} clients, {s.currentWorkspace.matters} matters, {s.currentWorkspace.tasks} tasks and{" "}
                {s.currentWorkspace.documents} documents. They stay there and won&apos;t be moved into the team workspace.
              </div>
            )}
            {joinError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 mb-4">{joinError}</div>}
            <button onClick={join} disabled={joining} className="w-full bg-dark text-white py-3 rounded-full text-[14.5px] font-medium hover:bg-dark2 disabled:opacity-60 flex items-center justify-center gap-2">
              {joining && <Loader2 size={15} className="animate-spin" />} Join team
            </button>
            <p className="text-[12px] text-muted text-center mt-4">Signed in as {s.signedInAs}</p>
          </div>
        )}
      </div>
    </div>
  );
}
