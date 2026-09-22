import "server-only";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user's id, or null if there's no valid session.
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
