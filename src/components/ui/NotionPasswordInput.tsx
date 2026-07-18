"use client";

import { useState } from "react";
import { notion } from "@/components/ui/notion";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.7a2.5 2.5 0 003.5 3.5M9.4 5.5A10.4 10.4 0 0112 5c5 0 9.3 3.3 10.8 7-.5 1.3-1.3 2.5-2.3 3.5M6.1 6.2C4.2 7.5 2.8 9.3 2 12c1.5 3.7 5.8 7 10.8 7 1.3 0 2.6-.2 3.8-.7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12c1.5-3.7 5.8-7 10.8-7S21.3 8.3 22.8 12c-1.5 3.7-5.8 7-10.8 7S3.5 15.7 2 12z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/** 带显示/隐藏切换的密码输入框 */
export function NotionPasswordInput({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${notion.input} ${className} pr-10`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-md text-[#94a3b8] hover:text-[#64748b] hover:bg-[#f8fafc] transition-colors"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        tabIndex={-1}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}
