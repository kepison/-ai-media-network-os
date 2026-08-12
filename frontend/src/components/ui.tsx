import { ReactNode } from "react";

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[#232936] bg-[#11151f] p-4">
      <div className="text-xs uppercase tracking-wide text-[#6b7686]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent || "text-[#e8edf5]"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#7d8899]">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#232936] bg-[#11151f]">
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-[#232936] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#c8d2e0]">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export type CardProps = { title?: ReactNode; children: ReactNode; right?: ReactNode };

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    gray: "bg-[#232936] text-[#a7b1c0]",
    green: "bg-emerald-500/10 text-emerald-400",
    red: "bg-red-500/10 text-red-400",
    yellow: "bg-amber-500/10 text-amber-400",
    blue: "bg-sky-500/10 text-sky-400",
    purple: "bg-violet-500/10 text-violet-400",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "outline";
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const v: Record<string, string> = {
    primary: "bg-sky-600 hover:bg-sky-500 text-white",
    ghost: "bg-transparent hover:bg-[#1c2230] text-[#b8c2d0]",
    danger: "bg-red-600/80 hover:bg-red-500 text-white",
    outline: "border border-[#2b3343] hover:bg-[#1c2230] text-[#b8c2d0]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${v[variant]}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#8b96a8]">
      <svg className="h-4 w-4 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, width = "max-w-3xl" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className={`mt-8 w-full ${width} rounded-2xl border border-[#2a3345] bg-[#11151f] shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#232936] px-5 py-3">
          <h3 className="text-sm font-semibold text-[#d5dce8]">{title}</h3>
          <button onClick={onClose} className="text-[#6b7686] hover:text-white">✕</button>
        </div>
        <div className="scroll-slim max-h-[80vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="text-xl font-bold text-[#e8edf5]">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-[#7d8899]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function DataTable({ columns, rows, onRowClick }: { columns: string[]; rows: Record<string, unknown>[]; onRowClick?: (r: Record<string, unknown>) => void }) {
  if (!rows.length) return <div className="py-10 text-center text-sm text-[#5d6879]">Нет данных</div>;
  return (
    <div className="scroll-slim overflow-x-auto rounded-lg border border-[#232936]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#141927] text-xs uppercase tracking-wide text-[#6b7686]">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-[#1c2230] ${onRowClick ? "cursor-pointer hover:bg-[#161b28]" : ""}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c} className="max-w-[320px] truncate px-3 py-2 text-[#b8c2d0]">{fmt(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function fmtNumber(n: unknown): string {
  if (n == null) return "-";
  const num = Number(n);
  if (!Number.isFinite(num)) return "-";
  return new Intl.NumberFormat("en-US").format(Math.round(num));
}

export function fmtPercent(n: unknown): string {
  if (n == null) return "-";
  return `${Number(n).toFixed(1)}%`;
}

export function fmtDate(s: unknown): string {
  if (!s) return "-";
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? String(s).slice(0, 10) : d.toLocaleDateString("ru-RU");
}