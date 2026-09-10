"use client";

import { useState } from "react";
import {
  X,
  Users,
  Layers,
  CreditCard,
  Gauge,
  ClipboardList,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const navItems = [
  {
    key: "members",
    label: "Members",
    sub: "Who is here, and their roles",
    icon: Users,
    group: "THE FIRM",
  },
  {
    key: "groups",
    label: "Practice groups",
    sub: "Teams for staffing matters",
    icon: Layers,
    group: "THE FIRM",
  },
  {
    key: "plan",
    label: "Plan & licences",
    sub: "What the firm is entitled to",
    icon: CreditCard,
    group: "THE ACCOUNT",
  },
  {
    key: "usage",
    label: "AI usage",
    sub: "What the AI allowance went on",
    icon: Gauge,
    group: "THE ACCOUNT",
  },
  {
    key: "log",
    label: "Access log",
    sub: "Admins on restricted matters",
    icon: ClipboardList,
    group: "THE ACCOUNT",
  },
] as const;

type PageKey = (typeof navItems)[number]["key"];

function trialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-US");
}

export default function AdminModal({
  ownerEmail,
  onClose,
}: {
  ownerEmail: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState<PageKey>("members");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);
  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const [firmIdentities, setFirmIdentities] = useState<string[]>([]);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [practiceGroups, setPracticeGroups] = useState<string[]>([]);

  const [licenceCount, setLicenceCount] = useState(1);
  const [reviewedNotice, setReviewedNotice] = useState(false);

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    setPendingInvites((prev) => [...prev, inviteEmail.trim()]);
    setInviteEmail("");
    setInviteOpen(false);
  }

  function handleAddPerson() {
    if (!newPerson.trim()) return;
    setFirmIdentities((prev) => [...prev, newPerson.trim()]);
    setNewPerson("");
    setAddPersonOpen(false);
  }

  function handleAddGroup() {
    if (!newGroup.trim()) return;
    setPracticeGroups((prev) => [...prev, newGroup.trim()]);
    setNewGroup("");
    setAddGroupOpen(false);
  }

  function handleReviewChange() {
    setReviewedNotice(true);
    setTimeout(() => setReviewedNotice(false), 2200);
  }

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="bg-cream rounded-3xl w-full max-w-[980px] max-h-[88vh] overflow-hidden flex">
        <div className="w-[240px] flex-shrink-0 border-r border-line px-4 py-6 overflow-y-auto">
          <div className="text-[15px] font-semibold px-2 mb-5">Administration</div>

          {(["THE FIRM", "THE ACCOUNT"] as const).map((group) => (
            <div key={group} className="mb-5">
              <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                {group}
              </div>
              <nav className="flex flex-col gap-0.5">
                {navItems
                  .filter((n) => n.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setPage(item.key)}
                        className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                          page === item.key ? "bg-card-alt" : "hover:bg-card-alt"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="block text-[14px] font-medium">{item.label}</span>
                          <span className="block text-[12px] text-muted">{item.sub}</span>
                        </span>
                      </button>
                    );
                  })}
              </nav>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex justify-end px-9 pt-6">
            <button onClick={onClose} className="text-muted hover:text-ink">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-9 pb-9 -mt-4">
            {page === "members" && (
              <>
                <div className="flex items-start justify-between mb-1.5">
                  <h2 className="text-[26px] font-semibold mt-1">
                    Members ({1 + pendingInvites.length})
                  </h2>
                  <button
                    onClick={() => setInviteOpen((o) => !o)}
                    className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                  >
                    Invite Member
                  </button>
                </div>
                <p className="text-[14px] text-muted mb-6">Manage your team members and their roles</p>

                {inviteOpen && (
                  <div className="flex items-center gap-2 mb-5">
                    <input
                      autoFocus
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      placeholder="colleague@yourfirm.com"
                      className="flex-1 bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                    />
                    <button
                      onClick={handleInvite}
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                    >
                      Send invite
                    </button>
                  </div>
                )}

                <div className="border border-line rounded-2xl divide-y divide-line mb-9">
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <span className="text-[14.5px] font-medium">{ownerEmail}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="bg-dark text-white px-3 py-1 rounded-full text-[12.5px] font-medium">
                        Owner
                      </span>
                      <div className="relative">
                        <button
                          onClick={() =>
                            setMemberMenuOpen(memberMenuOpen === ownerEmail ? null : ownerEmail)
                          }
                          className="w-7 h-7 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
                        >
                          <MoreHorizontal size={16} strokeWidth={1.75} />
                        </button>
                        {memberMenuOpen === ownerEmail && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMemberMenuOpen(null)} />
                            <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[190px]">
                              <div className="px-3 py-2.5 text-[13px] text-muted">
                                The firm owner can&apos;t be removed.
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {pendingInvites.map((email) => (
                    <div key={email} className="flex items-center justify-between gap-4 px-5 py-4">
                      <span className="text-[14.5px] font-medium">{email}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="bg-card-alt px-3 py-1 rounded-full text-[12.5px] font-medium text-muted">
                          Pending
                        </span>
                        <button
                          onClick={() =>
                            setPendingInvites((prev) => prev.filter((e) => e !== email))
                          }
                          className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-3">
                  <div className="text-[15px] font-semibold mb-1.5">Firm identities</div>
                  <p className="text-[13.5px] text-muted mb-4 max-w-[680px]">
                    Confirm coworkers and their alternate addresses. PowerAI Law excludes them
                    from client suggestions and recognizes them as your firm in future mail.
                  </p>

                  {addPersonOpen ? (
                    <div className="flex items-center gap-2 mb-5">
                      <input
                        autoFocus
                        value={newPerson}
                        onChange={(e) => setNewPerson(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
                        placeholder="name@alternateaddress.com"
                        className="flex-1 bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                      />
                      <button
                        onClick={handleAddPerson}
                        className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddPersonOpen(true)}
                      className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors mb-5"
                    >
                      + Add person
                    </button>
                  )}

                  {firmIdentities.length === 0 ? (
                    <div className="border border-line rounded-2xl p-5">
                      <div className="text-[14.5px] font-semibold mb-1">No additional firm identities yet</div>
                      <p className="text-[13.5px] text-muted max-w-[680px]">
                        Organization members and connected mailboxes are already excluded. Add
                        anyone else whose messages should never become client suggestions.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-line rounded-2xl divide-y divide-line">
                      {firmIdentities.map((id) => (
                        <div key={id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                          <span className="text-[14px] font-medium">{id}</span>
                          <button
                            onClick={() =>
                              setFirmIdentities((prev) => prev.filter((x) => x !== id))
                            }
                            className="text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {page === "groups" && (
              <>
                <div className="flex items-start justify-between mb-1.5">
                  <h2 className="text-[26px] font-semibold mt-1">Practice groups</h2>
                  <button
                    onClick={() => setAddGroupOpen((o) => !o)}
                    className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors flex-shrink-0"
                  >
                    + Add group
                  </button>
                </div>
                <p className="text-[14px] text-muted mb-6 max-w-[680px]">
                  Name the teams this firm works in, so a matter can be staffed with one and the
                  day can be read at a team&apos;s width.
                </p>

                {addGroupOpen && (
                  <div className="flex items-center gap-2 mb-5">
                    <input
                      autoFocus
                      value={newGroup}
                      onChange={(e) => setNewGroup(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
                      placeholder="e.g. Litigation team"
                      className="flex-1 bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                    />
                    <button
                      onClick={handleAddGroup}
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                    >
                      Add
                    </button>
                  </div>
                )}

                {practiceGroups.length === 0 ? (
                  <div className="border border-line rounded-2xl p-5">
                    <div className="text-[14.5px] font-semibold mb-1">No practice groups yet</div>
                    <p className="text-[13.5px] text-muted max-w-[680px]">
                      Name a team above and add colleagues to it. A matter can then be staffed
                      with the whole group at once.
                    </p>
                  </div>
                ) : (
                  <div className="border border-line rounded-2xl divide-y divide-line">
                    {practiceGroups.map((g) => (
                      <div key={g} className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <span className="text-[14px] font-medium">{g}</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-[13px] text-muted">0 members</span>
                          <button
                            onClick={() =>
                              setPracticeGroups((prev) => prev.filter((x) => x !== g))
                            }
                            className="text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {page === "plan" && (
              <>
                <h2 className="text-[26px] font-semibold mt-1 mb-1.5">Plan &amp; licences</h2>
                <p className="text-[14px] text-muted mb-6">
                  What this firm is entitled to, what it pays for it, and who is holding it
                </p>

                <div className="border border-line rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
                  <div>
                    <div className="text-[13px] text-muted mb-1">Plan</div>
                    <div className="text-[15px] font-semibold">Trial</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Licences</div>
                    <div className="text-[15px] font-semibold">1</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Allowance renews</div>
                    <div className="text-[15px] font-semibold">until the plan ends</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 mb-1.5">
                  <div className="text-[15px] font-semibold">Subscription</div>
                  <button className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors flex-shrink-0">
                    Manage subscription
                  </button>
                </div>
                <p className="text-[13.5px] text-muted mb-4">
                  The card, past invoices and cancellation all live in the Stripe billing portal.
                </p>

                <div className="border border-line rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
                  <div>
                    <div className="text-[13px] text-muted mb-1">Status</div>
                    <div className="text-[15px] font-semibold">Trial</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Cost</div>
                    <div className="text-[15px] font-semibold">$79 per month</div>
                    <div className="text-[12.5px] text-muted mt-0.5">$79 per licence · Billed monthly</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Licences billed</div>
                    <div className="text-[15px] font-semibold">1</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-muted mb-1">Trial ends</div>
                    <div className="text-[15px] font-semibold">{trialEndDate()}</div>
                  </div>
                </div>

                <div className="text-[15px] font-semibold mb-1.5">Change the licence count</div>
                <p className="text-[13.5px] text-muted mb-4 max-w-[680px]">
                  Raise or lower how many licences this firm pays for. You see what it costs
                  before anything is applied.
                </p>

                <div className="border border-line rounded-2xl p-5 mb-8">
                  <div className="text-[13px] text-muted mb-1.5">Licences</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={licenceCount}
                      onChange={(e) => setLicenceCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-[100px] bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                    />
                    <button
                      onClick={handleReviewChange}
                      disabled={licenceCount === 1}
                      className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      Review change
                    </button>
                    {reviewedNotice && (
                      <span className="text-[13px] text-muted">
                        This would take you to billing checkout.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="text-[15px] font-semibold">Seats</div>
                  <span className="text-[13px] text-muted">1 of {licenceCount} assigned</span>
                </div>
                <div className="border border-line rounded-2xl">
                  <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <span className="text-[14px] font-medium">{ownerEmail}</span>
                    <span className="text-[13px] text-muted">Seat 1</span>
                  </div>
                </div>
              </>
            )}

            {page === "usage" && (
              <>
                <h2 className="text-[26px] font-semibold mt-1 mb-1.5">AI usage</h2>
                <p className="text-[14px] text-muted mb-6">
                  What the firm&apos;s AI allowance went on, month by month
                </p>

                <div className="border border-line rounded-2xl p-5 mb-8">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[15px] font-semibold">Allowance</div>
                    <span className="text-[14px] font-semibold">0%</span>
                  </div>
                  <div className="w-full h-2 bg-card-alt rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-dark rounded-full" style={{ width: "0%" }} />
                  </div>
                  <p className="text-[13.5px] text-muted">Well within this month&apos;s allowance — 0% used.</p>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="text-[16px] font-semibold">{monthLabel}</div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-light cursor-not-allowed"
                    >
                      <ChevronLeft size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      disabled
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-light cursor-not-allowed"
                    >
                      <ChevronRight size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                <div className="border border-line rounded-2xl p-5 flex flex-col gap-5 mb-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[14.5px] font-semibold">Email &amp; document import</div>
                      <span className="text-[13.5px] text-muted">
                        <span className="font-semibold text-ink">17 tokens</span> 85%
                      </span>
                    </div>
                    <p className="text-[13px] text-muted mb-2">Email scanning and document reading, including OCR</p>
                    <div className="w-full h-1.5 bg-card-alt rounded-full overflow-hidden">
                      <div className="h-full bg-dark rounded-full" style={{ width: "85%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[14.5px] font-semibold">Chat</div>
                      <span className="text-[13.5px] text-muted">
                        <span className="font-semibold text-ink">3 tokens</span> 15%
                      </span>
                    </div>
                    <p className="text-[13px] text-muted mb-2">Questions asked of the workspace</p>
                    <div className="w-full h-1.5 bg-card-alt rounded-full overflow-hidden">
                      <div className="h-full bg-dark rounded-full" style={{ width: "15%" }} />
                    </div>
                  </div>
                  <div className="text-[13.5px] text-muted pt-1">20 tokens this month</div>
                </div>

                <p className="text-[13px] text-muted">
                  Tokens are the metered unit of AI reading and writing — a page of text is
                  roughly 500.
                </p>
              </>
            )}

            {page === "log" && (
              <>
                <h2 className="text-[26px] font-semibold mt-1 mb-1.5">Access log</h2>
                <p className="text-[14px] text-muted mb-6 max-w-[680px]">
                  Restricted matters an administrator opened without being assigned to them
                </p>

                <div className="border border-line rounded-2xl p-5">
                  <div className="text-[14.5px] font-semibold mb-1">Nothing to show</div>
                  <p className="text-[13.5px] text-muted">
                    No administrator has opened a restricted matter they were not assigned to.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
