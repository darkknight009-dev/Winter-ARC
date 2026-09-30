/**
 * Push message ladder — brutal roast mode.
 *
 * The ladder escalates through the evening:
 *   18:00 headsup  →  20:00 nudge  →  21:30 lastcall  →  23:00 final
 *
 * Tone is earned, not random: streak size decides how hard you get
 * roasted. Zero emojis. Second person. Every line lands like a verdict.
 */

export type PushKind = "headsup" | "nudge" | "lastcall" | "final";

export const PUSH_SCHEDULE: {
  kind: PushKind;
  /** Local user hour the push fires at */
  hour: number;
  minute: number;
}[] = [
  { kind: "headsup", hour: 18, minute: 0 },
  { kind: "nudge", hour: 20, minute: 0 },
  { kind: "lastcall", hour: 21, minute: 30 },
  { kind: "final", hour: 23, minute: 0 },
];

export interface PushCopy {
  title: string;
  body: string;
  tag: string;
}

type Tone = "soft" | "hard" | "nuclear";

interface CopyLine {
  title: string;
  body: string;
}

const COPY: Record<PushKind, Record<Tone, CopyLine>> = {
  headsup: {
    soft: {
      title: "The day is half gone",
      body: "Nothing logged. The couch is winning and you haven't even fought yet.",
    },
    hard: {
      title: "You haven't done anything today",
      body: "Others already sealed the day. You're still negotiating with yourself.",
    },
    nuclear: {
      title: "Day 40+ and this is the effort",
      body: "You had one job after sunset: show up. The record says you didn't.",
    },
  },
  nudge: {
    soft: {
      title: "Evening check",
      body: "Still nothing on the record. One habit. Twenty minutes. Move.",
    },
    hard: {
      title: "Your streak doesn't care about your mood",
      body: "It only cares whether tonight decides. Right now tonight says coward.",
    },
    nuclear: {
      title: "You said this time was different",
      body: "The arc was the identity. The identity is currently unrecorded. Fix it.",
    },
  },
  lastcall: {
    soft: {
      title: "Hours, not days",
      body: "The ledger closes at midnight and your line is blank. Log something now.",
    },
    hard: {
      title: "You will not enjoy opening this app tomorrow",
      body: "A broken streak is a public confession. Sixty seconds spares you. Choose.",
    },
    nuclear: {
      title: "This is where your arc dies",
      body: "Not in February. Tonight, on an ordinary evening, by your own hand. Prove me wrong.",
    },
  },
  final: {
    soft: {
      title: "Minutes left",
      body: "The day is about to go down as missed. Log it or explain it to yourself forever.",
    },
    hard: {
      title: "Last chance on the record",
      body: "In minutes this day becomes a scar on the heatmap. You can still stop it.",
    },
    nuclear: {
      title: "Feb 28 is watching",
      body: "Every skipped night is a brick in the wall between you and that identity. Move. Now.",
    },
  },
};

/** Milestone celebrations — sent the moment a streak crosses the line. */
const MILESTONE_COPY: Record<number, CopyLine> = {
  7: { title: "Seven days. Unbroken.", body: "Day 4 is where everyone else quit. You're still here. Don't get comfortable." },
  30: { title: "One month on the record", body: "Thirty straight days. You're no longer the person who started this. Keep going." },
  75: { title: "Halfway through the fire", body: "Seventy-five days without flinching. February is no longer a hope. It's a schedule." },
  151: { title: "The full arc. Every day.", body: "One hundred fifty-one days on the record. There is nothing left to prove to anyone." },
};

export function milestoneCopy(day: number): CopyLine | null {
  return MILESTONE_COPY[day] ?? null;
}

/** Comeback push — the day after a broken streak (roast with a door open). */
export const COMEBACK_COPY: CopyLine = {
  title: "The streak is dead. You aren't.",
  body: "Yesterday went to the graveyard. Today doesn't have to. Start a new line.",
};

/**
 * Pick copy for a scheduled push.
 * streak — current streak entering today
 */
export function pushCopy(kind: PushKind, streak: number): PushCopy {
  const tone: Tone = streak >= 30 ? "nuclear" : streak >= 7 ? "hard" : "soft";
  const line = COPY[kind][tone];
  return { ...line, tag: `wao-${kind}-${new Date().toISOString().slice(0, 10)}` };
}
