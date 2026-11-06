interface CardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}

export default function Card({ title, subtitle, children, right }: CardProps) {
  return (
    <div className="rounded-section bg-depth-1/60 p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-white/60">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}
