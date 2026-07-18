/** 列表/详情共用的处理状态标记（与系统「待跟进」考核名单不同） */
export function N7FollowUpBadge({
  done,
  note,
}: {
  done: boolean;
  /** 悬停可看备注 */
  note?: string | null;
}) {
  return (
    <span
      title={note?.trim() || undefined}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.7rem] font-semibold ${
        done
          ? "bg-sky-50 text-sky-700"
          : "bg-amber-50 text-amber-800"
      }`}
    >
      {done ? "已处理" : "未处理"}
    </span>
  );
}
