/** Reusable skeleton primitives for loading states. */

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`h-3.5 rounded-md bg-slate-700/60 animate-pulse ${className}`} />;
}

export function SkeletonTableRows({ cols = 3, rows = 6 }: { cols?: number; rows?: number }) {
  const widths = ['w-1/2', 'w-3/4', 'w-2/3', 'w-4/5', 'w-1/3', 'w-3/5'];
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="odd:bg-white/5">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="border-b border-slate-900 px-3 py-2.5">
              <div className={`h-3 rounded bg-slate-700/50 animate-pulse ${widths[(i * cols + j) % widths.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonSelect({ className = '' }: { className?: string }) {
  return <div className={`h-9 rounded-lg bg-slate-700/50 animate-pulse ${className}`} />;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-slate-700/40 animate-pulse ${className}`} />;
}
