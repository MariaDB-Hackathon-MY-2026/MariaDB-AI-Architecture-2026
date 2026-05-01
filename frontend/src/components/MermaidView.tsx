import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';

export interface MermaidViewProps {
  code: string;
  theme?: 'light' | 'dark';
}

export default function MermaidView({ code, theme = 'dark' }: MermaidViewProps) {
  const [svg, setSvg] = useState<string>('');
  const diagramId = useMemo(() => `mmd-${Math.random().toString(16).slice(2)}`, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setSvg('');
      const trimmed = (code || '').trim();
      if (!trimmed) return;
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'neutral',
        securityLevel: 'strict',
        flowchart: { curve: 'basis' },
      });
      try {
        const out = await mermaid.render(diagramId, trimmed);
        if (!cancelled) setSvg(out.svg);
      } catch (e) {
        if (!cancelled) setSvg(`<pre style="color:#ef4444;white-space:pre-wrap">Mermaid error: ${String(e)}</pre>`);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, theme, diagramId]);

  return (
    <div className="overflow-auto rounded-lg border border-slate-800 bg-black/20 p-3">
      <div className="min-h-32" dangerouslySetInnerHTML={{ __html: svg || '' }} />
    </div>
  );
}
