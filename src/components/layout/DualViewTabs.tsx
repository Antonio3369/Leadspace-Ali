"use client";

interface DualViewTabsProps {
  activeView: "team" | "personal";
  onChange: (view: "team" | "personal") => void;
}

export function DualViewTabs({ activeView, onChange }: DualViewTabsProps) {
  return (
    <div className="flex gap-1 bg-[#f1f5f9] p-1 rounded-lg w-fit">
      <button
        onClick={() => onChange("team")}
        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
          activeView === "team"
            ? "bg-white text-[#2563eb] shadow-sm font-medium"
            : "text-[#64748b] hover:text-[#111827]"
        }`}
      >
        小组汇总
      </button>
      <button
        onClick={() => onChange("personal")}
        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
          activeView === "personal"
            ? "bg-white text-[#2563eb] shadow-sm font-medium"
            : "text-[#64748b] hover:text-[#111827]"
        }`}
      >
        个人外勤
      </button>
    </div>
  );
}
