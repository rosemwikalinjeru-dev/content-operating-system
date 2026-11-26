import { api, json } from "@/lib/api/handler";

export const GET = api(async () => json({ status: "ok" }));
