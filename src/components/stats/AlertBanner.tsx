interface AlertBannerProps {
  message: string;
  visible: boolean;
}

export function AlertBanner({ message, visible }: AlertBannerProps) {
  if (!visible || !message) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 text-orange-800 text-sm px-4 py-3 rounded-lg">
      {message}
    </div>
  );
}
