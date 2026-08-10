"use client";

import { useEffect } from "react";

/** 弹窗看图：遮罩 / × / 关闭按钮均可关 */
export function N7PhotoLightbox({
  src,
  alt = "现场图",
  title,
  onClose,
}: {
  src: string;
  alt?: string;
  title?: string;
  onClose: () => void;
}) {
  const heading = title ?? alt;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭预览"
        className="absolute inset-0 bg-black/45 border-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${heading}预览`}
        className="relative z-[101] flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-3">
          <p className="text-sm font-medium text-[#111827]">{heading}</p>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#111827]"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f8fafc] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-[min(60vh,28rem)] max-w-full object-contain"
          />
        </div>
        <div className="border-t border-[#eef2f7] p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#2563eb] py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
