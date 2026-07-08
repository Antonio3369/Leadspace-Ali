export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-400 text-sm">该页面将在后续阶段实现</p>
    </div>
  );
}
