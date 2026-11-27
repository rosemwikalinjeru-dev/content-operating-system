"use client";

import { KINDS_REQUIRING_VERIFICATION, KNOWLEDGE_KINDS, type KnowledgeEntry, type KnowledgeKind } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const KIND_LABEL: Record<KnowledgeKind, string> = {
  example_post: "Example post (voice)",
  opinion: "Opinion",
  experience: "Experience",
  story: "Story",
  fact: "Fact",
  voice_rule: "Voice rule",
  audience_insight: "Audience insight",
  offer: "Offer",
  banned_phrase: "Banned phrase",
};

const needsVerification = (k: KnowledgeKind) => KINDS_REQUIRING_VERIFICATION.includes(k);

export function KnowledgeManager({ entries }: { entries: KnowledgeEntry[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<KnowledgeKind>("example_post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ kind: "ok", text });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const importSamples = () =>
    run("import", async () => {
      const res = await apiFetch<{ imported: number; skipped: number }>("/api/v1/knowledge/import-voice-samples", { method: "POST" });
      return res.imported ? `Imported ${res.imported} voice samples.` : "Your voice samples are already in the knowledge base.";
    });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run("add", async () => {
      await apiFetch("/api/v1/knowledge", { method: "POST", json: { kind, title, body, verified } });
      setTitle("");
      setBody("");
      setVerified(false);
      return "Saved.";
    });
  };

  const toggleVerified = (entry: KnowledgeEntry) =>
    run(entry.id, async () => {
      await apiFetch(`/api/v1/knowledge/${entry.id}`, { method: "PATCH", json: { verified: !entry.verified } });
    });

  const remove = (entry: KnowledgeEntry) => {
    if (!window.confirm(`Remove “${entry.title}” from the knowledge base?`)) return;
    void run(entry.id, async () => {
      await apiFetch(`/api/v1/knowledge/${entry.id}`, { method: "DELETE" });
    });
  };

  const examples = entries.filter((e) => e.kind === "example_post").length;

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Your voice samples</p>
          <p className="text-sm text-muted">Import the four posts you shared as your first voice examples.</p>
        </div>
        <button className="btn-ghost whitespace-nowrap" onClick={importSamples} disabled={busy !== null}>
          {busy === "import" ? "Importing…" : "Import voice samples"}
        </button>
      </div>

      <form onSubmit={add} className="card space-y-3">
        <p className="font-semibold">Add knowledge</p>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)}>
              {KNOWLEDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Title</span>
            <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Content</span>
          <textarea className="input" required rows={6} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {needsVerification(kind) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            I confirm this is true and can be used in content
          </label>
        )}
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === "add" ? "Saving…" : "Save"}
        </button>
      </form>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-muted"}`}>
          {message.text}
        </p>
      )}

      <div className="space-y-3">
        <p className="text-sm text-muted">
          <span className="metric">{entries.length}</span> entries · <span className="metric">{examples}</span> voice examples
        </p>
        {entries.length === 0 ? (
          <p className="card text-muted">Nothing here yet.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="card space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{e.title}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="chip">{KIND_LABEL[e.kind]}</span>
                      {needsVerification(e.kind) && (
                        <span className={`chip ${e.verified ? "" : "border-[var(--color-gold)]"}`}>
                          {e.verified ? "Verified" : "Not verified: not used"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {needsVerification(e.kind) && (
                      <button className="btn-ghost" disabled={busy !== null} onClick={() => toggleVerified(e)}>
                        {e.verified ? "Unverify" : "Mark verified"}
                      </button>
                    )}
                    <button className="btn-ghost" disabled={busy !== null} onClick={() => remove(e)}>
                      Remove
                    </button>
                  </div>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-sm text-muted">{e.body}</p>
                {e.source && <p className="text-xs text-muted">{e.source}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
