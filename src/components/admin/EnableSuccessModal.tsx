"use client";

interface EnableSuccessModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  name: string;
  username: string;
  password: string;
  nextSteps: string;
}

export function EnableSuccessModal({
  open,
  onClose,
  title = "账号开通成功",
  name,
  username,
  password,
  nextSteps,
}: EnableSuccessModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">{name}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
          <div>
            <p className="text-gray-500 mb-1">登录名</p>
            <p className="font-mono font-medium text-gray-900 break-all">{username}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">初始密码</p>
            <p className="font-mono font-medium text-gray-900">{password}</p>
          </div>
        </div>

        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
          <p className="font-medium text-blue-900 mb-1">下一步</p>
          <p>{nextSteps}</p>
        </div>

        <p className="text-xs text-amber-700">请妥善告知对方登录信息，关闭后密码不再显示。</p>

        <button
          type="button"
          onClick={onClose}
          className="w-full bg-[#165DFF] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#165DFF]/90"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}
