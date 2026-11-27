"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function IdeaCapture() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!raw.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/ideas", {
        method: "POST",
        json: {
          raw_input: raw,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      });
      setRaw("");
      setTags("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <label htmlFor="idea" className="block font-semibold">
        New idea
      </label>
      <textarea
        id="idea"
        className="input min-h-28"
        placeholder="AI doesn't fix broken business processes. It makes them faster."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
        }}
        maxLength={20000}
        required
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="Tags, comma separated"
          className="input"
          placeholder="Tags, comma separated (e.g. process, ai)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={saving || !raw.trim()}>
          {saving ? "Saving…" : "Save idea"}
        </button>
      </div>
      <p className="text-xs text-muted">The first line becomes the title. Ctrl/⌘ + Enter saves.</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
