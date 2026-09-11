import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultOrgId } from "@/lib/data/org";
import type { Matter } from "@/components/NewMatterModal";

type MatterRow = {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: Matter["status"];
  category: Matter["category"];
  due_date: string | null;
  counterparty: string | null;
  blocker: string | null;
  value: number | null;
  billing_type: Matter["billingType"];
  hourly_rate: number | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
};

function toMatter(row: MatterRow): Matter {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    clientId: row.client_id,
    dueDate: row.due_date,
    category: row.category,
    counterparty: row.counterparty,
    blocker: row.blocker,
    value: row.value,
    billingType: row.billing_type,
    hourlyRate: row.hourly_rate,
    // Not persisted yet — there's no logged-in user/profile to reference
    // until real auth exists. Always comes back unassigned for now.
    assignedTo: null,
    privateNotes: row.private_notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMatters(): Promise<Matter[]> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("matters")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as MatterRow[]).map(toMatter);
}

export async function createMatterRow(matter: Matter): Promise<Matter> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("matters")
    .insert({
      id: matter.id,
      org_id: orgId,
      client_id: matter.clientId,
      title: matter.title,
      description: matter.description,
      status: matter.status,
      category: matter.category,
      due_date: matter.dueDate,
      counterparty: matter.counterparty,
      blocker: matter.blocker,
      value: matter.value,
      billing_type: matter.billingType,
      hourly_rate: matter.hourlyRate,
      private_notes: matter.privateNotes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toMatter(data as MatterRow);
}

export async function updateMatterRow(id: string, matter: Matter): Promise<Matter> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("matters")
    .update({
      client_id: matter.clientId,
      title: matter.title,
      description: matter.description,
      status: matter.status,
      category: matter.category,
      due_date: matter.dueDate,
      counterparty: matter.counterparty,
      blocker: matter.blocker,
      value: matter.value,
      billing_type: matter.billingType,
      hourly_rate: matter.hourlyRate,
      private_notes: matter.privateNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) throw error;
  return toMatter(data as MatterRow);
}

export async function deleteMatterRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { error } = await supabase.from("matters").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
