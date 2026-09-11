import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultOrgId } from "@/lib/data/org";
import type { Client } from "@/components/NewClientModal";

type ClientRow = {
  id: string;
  name: string;
  description: string | null;
  status: Client["status"];
  type: Client["type"];
  email: string | null;
  phone: string | null;
  address: string | null;
  updated_at: string;
};

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    type: row.type,
    email: row.email,
    phone: row.phone,
    address: row.address,
    matterCount: 0, // computed client-side from the matters list, not stored here
    updatedAt: row.updated_at,
  };
}

export async function listClients(): Promise<Client[]> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as ClientRow[]).map(toClient);
}

export async function createClientRow(client: Client): Promise<Client> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id: client.id,
      org_id: orgId,
      name: client.name,
      description: client.description,
      status: client.status,
      type: client.type,
      email: client.email,
      phone: client.phone,
      address: client.address,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toClient(data as ClientRow);
}

export async function updateClientRow(id: string, client: Client): Promise<Client> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data, error } = await supabase
    .from("clients")
    .update({
      name: client.name,
      description: client.description,
      status: client.status,
      type: client.type,
      email: client.email,
      phone: client.phone,
      address: client.address,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) throw error;
  return toClient(data as ClientRow);
}

export async function deleteClientRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { error } = await supabase.from("clients").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
