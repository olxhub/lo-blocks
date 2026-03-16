'use client';

export default function Notice() {
  return (
    <span className="lo-notice">
      lo-blocks is free and open-source software by{' '}
      <a href="http://mitros.org/p" className="underline decoration-slate-300 text-slate-400 hover:text-slate-500">Piotr Mitros</a>.{' '}
      <a href="https://github.com/olxhub/lo-blocks/" className="underline decoration-slate-300 text-slate-400 hover:text-slate-500">Project Repository</a>.{' '}
      <a href="http://mitros.org/p/lo/license.html" className="underline decoration-slate-300 text-slate-400 hover:text-slate-500">Licensing information</a>.{' '}
      Copyright &copy; 2011-2026 Piotr Mitros and others.{' '}
      Any representation of another party as the original author or inventor
      of this tool or methodology is a misrepresentation of origin and authorship.
    </span>
  );
}
