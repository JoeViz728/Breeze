import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ServerPageShell({ title, subtitle, children }: Props) {
  return (
    <div className="server-page">
      <header className="server-page-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="server-page-content">{children}</div>
    </div>
  );
}