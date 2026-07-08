"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  placeholder: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

export function MultiSelectFilter({
  placeholder,
  options,
  values,
  onChange,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join("、")
        : `${selectedLabels.slice(0, 2).join("、")} 等 ${selectedLabels.length} 项`;

  function toggleValue(value: string) {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="min-w-[140px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
      >
        <span className={values.length === 0 ? "text-gray-500" : "text-gray-900"}>
          {triggerLabel}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                onChange={() => toggleValue(option.value)}
                className="rounded border-gray-300 text-[#165DFF] focus:ring-[#165DFF]/30"
              />
              <span>{option.label}</span>
            </label>
          ))}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
            >
              清除筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
}
