import { Database, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
                <Database className="w-4 h-4 text-primary-400" />
              </div>
              <span className="font-bold text-white text-sm">MariaDB AI Architect</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Talk to your database before it even exists.<br />
              AI-powered schema design for everyone.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Product</h3>
            <ul className="space-y-2">
              {['Features', 'How It Works', 'Demo'].map(item => (
                <li key={item}>
                  <a
                    href={`/#${item.toLowerCase().replace(/ /g, '-')}`}
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Tech stack */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Built With</h3>
            <ul className="space-y-2">
              {['MariaDB (InnoDB)', 'Python + Streamlit', 'Ollama — Local AI', 'Mermaid Diagrams'].map(item => (
                <li key={item} className="text-sm text-slate-500">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} MariaDB AI Architect — Tournament Edition
          </p>
          <p className="text-xs text-slate-600 flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> by MhdHakimFz
          </p>
        </div>
      </div>
    </footer>
  );
}
