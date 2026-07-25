/** 列表/详情共用的处理状态标记（与系统「待跟进」考核名单不同） */
export function N7FollowUpBadge({
  done,
  note,
  /** 时间无望：用语改为已知悉 / 未知悉 */
  acknowledgeOnly = false,
}: {
  done: boolean;
  /** 悬停可看备注 */
  note?: string | null;
  acknowledgeOnly?: boolean;
}) {
  const doneLabel = acknowledgeOnly ? "已知悉" : "已处理";
  const pendingLabel = acknowledgeOnly ? "未知悉" : "未处理";
  return (
    <span
      title={note?.trim() || undefined}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold ${
        acknowledgeOnly
          ? done
            ? "bg-[#fef2f2] text-sm text-[#c41e3a]"
            : "bg-amber-50 text-sm text-amber-800"
          : done
            ? "bg-sky-50 text-[0.7rem] text-sky-700"
            : "bg-amber-50 text-[0.7rem] text-amber-800"
      }`}
    >
      {done ? doneLabel : pendingLabel}
    </span>
  );
}
