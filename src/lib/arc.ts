/**
 * Winter Arc core domain.
 * The arc always runs Oct 1 -> Feb 28 (151 days: Oct 31 + Nov 30 + Dec 31 + Jan 31 + Feb 28).
 */

export const ARC_START_MONTH = 9; // October (0-indexed)
export const ARC_START_DAY = 1;
export const ARC_END_MONTH = 1; // February (0-indexed)
export const ARC_END_DAY = 28;
export const ARC_TOTAL_DAYS = 151;
export const XP_PER_HABIT = 10;
export const MAX_FREEZES = 3;

export interface Chapter {
  id: number;
  name: string;
  /** 0-indexed calendar months this chapter covers */
  months: number[];
  blurb: string;
}

/** Chapters of the arc — one per calendar month, Oct -> Feb. */
export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    name: "Foundation",
    months: [9],
    blurb: "Build the identity. Start small, and never miss twice.",
  },
  {
    id: 2,
    name: "Momentum",
    months: [10],
    blurb: "The novelty fades. Systems carry you now.",
  },
  {
    id: 3,
    name: "Trials",
    months: [11],
    blurb: "Holidays, travel, excuses. This is where arcs are won.",
  },
  {
    id: 4,
    name: "Deep Winter",
    months: [0],
    blurb: "Dark and quiet. Who shows up when nobody is clapping?",
  },
  {
    id: 5,
    name: "Forge",
    months: [1],
    blurb: "Final chapter. Finish so strong that March-you is inevitable.",
  },
];

export interface ArcDay {
  index: number; // 0-based day of the arc
  date: Date;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
  completed: boolean;
  frozen: boolean;
  missed: boolean;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * "Now" as the user experiences it: shifts the server clock (usually UTC on
 * Vercel) into the user's timezone so day boundaries fall at THEIR midnight,
 * not the server's. Without this, IST users get UTC day boundaries (+5:30 shift).
 */
export function zonedNow(timezone?: string | null): Date {
  if (!timezone) return new Date();
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return new Date();
  }
}

/**
 * The calendar date (yyyy-mm-dd) of a zoned Date, read from its LOCAL fields.
 * Never use toISOString() here: that re-converts to UTC and shifts the date
 * backwards for users east of UTC, which then fails validate_checkin_day.
 */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The real UTC instant at which the user's current local day ends (their next
 * midnight). `zonedNow` returns a Date whose LOCAL fields match the user's wall
 * clock, so the offset between it and the true clock converts one into the other.
 * Use this for anything persisted (e.g. checkins.locked_at).
 */
export function endOfLocalDayUtc(timezone?: string | null, now: Date = new Date()): Date {
  const zoned = zonedNow(timezone);
  const midnight = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate() + 1);
  const offsetMs = now.getTime() - zoned.getTime();
  return new Date(midnight.getTime() - offsetMs);
}

/**
 * Local-time arc start (Oct 1) for the current arc window.
 * Three windows:
 *   Oct 1 Y .. Feb 28 Y+1  -> arc started Oct 1 Y (live)
 *   Jan 1 Y .. Feb 28 Y    -> previous arc (started Oct 1 Y-1) still live
 *   Mar 1 Y .. Sep 30 Y    -> previous arc OVER, next arc NOT started:
 *                             return the UPCOMING Oct 1 Y (pre-arc mode)
 */
export function arcStartDate(now: Date = new Date()): Date {
  const y = now.getFullYear();
  const startThisYear = new Date(y, ARC_START_MONTH, ARC_START_DAY);
  if (now >= startThisYear) return startThisYear;
  const endPrevArc = new Date(y, ARC_END_MONTH, ARC_END_DAY);
  if (now <= endPrevArc) return new Date(y - 1, ARC_START_MONTH, ARC_START_DAY);
  return startThisYear; // Mar-Sep: the upcoming arc (pre-arc mode)
}

export function arcEndDate(now: Date = new Date()): Date {
  const start = arcStartDate(now);
  return new Date(start.getFullYear() + 1, ARC_END_MONTH, ARC_END_DAY);
}

