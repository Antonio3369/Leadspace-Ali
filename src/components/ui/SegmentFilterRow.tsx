export interface SegmentFilterOption {
  value: string;
  label: string;
}

interface SegmentFilterRowProps {
  label: string;
  value: string;
  options: SegmentFilterOption[];
  onChange: (value: string) => void;
  showAllOption?: boolean;
}

export function SegmentFilterRow({
  label,
  value,
  options,
  onChange,
  showAllOption = true,
}: SegmentFilterRowProps) {
  const allOptions: SegmentFilterOption[] = showAllOption
    ? [{ value: "", label: "全部" }, ...options]
    : options;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-[#64748b] w-16 shrink-0">{label}</span>
      {allOptions.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value || "__all__"}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              selected
                ? "bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb] font-medium"
                : "border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1] bg-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
