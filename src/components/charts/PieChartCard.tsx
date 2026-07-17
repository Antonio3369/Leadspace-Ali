"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
} from "recharts";

/** 简洁语义配色 */
const SEMANTIC_COLORS: Record<string, string> = {
  风控通过: "#4080FF",
  审核中: "#FFAD33",
  风控不通过: "#F76965",
  照片未通过: "#F76965",
  照片审核待定: "#FFAD33",
  "碰笔/扫码/交易未达标": "#86909C",
};

const FALLBACK_PALETTE = ["#4080FF", "#FFAD33", "#36CFC9", "#F76965", "#86909C", "#B37FEB"];

function getSliceColor(name: string, index: number): string {
  return SEMANTIC_COLORS[name] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]!;
}

interface PieChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  /** 按扇区名称生成台账钻取链接 */
  getSliceHref?: (name: string) => string | undefined;
  /** 饼图下方附加钻取入口（如 P2 审核中未动销） */
  footerLink?: { href: string; label: string };
}

export function PieChartCard({ title, data, getSliceHref, footerLink }: PieChartCardProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const enriched = useMemo(() => {
    const total = data.reduce((s, d) => s + d.value, 0);
    return data.map((d, i) => ({
      ...d,
      color: getSliceColor(d.name, i),
      percent: total > 0 ? (d.value / total) * 100 : 0,
      href: getSliceHref?.(d.name),
    }));
  }, [data, getSliceHref]);

  const total = enriched.reduce((s, d) => s + d.value, 0);
  const active = activeIndex != null ? enriched[activeIndex] : null;

  if (data.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm p-5">
        <h3 className="text-sm font-medium text-[#111827] mb-4 text-center">{title}</h3>
        <p className="text-[#94a3b8] text-sm text-center py-12">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm p-5 flex flex-col">
      <h3 className="text-sm font-medium text-[#111827] mb-3 text-center">{title}</h3>

      <div className="relative w-full h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={enriched}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
              style={{ cursor: getSliceHref ? "pointer" : undefined }}
              shape={(props) => {
                const isActive = props.index === activeIndex;
                const outer = (props.outerRadius as number) + (isActive ? 6 : 0);
                return (
                  <Sector
                    {...props}
                    outerRadius={outer}
                    cornerRadius={4}
                  />
                );
              }}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={(_, index) => {
                const href = enriched[index]?.href;
                if (href) router.push(href);
              }}
            >
              {enriched.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {active ? (
            <>
              <span
                className="text-2xl font-semibold tabular-nums leading-none"
                style={{ color: active.color }}
              >
                {active.percent.toFixed(1)}%
              </span>
              <span className="text-[11px] text-gray-400 mt-1 max-w-[88px] text-center leading-tight">
                {active.name}
              </span>
            </>
          ) : (
            <>
              <span className="text-xl font-semibold text-gray-800 tabular-nums leading-none">
                {total.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 mt-1">总计</span>
            </>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-[#f1f5f9] pt-3">
        {enriched.map((item, index) => {
          const isActive = activeIndex === index;
          const rowClass = `flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
            isActive ? "bg-gray-50" : ""
          } ${item.href ? "hover:bg-[#f8fbff] cursor-pointer" : "cursor-default"}`;

          const content = (
            <>
              <span
                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="flex-1 text-sm text-gray-700 leading-snug min-w-0">
                {item.name}
              </span>
              <span className="text-sm tabular-nums shrink-0 text-right leading-snug">
                <span className="text-gray-500">{item.value.toLocaleString()}</span>
                <span
                  className="ml-2 font-medium"
                  style={{ color: isActive ? item.color : "#86909C" }}
                >
                  {item.percent.toFixed(1)}%
                </span>
              </span>
            </>
          );

          return item.href ? (
            <li key={item.name}>
              <Link
                href={item.href}
                className={rowClass}
                title={`查看「${item.name}」明细`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {content}
              </Link>
            </li>
          ) : (
            <li
              key={item.name}
              className={rowClass}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {content}
            </li>
          );
        })}
      </ul>

      {footerLink && (
        <Link
          href={footerLink.href}
          className="mt-3 block text-center text-sm text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
        >
          {footerLink.label}
        </Link>
      )}
    </div>
  );
}
