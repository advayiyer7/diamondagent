import { vectorSearchByText } from "../search";
import { jsonResponse, errorResponse } from "../http";

const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;

export async function handleReferences(req: Request): Promise<Response> {
  let body: { query?: unknown; topK?: unknown };
  try {
    body = (await req.json()) as { query?: unknown; topK?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }

  const query = body.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return errorResponse(400, "Field 'query' must be a non-empty string");
  }

  let topK = DEFAULT_TOP_K;
  if (typeof body.topK === "number" && Number.isFinite(body.topK)) {
    topK = Math.max(1, Math.min(MAX_TOP_K, Math.floor(body.topK)));
  }

  try {
    const hits = await vectorSearchByText(query.trim(), topK);
    return jsonResponse({
      query: query.trim(),
      candidates: hits.map((h) => ({
        id: h.id,
        filename: h.filename,
        url: `/api/images/${h.id}`,
        distance: h.distance,
      })),
    });
  } catch (err) {
    console.error("[references] vector search failed:", err);
    return errorResponse(
      502,
      `Reference retrieval failed: ${(err as Error).message}`,
    );
  }
}
