export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Profile {
  id: string;
  display_name: string;
  identity: string | null;
  commitment: string | null;
  timezone: string;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  label: string;
  icon: string;
  cadence: string;
  sort_order: number;
  created_at: string;
}

export interface Checkin {
  id: string;
  user_id: string;
  arc_year: number;
  arc_day: number;
  date: string; // yyyy-mm-dd
  habits_done: string[];
  mood: string | null;
  journal: string | null;
  /** The user's local midnight for this day; past this instant the row is sealed. */
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Freeze {
  id: string;
  user_id: string;
  arc_year: number;
  arc_day: number;
  date: string;
  created_at: string;
}

export interface Snapshot {
  id: string;
  user_id: string;
  kind: "start" | "end";
  weight: number | null;
  note: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      habits: { Row: Habit; Insert: Partial<Habit>; Update: Partial<Habit> };
      checkins: { Row: Checkin; Insert: Partial<Checkin>; Update: Partial<Checkin> };
      freezes: { Row: Freeze; Insert: Partial<Freeze>; Update: Partial<Freeze> };
      snapshots: { Row: Snapshot; Insert: Partial<Snapshot>; Update: Partial<Snapshot> };
    };
  };
}
