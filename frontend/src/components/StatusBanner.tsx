import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function StatusBanner({ error, status }: { error?: string | null; status?: string | null }) {
  if (!error && !status) return null;
  return (
    <div className="space-y-2">
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <div className="break-words">{error}</div>
        </div>
      ) : null}
      {status ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
          <div className="break-words">{status}</div>
        </div>
      ) : null}
    </div>
  );
}
