"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import { XlvDashboardView } from "@/components/xlv/XlvDashboardView";
import { XlvTodayView } from "@/components/xlv/XlvTodayView";

/**
 * 今日待办 ↔ 沉睡预警：两个 Tab 保持挂载，切换时只显隐，避免整页重载。
 */
export function XlvWorkspaceShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onToday = pathname === xlvPath() || pathname === "/xlv";
  const onAlerts = pathname.endsWith("/alerts");
  const keepAlive = onToday || onAlerts;

  const [mountedToday, setMountedToday] = useState(onToday);
  const [mountedAlerts, setMountedAlerts] = useState(onAlerts);

  useEffect(() => {
    if (onToday) setMountedToday(true);
    if (onAlerts) setMountedAlerts(true);
  }, [onToday, onAlerts]);

  if (!keepAlive) {
    return <>{children}</>;
  }

  return (
    <>
      {mountedToday ? (
        <div className={onToday ? undefined : "hidden"} aria-hidden={!onToday}>
          <XlvTodayView role={role} active={onToday} />
        </div>
      ) : null}
      {mountedAlerts ? (
        <div className={onAlerts ? undefined : "hidden"} aria-hidden={!onAlerts}>
          <XlvDashboardView role={role} active={onAlerts} />
        </div>
      ) : null}
    </>
  );
}
