"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const SEPARATOR = /\n\s*-{3,}\s*\n/;

/** Parse pasted posts: separated by a line of ---; an optional first line "likes: 120, comments: 30". */
function parsePosts(text: string) {
  return text
    .split(SEPARATOR)
    .map((block) => block.trim())
    .filter((block) => block.length >= 10)
    .map((block) => {
      const lines = block.split("\n");
      const meta = lines[0]!.match(/likes:\s*([\d,]+)(?:.*?comments:\s*([\d,]+))?(?:.*?(https?:\/\/\S+))?/i);
      const body = meta ? lines.slice(1).join("\n").trim() : block;
      const num = (v?: string) => (v ? Number(v.replace(/,/g, "")) : undefined);
      return { text: body, likes: num(meta?.[1]), comments: num(meta?.[2]), url: meta?.[3] };
    })
    .filter((p) => p.text.length >= 10);
}

export function ImportForm({ competitors }: { competitors: Array<{ id: string; name: string; platform: string }> }) {
  const [competitorId, setCompetitorId] = useState(competitors[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const posts = parsePosts(text);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ imported: number; skipped: number }>("/api/v1/research/sources/import", {
        method: "POST",
        json: { competitor_id: competitorId, posts: posts.slice(0, 50) },
      });
      setMsg({ error: false, text: `Imported ${r.imported}${r.skipped ? `, skipped ${r.skipped} already stored` : ""}.` });
      setText("");
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!competitors.length) {
    return <p className="card text-muted">Add or import tracked creators first; pasted posts are linked to a creator.</p>;
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <p className="font-semibold">Paste posts</p>
      <p className="text-sm text-muted">
        Separate posts with a line containing only <code>---</code>. Optionally start a post with a line like{" "}
        <code>likes: 120, comments: 30 https://link-to-post</code> so outliers can be measured. Up to 50 posts at a time.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Creator</span>
        <select className="input" value={competitorId} onChange={(e) => setCompetitorId(e.target.value)}>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.platform})
            </option>
          ))}
        </select>
      </label>
      <textarea className="input" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={busy || posts.length === 0}>
          {busy ? "Importing…" : `Import ${posts.length} post${posts.length === 1 ? "" : "s"}`}
        </button>
        {msg && (
          <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

interface ProbeResult {
  credits: number;
  parsed_items: number;
  first_item_fields: Record<string, boolean | string[]> | null;
  shape: string[];
}

export function ProbeForm() {
  const [platform, setPlatform] = useState("reddit");
  const [mode, setMode] = useState<"search" | "feed">("search");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch<ProbeResult>("/api/v1/research/probe", { method: "POST", json: { platform, mode, value } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <p className="font-semibold">Check a research source (1 credit)</p>
      <p className="text-sm text-muted">
        If a sweep reports “no results parsed”, test that endpoint here. It shows the response structure (field names only) and
        which fields ContentOS could read — send it to your developer if something is missing.
      </p>
      <div className="grid gap-3 sm:grid-cols-[140px_140px_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Platform</span>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {["reddit", "youtube", "tiktok", "threads", "instagram", "x", "linkedin"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Type</span>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "search" | "feed")}>
            <option value="search">Search</option>
            <option value="feed">Creator feed</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{mode === "search" ? "Search phrase" : "Profile link or handle"}</span>
          <input className="input" required minLength={2} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="submit" className="btn-ghost" disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-2 text-sm">
          <p>
            Parsed <span className="metric">{result.parsed_items}</span> items · <span className="metric">{result.credits}</span> credit used
          </p>
          {result.first_item_fields && (
            <p className="text-muted">
              Fields found:{" "}
              {Object.entries(result.first_item_fields)
                .filter(([k, v]) => k !== "raw_keys" && v === true)
                .map(([k]) => k)
                .join(", ") || "none"}
            </p>
          )}
          <pre className="max-h-80 overflow-auto rounded bg-black/5 p-3 text-xs dark:bg-white/5">{result.shape.join("\n")}</pre>
        </div>
      )}
    </form>
  );
}
