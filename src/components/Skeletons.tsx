export function TodaySkeleton() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      <div className="readout mb-6">
        <span>
          ARC <b>…</b>
        </span>
        <span>…</span>
        <span>
          XP <b>…</b>
        </span>
      </div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="skel mb-2 h-3 w-24" />
          <div className="skel h-20 w-40" />
        </div>
        <div className="text-right">
          <div className="skel mb-2 h-3 w-16 ml-auto" />
          <div className="skel h-8 w-24" />
        </div>
      </div>
      <div className="skel mb-6 h-40 w-full" />
      <div className="skel mb-6 h-28 w-full" />
      <div className="skel h-64 w-full" />
    </main>
  );
}

export function ProgressSkeleton() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      <div className="readout mb-6">
        <span>…</span>
        <span>…</span>
        <span>…</span>
      </div>
      <div className="skel mb-8 h-12 w-64" />
      <div className="skel mb-6 h-36 w-full" />
      <div className="skel mb-6 h-24 w-full" />
      <div className="skel h-52 w-full" />
    </main>
  );
}

export function ReportSkeleton() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      <div className="readout mb-6">
        <span>…</span>
        <span>…</span>
        <span>…</span>
      </div>
      <div className="skel mb-8 h-12 w-72" />
      <div className="skel mb-6 h-72 w-full" />
      <div className="skel h-40 w-full" />
    </main>
  );
}
