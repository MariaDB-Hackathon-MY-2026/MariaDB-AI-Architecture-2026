import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; to: string };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/50 mb-4">
        <Icon className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-300 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs mb-5">{description}</p>
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-sm font-medium text-white transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