/** 0-based index of today within the arc (negative = before the arc). */
export function dayIndexOf(now: Date = new Date()): number {
  const start = arcStartDate(now);
  const diff = startOfDay(now).getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** 1-based day number (Day 1 -> Day 151). 0 or negative = pre-arc. */
export function dayNumber(now: Date = new Date()): number {
  return dayIndexOf(now) + 1;
}

export function isArcOver(now: Date = new Date()): boolean {
  const y = now.getFullYear();
  // Live window: from the relevant Oct 1 through the following Feb 28.
  // Mar-Sep (between arcs) counts as pre-arc, not over.
  const start = arcStartDate(now);
  const end = new Date(start.getFullYear() + 1, ARC_END_MONTH, ARC_END_DAY);
  return startOfDay(now) > end && now < new Date(y, ARC_START_MONTH, ARC_START_DAY);
}

export function isArcActive(now: Date = new Date()): boolean {
  return !isArcOver(now);
}

/** Days left in the arc, counting today. Pre-arc returns the full 151. */
export function daysRemaining(now: Date = new Date()): number {
  if (isArcOver(now)) return 0;
  const idx = dayIndexOf(now);
  if (idx < 0) return ARC_TOTAL_DAYS;
  return Math.max(0, ARC_TOTAL_DAYS - idx);
}

/** True when today falls between Feb 28 and Oct 1 — the off-season (Mar..Sep). */
export function isOffSeason(now: Date = new Date()): boolean {
  const m = now.getMonth();
  return m >= 2 && m <= 8;
}

export function chapterFor(date: Date): Chapter {
  const m = date.getMonth();
  return CHAPTERS.find((c) => c.months.includes(m)) ?? CHAPTERS[0];
}

export function chapterProgress(now: Date = new Date()): { chapter: Chapter; progress: number } {
  const chapter = chapterFor(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const total = monthEnd.getTime() - monthStart.getTime();
  const elapsed = now.getTime() - monthStart.getTime();
  return { chapter, progress: Math.min(1, Math.max(0, elapsed / total)) };
}

/* ------------------------------- XP & levels ------------------------------ */

/**
 * XP for a single day. Partial days pay NOTHING — the arc rewards the full
 * set. A perfect day pays 10 XP per habit plus a 10 XP completion bonus.
 * Showing up still matters: partial days keep the streak alive (see
 * `dayCountsForStreak`), they just don't earn XP.
 */
export function xpForDay(habitsDone: number, habitCount: number): number {
  if (habitCount <= 0) return 0;
  if (habitsDone < habitCount) return 0;
  return habitsDone * XP_PER_HABIT + 10;
}

/** Total XP across a set of per-day habit counts. */
export function totalXp(habitCounts: number[], habitCount: number): number {
  return habitCounts.reduce((sum, n) => sum + xpForDay(n, habitCount), 0);
}

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
}

export const LEVEL_TITLES = [
  "Drifter",
  "Starter",
  "Builder",
  "Disciplined",
  "Relentless",
  "Iron",
  "Unshakeable",
  "Arc Legend",
];

export function levelFor(totalXp: number): LevelInfo {
  // Thresholds: Lv1 at 0 XP, Lv2 at 300, Lv3 at 900, Lv4 at 1800, ...
  // i.e. threshold(n) = 150 * n * (n - 1). Level 1 starts at ZERO so the bar
  // fills from the very first check-in (the old formula had a 150 XP floor bug).
  let level = 1;
  while (150 * (level + 1) * level <= totalXp) level += 1;
  const floorXp = 150 * level * (level - 1);
  const nextXp = 150 * (level + 1) * level;
  const xpIntoLevel = Math.max(0, totalXp - floorXp);
  const span = nextXp - floorXp;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpIntoLevel,
    xpForNext: span,
    progress: Math.min(1, Math.max(0, xpIntoLevel / span)),
  };
}

/* ---------------------------- Streaks & freezes --------------------------- */

/**
 * A day keeps the streak alive if the user showed up at all — at least one
 * habit logged — or if it was frozen. Completing every habit is what earns XP
 * and counts as a "perfect day", not what keeps the chain unbroken.
 */
export function dayCountsForStreak(habitsDone: number): boolean {
  return habitsDone > 0;
}

/**
 * Current streak = consecutive days that counted (some habits logged, or
 * frozen) ending today or yesterday.
 * `completedByIndex` maps arc day index -> habits completed count.
 */
export function currentStreak(
  completedByIndex: Map<number, number>,
  frozenIndexes: Set<number>,
  habitCount: number,
  todayIndex: number
): number {
  if (habitCount === 0) return 0;
  let streak = 0;
  let i = todayIndex;
  // Nothing logged today yet? Start counting from yesterday so the streak
  // isn't "lost" during the day.
  const doneToday = dayCountsForStreak(completedByIndex.get(todayIndex) ?? 0);
  if (!doneToday && !frozenIndexes.has(todayIndex)) i = todayIndex - 1;
  while (i >= 0) {
    const done = dayCountsForStreak(completedByIndex.get(i) ?? 0);
    if (done || frozenIndexes.has(i)) {
      streak += 1;
      i -= 1;
    } else {
      break;
    }
  }
  return streak;
}

export function longestStreak(
  completedByIndex: Map<number, number>,
  frozenIndexes: Set<number>,
  habitCount: number,
  totalDaysSoFar: number
): number {
  if (habitCount === 0) return 0;
  let best = 0;
  let run = 0;
  for (let i = 0; i < totalDaysSoFar; i++) {
    const done = dayCountsForStreak(completedByIndex.get(i) ?? 0);
    if (done || frozenIndexes.has(i)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
