"use client";

import { useState } from "react";
import {
  X,
  Check,
  CheckCircle2,
  CircleDashed,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";

export type ClientStatus = "Active" | "Archived";
export type ClientType = "Individual" | "Legal entity";

export type Client = {
  id: string;
  name: string;
  description: string;
  status: ClientStatus;
  type: ClientType;
  email: string | null;
  phone: string | null;
  address: string | null;
  matterCount: number;
  updatedAt: string;
};

export const statusMeta: Record<ClientStatus, { icon: typeof CheckCircle2; color: string }> = {
  Active: { icon: CheckCircle2, color: "text-green-600" },
  Archived: { icon: CircleDashed, color: "text-muted" },
};

export const typeMeta: Record<ClientType, { icon: typeof User }> = {
  Individual: { icon: User },
  "Legal entity": { icon: Building2 },
};

const avatarPalette = ["#B03A6B", "#3B6BA5", "#8A6D1D", "#4E7C59", "#7B4EA6", "#A5522C"];

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function InlineField({
  icon,
  label,
  value,
  placeholder,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    onChange(draft.trim() ? draft.trim() : null);
    setOpen(false);
  }

  if (open) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="bg-card-alt border border-line rounded-full px-3.5 py-1.5 text-[13px] font-medium outline-none placeholder:text-muted min-w-[160px]"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value ?? "");
        setOpen(true);
      }}
      className="flex items-center gap-1.5 bg-card-alt hover:bg-line/50 transition-colors px-3 py-1.5 rounded-full text-[13px] font-medium"
    >
      {icon}
      {value ?? label}
    </button>
  );
}

export default function NewClientModal({
  client,
  onClose,
  onSubmit,
}: {
  client?: Client;
  onClose: () => void;
  onSubmit: (client: Client) => void;
}) {
  const isEdit = !!client;
  const [name, setName] = useState(client?.name ?? "");
  const [description, setDescription] = useState(client?.description ?? "");
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "Active");
  const [type, setType] = useState<ClientType>(client?.type ?? "Individual");
  const [email, setEmail] = useState<string | null>(client?.email ?? null);
  const [phone, setPhone] = useState<string | null>(client?.phone ?? null);
  const [address, setAddress] = useState<string | null>(client?.address ?? null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const StatusIcon = statusMeta[status].icon;
  const TypeIcon = typeMeta[type].icon;

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({
      id: client?.id ?? crypto.randomUUID(),
      name: name.trim(),
      description,
      status,
      type,
      email,
      phone,
      address,
      matterCount: client?.matterCount ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-cream rounded-3xl w-full max-w-[680px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full">Clients</span>
            <span>›</span>
            <span className="text-ink font-semibold">{isEdit ? "Edit client" : "New client"}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-4 pb-2">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-medium mb-5"
            style={
              name.trim()
                ? { backgroundColor: getAvatarColor(name), color: "#fff" }
                : { backgroundColor: "var(--line)", color: "var(--muted)" }
            }
          >
            {name.trim() ? getInitials(name) : "?"}
          </div>

          <div className="relative mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 255))}
              placeholder="Client name"
              maxLength={255}
              className="w-full bg-transparent outline-none text-[26px] font-medium placeholder:text-muted-light pr-14"
              autoFocus
            />
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[12px] text-muted-light">
              {name.length}/255
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent outline-none text-[14px] placeholder:text-muted resize-none"
          />
        </div>

        <div className="px-7 pt-3 pb-6 flex flex-wrap items-center gap-2">
          <GenericDropdown
            open={statusOpen}
            setOpen={setStatusOpen}
            trigger={
              <>
                <StatusIcon size={13} strokeWidth={2} className={statusMeta[status].color} />
                {status}
              </>
            }
          >
            {(Object.keys(statusMeta) as ClientStatus[]).map((s) => {
              const Icon = statusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setStatusOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={2} className={statusMeta[s].color} />
                    {s}
                  </span>
                  {s === status && <Check size={14} strokeWidth={2} />}
                </button>
              );
            })}
          </GenericDropdown>

          <GenericDropdown
            open={typeOpen}
            setOpen={setTypeOpen}
            trigger={
              <>
                <TypeIcon size={13} strokeWidth={1.75} />
                {type}
              </>
            }
          >
            {(Object.keys(typeMeta) as ClientType[]).map((t) => {
              const Icon = typeMeta[t].icon;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    setTypeOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={1.75} />
                    {t}
                  </span>
                  {t === type && <Check size={14} strokeWidth={2} />}
                </button>
              );
            })}
          </GenericDropdown>

          <InlineField
            icon={<Mail size={13} strokeWidth={1.75} />}
            label="Email"
            value={email}
            placeholder="email@example.com"
            onChange={setEmail}
          />
          <InlineField
            icon={<Phone size={13} strokeWidth={1.75} />}
            label="Phone"
            value={phone}
            placeholder="+1 (555) 000-0000"
            onChange={setPhone}
          />
          <InlineField
            icon={<MapPin size={13} strokeWidth={1.75} />}
            label="Address"
            value={address}
            placeholder="Street, city, state"
            onChange={setAddress}
          />
        </div>

        <div className="flex items-center justify-end px-7 py-5 border-t border-line">
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="bg-dark text-white px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-dark2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
