import Link from "next/link";

export function PlatformPicker() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <header className="text-center space-y-2">
          <p className="text-[0.78rem] font-semibold tracking-wide uppercase text-[#94a3b8]">
            Leadspace.Sales
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
            选择业务平台
          </h1>
          <p className="text-sm text-[#64748b]">
            支付宝与微信业务使用不同账号体系，请先选择要进入的平台。
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/login?group=alipay"
            className="group rounded-[16px] border border-[#eef2f7] bg-white p-6 shadow-sm transition-colors hover:border-[#bfdbfe] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/25"
          >
            <p className="text-lg font-bold text-[#111827] group-hover:text-[#2563eb] transition-colors">
              支付宝业务
            </p>
            <p className="mt-2 text-sm text-[#64748b] leading-relaxed">
              小蓝环拓展与动销 · 支付宝 N7 机具考核
            </p>
            <p className="mt-4 text-xs font-medium text-[#2563eb]">登录后选择小蓝环或 N7 →</p>
          </Link>

          <Link
            href="/login/xlv"
            className="group rounded-[16px] border border-[#dcfce7] bg-white p-6 shadow-sm transition-colors hover:border-[#86efac] hover:bg-[#f0fdf4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/25"
          >
            <p className="text-lg font-bold text-[#111827] group-hover:text-[#16a34a] transition-colors">
              微信业务
            </p>
            <p className="mt-2 text-sm text-[#64748b] leading-relaxed">
              微信小绿盒 · 沉睡预警与回访（组织名册账号）
            </p>
            <p className="mt-4 text-xs font-medium text-[#16a34a]">登录后进入小绿盒 →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
