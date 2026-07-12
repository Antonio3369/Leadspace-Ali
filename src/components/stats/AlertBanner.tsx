interface AlertBannerProps {
  message: string;
  visible: boolean;
}

export function AlertBanner({ message, visible }: AlertBannerProps) {
  if (!visible || !message) return null;

  return (
    <div className="bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-sm px-4 py-3 rounded-[10px]">
      {message}
    </div>
  );
}
