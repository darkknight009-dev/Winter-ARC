import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { arcStartDate } from "@/lib/arc";

export interface ArcData {
  profile: Profile;
  habits: Habit[];
  checkins: CheckinRow[];
  freezes: Freeze[];
  snapshots: SnapshotRow[];
}

interface Profile {
  id: string;
  display_name: string;
  identity: string | null;
  commitment: string | null;
  timezone: string;
}

interface Habit {
  id: string;
  label: string;
  icon: string;
  sort_order: number;
}

interface CheckinRow {
  arc_day: number;
  habits_done: string[];
  mood: string | null;
  journal: string | null;
}

interface Freeze {
  arc_day: number;
}

function arcYear(now: Date = new Date()): number {
  return arcStartDate(now).getFullYear();
}

interface SnapshotRow {
  kind: string;
  weight: number | null;
  note: string | null;
  photo_url: string | null;
}

/** Loads everything we need for the arc pages. Redirects if signed out or pre-onboarding. */
export async function getArcData(): Promise<ArcData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const year = arcYear();
  const [profileRes, habitsRes, checkinsRes, freezesRes, snapshotsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("habits").select("*").eq("user_id", user.id).order("sort_order"),
    supabase
      .from("checkins")
      .select("arc_day, habits_done, mood, journal")
      .eq("user_id", user.id)
      .eq("arc_year", year)
      .order("arc_day"),
    supabase.from("freezes").select("arc_day").eq("user_id", user.id).eq("arc_year", year),
    supabase.from("snapshots").select("kind, weight, note, photo_url").eq("user_id", user.id),
  ]);

  if (!profileRes.data) redirect("/onboarding");
  if (profileRes.error) throw profileRes.error;
  if (habitsRes.error) throw habitsRes.error;
  if (checkinsRes.error) throw checkinsRes.error;
  if (freezesRes.error) throw freezesRes.error;
  if (snapshotsRes.error) throw snapshotsRes.error;

  // Photos are private (RLS bucket): stored value is a storage path.
  // Resolve short-lived signed URLs for rendering; legacy public URLs pass through.
  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[];
  for (const s of snapshots) {
    if (s.photo_url && !s.photo_url.startsWith("http")) {
      try {
        const { data: signed } = await supabase.storage
          .from("progress-photos")
          .createSignedUrl(s.photo_url, 3600);
        if (signed?.signedUrl) s.photo_url = signed.signedUrl;
      } catch {
        s.photo_url = null;
      }
    }
  }

  // No habits yet -> onboarding not finished
  if (!habitsRes.data || habitsRes.data.length === 0) redirect("/onboarding");

  return {
    profile: profileRes.data as Profile,
    habits: (habitsRes.data ?? []) as Habit[],
    checkins: (checkinsRes.data ?? []) as CheckinRow[],
    freezes: (freezesRes.data ?? []) as Freeze[],
    snapshots: (snapshotsRes.data ?? []) as SnapshotRow[],
  };
}
