import { runAgent } from "../agent";
import { jsonResponse, errorResponse } from "../http";

export async function handleChat(req: Request): Promise<Response> {
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return errorResponse(400, "Field 'message' must be a non-empty string");
  }
  try {
    const result = await runAgent(message);
    return jsonResponse(result);
  } catch (err) {
    console.error("[chat] agent error:", err);
    return errorResponse(500, `Agent failed: ${(err as Error).message}`);
  }
}
