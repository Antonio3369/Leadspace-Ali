export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm px-8 py-16 text-center">
      <p className="text-[0.78rem] font-semibold tracking-wide uppercase text-[#94a3b8] mb-2">
        Leadspace.Alipay
      </p>
      <h1 className="text-2xl font-bold text-[#111827] mb-2">{title}</h1>
      <p className="text-[#94a3b8] text-sm">该页面将在后续阶段实现</p>
    </div>
  );
}
