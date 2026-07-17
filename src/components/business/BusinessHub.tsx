import Link from "next/link";
import {
  BUSINESS_LINES,
  type BusinessLineId,
} from "@/lib/business-lines";

export function BusinessHub({
  userName,
  accessibleLines,
}: {
  userName: string;
  accessibleLines: BusinessLineId[];
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <header className="text-center space-y-2">
          <p className="text-[0.78rem] font-semibold tracking-wide uppercase text-[#94a3b8]">
            Leadspace.Alipay
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
            选择业务
          </h1>
          <p className="text-sm text-[#64748b]">
            你好，{userName}。请选择要进入的业务工作台。
          </p>
        </header>

        {accessibleLines.length === 0 ? (
          <div className="rounded-[16px] border border-[#eef2f7] bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-[#64748b] leading-relaxed">
              当前账号尚未开通任何业务线，请联系管理员在「组织管理」中授权。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {accessibleLines.map((id) => {
              const line = BUSINESS_LINES[id];
              return (
                <Link
                  key={id}
                  href={line.href}
                  className="group rounded-[16px] border border-[#eef2f7] bg-white p-6 shadow-sm transition-colors hover:border-[#bfdbfe] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/25"
                >
                  <p className="text-lg font-bold text-[#111827] group-hover:text-[#2563eb] transition-colors">
                    {line.name}
                  </p>
                  <p className="mt-2 text-sm text-[#64748b] leading-relaxed">
                    {line.description}
                  </p>
                  <p className="mt-4 text-sm font-medium text-[#2563eb]">进入 →</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
