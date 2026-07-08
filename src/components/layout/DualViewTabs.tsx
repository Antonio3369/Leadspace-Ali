"use client";

interface DualViewTabsProps {
  activeView: "team" | "personal";
  onChange: (view: "team" | "personal") => void;
}

export function DualViewTabs({ activeView, onChange }: DualViewTabsProps) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
      <button
        onClick={() => onChange("team")}
        className={`px-4 py-2 text-sm rounded-md transition-colors ${
          activeView === "team"
            ? "bg-white text-[#165DFF] shadow-sm font-medium"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        小组汇总数据区
      </button>
      <button
        onClick={() => onChange("personal")}
        className={`px-4 py-2 text-sm rounded-md transition-colors ${
          activeView === "personal"
            ? "bg-white text-[#165DFF] shadow-sm font-medium"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        个人外勤数据区
      </button>
    </div>
  );
}
