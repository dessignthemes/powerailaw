"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { initialsFor } from "@/lib/initials";

// Client photo, or initials (people) / a building icon (companies) when there's no photo.
export default function ClientAvatar({
  name,
  company,
  src,
  size = 36,
}: {
  name: string;
  company?: boolean;
  src?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!src && !broken;
  return (
    <span
      className="rounded-full bg-card-alt border border-line overflow-hidden flex items-center justify-center text-muted font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : company ? (
        <Building2 size={Math.round(size * 0.44)} />
      ) : (
        initialsFor(name, null)
      )}
    </span>
  );
}
