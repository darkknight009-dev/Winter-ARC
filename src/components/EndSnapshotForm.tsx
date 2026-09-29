"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function EndSnapshotForm() {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!weight && !note && !photo) {
      setError("Add a photo, a weight, or a few final words.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let photoUrl: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${user.id}/end.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("progress-photos")
          .upload(path, photo, { upsert: true });
        if (!upErr) {
          const { data } = supabase.storage.from("progress-photos").getPublicUrl(path);
          photoUrl = data.publicUrl;
        }
      }

      const { error } = await supabase.from("snapshots").upsert(
        {
          user_id: user.id,
          kind: "end",
          weight: weight ? Number(weight) : null,
          note: note || null,
          photo_url: photoUrl,
        },
        { onConflict: "user_id,kind" }
      );
      if (error) throw error;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="eyebrow mb-2 block">Final weight · optional</label>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg or lb"
        />
      </div>

      <div>
        <label className="eyebrow mb-2 block">Final photograph · optional</label>
        <input
          className="input"
          type="file"
          accept="image/*"
          onChange={(e) => {
            setPhoto(e.target.files?.[0] ?? null);
            setPreview(e.target.files?.[0] ? URL.createObjectURL(e.target.files![0]) : null);
          }}
        />
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Day 151"
          className="h-28 rounded-sm border border-rule object-cover grayscale"
        />
      )}

      <div>
        <label className="eyebrow mb-2 block">Final words to your Oct 1 self</label>
        <textarea
          className="input min-h-24 resize-none"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="You had no idea what was coming…"
          maxLength={1000}
        />
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <button className="btn btn-primary w-full" onClick={save} disabled={saving}>
        {saving ? "Sealing…" : "Seal the record"}
      </button>
    </div>
  );
}
