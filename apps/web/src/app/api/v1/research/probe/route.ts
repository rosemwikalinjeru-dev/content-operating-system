import { ResearchProbeRequest } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { describeShape, ScrapeCreatorsClient, ScrapeCreatorsError, type ResearchPlatform } from "@contentos/research-engine";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Owner-only diagnostic: call one ScrapeCreators endpoint (1 credit) and return the response
 * SHAPE (key paths and types) plus how many items the normaliser parsed and which fields it
 * found. No values, no key. Used to confirm field names when an endpoint returns nothing.
 */
export const POST = api(async ({ req }) => {
  await requireApiSession();
  const input = await parseJson(req, ResearchProbeRequest);
  const apiKey = (process.env.SCRAPECREATORS_API_KEY ?? "").trim();
  if (!apiKey) throw new AppError("SERVICE_UNAVAILABLE", "SCRAPECREATORS_API_KEY is not set in Vercel.");
  const client = new ScrapeCreatorsClient({ apiKey, retries: 0 });
  try {
    const platform = input.platform as ResearchPlatform;
    const res = input.mode === "search" ? await client.search(platform, input.value) : await client.feed(platform, input.value);
    const first = res.items[0];
    return json({
      credits: client.creditsUsed,
      parsed_items: res.items.length,
      first_item_fields: first
        ? {
            text: first.text.length > 0,
            url: Boolean(first.url),
            author: Boolean(first.author),
            published_at: Boolean(first.publishedAt),
            views: first.metrics.views != null,
            likes: first.metrics.likes != null,
            comments: first.metrics.comments != null,
            shares: first.metrics.shares != null,
            raw_keys: first.rawKeys,
          }
        : null,
      shape: describeShape(res.payload),
    });
  } catch (err) {
    if (err instanceof ScrapeCreatorsError) {
      throw new AppError(err.retryable ? "SERVICE_UNAVAILABLE" : "PROVIDER_ERROR", err.message, { status: err.status });
    }
    throw err;
  }
});
