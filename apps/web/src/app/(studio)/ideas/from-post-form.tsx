"use client";

import type { ContentFormat } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const FORMATS: Array<{ id: ContentFormat; label: string }> = [
  { id: "carousel", label: "Carousel" },
  { id: "short_video", label: "Short-video script" },
  { id: "linkedin", label: "LinkedIn post" },
  { id: "x_thread", label: "X thread" },
];
const PLATFORMS = ["linkedin", "x", "instagram", "tiktok", "youtube", "threads", "other"] as const;

/** Respond to someone else's post: paste it, add your take, choose what to make. */
export function FromPostForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("linkedin");
  const [take, setTake] = useState("");
  const [formats, setFormats] = useState<ContentFormat[]>(["carousel", "short_video"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const idea = await apiFetch<{ id: string }>("/api/v1/ideas/from-post", {
        method: "POST",
        json: { post: { text, author, platform, ...(url.trim() ? { url: url.trim() } : {}) }, take: take.trim() || undefined, formats },
      });
      router.push(`/ideas/${idea.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        + Start from someone&apos;s post
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Start from someone&apos;s post</p>
          <p className="text-sm text-muted">
            Paste a post you want to respond to. ContentOS writes your own take on it (agree and go deeper, disagree, or apply it to
            service businesses), credits the author if it mentions their point, and never copies their words.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Their post</span>
        <textarea className="input min-h-32" required minLength={30} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Author</span>
          <input className="input" required maxLength={120} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Platform</span>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Link (optional)</span>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Your take (strongly recommended)</span>
        <textarea
          className="input"
          rows={3}
          maxLength={2000}
          placeholder="What do you agree with, disagree with, or see in your own work that they missed?"
          value={take}
          onChange={(e) => setTake(e.target.value)}
        />
      </label>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 font-medium">Make</legend>
        {FORMATS.map((f) => (
          <label key={f.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formats.includes(f.id)}
              onChange={(e) => setFormats(e.target.checked ? [...formats, f.id] : formats.filter((x) => x !== f.id))}
            />
            {f.label}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn-primary" disabled={busy || formats.length === 0}>
        {busy ? "Saving…" : "Save as idea"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
