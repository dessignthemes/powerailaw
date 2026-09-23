import "server-only";
import { type AiCtx, getPendingAction, claimPendingAction, finishPendingAction, getConversation, audit } from "@/lib/ai/store";
import { executeAction, type ActionResult } from "@/lib/ai/actions";
import { argsHash } from "@/lib/ai/safety";
import { AccessError } from "@/lib/data/documents";

export type Decision =
  | { status: "executed"; result: ActionResult }
  | { status: "cancelled" }
  | { status: "failed"; error: string }
  | { status: "conflict"; error: string };

// Confirm or cancel a proposed action. Arguments come only from the stored
// proposal (never from the request), bound to the user who saw it.
export async function decideAction(ctx: AiCtx, id: string, decision: string): Promise<Decision> {
  const action = await getPendingAction(ctx, id);
  await getConversation(ctx, action.conversation_id);

  if (argsHash(ctx.userId, action.tool, { args: action.args, matterId: action.matter_id }) !== action.args_hash) {
    throw new AccessError(403, "This proposal can't be verified. Ask the assistant to prepare it again.");
  }

  if (action.status === "executed") return { status: "executed", result: action.result as ActionResult };
  if (action.status === "cancelled") return { status: "conflict", error: "This proposal was cancelled." };
  if (action.status === "failed") return { status: "failed", error: action.error ?? "This action failed." };

  if (decision === "cancel") {
    if (action.status === "pending") {
      await finishPendingAction(id, { status: "cancelled" });
      await audit(ctx, `action.${action.tool}.cancelled`, "ai_action", id, action.conversation_id);
    }
    return { status: "cancelled" };
  }
  if (decision !== "confirm") throw new AccessError(403, "Unknown decision.");

  if (!(await claimPendingAction(ctx, id))) {
    const again = await getPendingAction(ctx, id);
    if (again.status === "executed") return { status: "executed", result: again.result as ActionResult };
    return { status: "conflict", error: "This action is already being processed." };
  }

  try {
    const result = await executeAction(ctx, action);
    await finishPendingAction(id, { status: "executed", result });
    await audit(
      ctx,
      `action.${action.tool}.executed`,
      action.tool === "createClient" ? "client" : action.tool === "createTask" ? "task" : "document",
      result.recordId,
      action.conversation_id
    );
    return { status: "executed", result };
  } catch (e) {
    const error = e instanceof AccessError ? e.message : "The action couldn't be completed. Nothing was saved.";
    await finishPendingAction(id, { status: "failed", error });
    await audit(ctx, `action.${action.tool}.failed`, "ai_action", id, action.conversation_id);
    return { status: "failed", error };
  }
}
