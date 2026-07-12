import Link from "next/link";
import type { ReactNode } from "react";
import { COLORS } from "@/lib/constants";
import { getRateColorLevel } from "@/lib/business-rules";
import {
  formatDateRangeLabel,
  type LedgerDatePreset,
} from "@/lib/ledger-date";

export const DATE_PRESET_OPTIONS: { key: LedgerDatePreset; label: string }[] = [
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "30d", label: "近30天" },
  { key: "90d", label: "近90天" },
  { key: "all", label: "全部" },
];

export const notion = {
  page: "space-y-6 md:space-y-8",
  kicker: "text-[0.78rem] font-semibold tracking-wide uppercase text-[#94a3b8]",
  title: "text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight",
  subtitle: "text-sm text-[#64748b]",
  panel: "rounded-[14px] border border-[#eef2f7] bg-white shadow-sm",
  panelMuted: "rounded-[14px] border border-[#eef2f7] bg-[#f8fafc]",
  tableWrap: "rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden",
  thead: "bg-[#f8fafc] text-[#64748b]",
  row: "border-t border-[#f1f5f9] hover:bg-[#f8fafc]/60",
  input:
    "border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20",
  select:
    "border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm bg-white min-w-[140px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20",
};

export function presetButtonClass(active: boolean) {
  return active
    ? "bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb] font-medium"
    : "border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1] bg-white";
}

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${notion.page} ${className}`.trim()}>{children}</div>;
}

export function PageHeader({
  title,
  kicker = "Leadspace.Alipay",
  meta,
  backHref,
  backLabel = "← 返回",
  actions,
  trailing,
}: {
  title: string;
  kicker?: string;
  meta?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2 min-w-0">
          {backHref && (
            <Link href={backHref} className="inline-block text-sm text-[#64748b] hover:text-[#2563eb] transition-colors">
              {backLabel}
            </Link>
          )}
          {kicker && <p className={notion.kicker}>{kicker}</p>}
          <h1 className={notion.title}>{title}</h1>
          {meta && <div className={notion.subtitle}>{meta}</div>}
        </div>
        {(actions || trailing) && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {trailing}
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

export function NotionPanel({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={`${notion.panel} ${padding ? "p-5 sm:p-6" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function NotionTable({ children, minWidth }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className={notion.tableWrap}>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${minWidth ? `min-w-[${minWidth}]` : ""}`}>{children}</table>
      </div>
    </div>
  );
}

export function NotionButton({
  children,
  type = "button",
  variant = "primary",
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "text-white bg-[#2563eb] hover:bg-[#1d4ed8]",
    secondary: "text-[#2563eb] border border-[#bfdbfe] bg-[#eff6ff] hover:bg-[#dbeafe]",
    ghost: "text-[#64748b] border border-[#e2e8f0] bg-white hover:border-[#cbd5e1]",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function NotionLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[#2563eb] border border-[#bfdbfe] rounded-lg hover:bg-[#eff6ff] transition-colors"
    >
      {children}
    </Link>
  );
}

export function NotionInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${notion.input} ${className}`.trim()} {...props} />;
}

export function NotionSelect({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${notion.select} ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function NotionAlert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "warning" | "info";
}) {
  const tones = {
    error: "bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]",
    success: "bg-[#ecfdf5] border-[#bbf7d0] text-[#047857]",
    warning: "bg-[#fffbeb] border-[#fde68a] text-[#b45309]",
    info: "bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]",
  };
  return (
    <div className={`text-sm border rounded-[10px] px-3 py-2.5 ${tones[tone]}`}>{children}</div>
  );
}

export function NotionCallout({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  const tones = {
    info: "bg-[#eff6ff] border-[#bfdbfe] text-[#1e3a5f]",
    warning: "bg-[#fffbeb] border-[#fde68a] text-[#92400e]",
  };
  return (
    <div className={`rounded-[14px] border p-4 text-sm space-y-1 leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function NotionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#eef2f7]">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.key
              ? "border-[#2563eb] text-[#2563eb]"
              : "border-transparent text-[#64748b] hover:text-[#111827]"
          }`}
        >
          {tab.label}
          {tab.count != null && <span className="ml-1.5 text-xs text-[#94a3b8]">({tab.count})</span>}
        </button>
      ))}
    </div>
  );
}

function rateColor(rate: number) {
  const level = getRateColorLevel(rate);
  if (level === "success") return COLORS.success;
  if (level === "warning") return COLORS.warning;
  return COLORS.danger;
}

export function NotionStatCard({
  label,
  value,
  suffix = "",
  isRate = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  isRate?: boolean;
}) {
  const display = isRate ? value.toFixed(1) : value.toLocaleString();
  const color = isRate ? rateColor(value) : COLORS.primary;

  return (
    <div className="flex flex-col gap-1 p-3.5 sm:p-4 border border-[#eef2f7] rounded-[14px] bg-white">
      <span className="text-[0.82rem] text-[#64748b]">{label}</span>
      <span className="text-[1.35rem] sm:text-[1.6rem] font-bold leading-tight tabular-nums" style={{ color }}>
        {display}
        {suffix}
      </span>
    </div>
  );
}

export function NotionStatGrid({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</section>;
}

export function DateFilterBar({
  dateFrom,
  dateTo,
  datePreset,
  onPreset,
  onDateFrom,
  onDateTo,
  trailing,
  summary,
}: {
  dateFrom: string;
  dateTo: string;
  datePreset: LedgerDatePreset;
  onPreset: (preset: LedgerDatePreset) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  trailing?: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#64748b] mr-1">拓展日期</span>
        {DATE_PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onPreset(preset.key)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${presetButtonClass(datePreset === preset.key)}`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NotionInput type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} />
        <span className="text-sm text-[#94a3b8]">至</span>
        <NotionInput type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)} />
        {trailing}
      </div>

      {summary ?? (
        <p className="text-sm text-[#64748b]">
          {formatDateRangeLabel(dateFrom, dateTo)}
        </p>
      )}
    </div>
  );
}

export function DateRangeMeta({ dateFrom, dateTo, prefix = "数据范围" }: { dateFrom: string; dateTo: string; prefix?: string }) {
  return (
    <p>
      {prefix}：<span className="font-medium text-[#111827]">{formatDateRangeLabel(dateFrom, dateTo)}</span>
    </p>
  );
}
