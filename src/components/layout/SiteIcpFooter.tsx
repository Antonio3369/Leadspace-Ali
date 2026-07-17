const ICP_BEIAN_NO = "粤ICP备2026085027号";
const ICP_BEIAN_URL = "https://beian.miit.gov.cn/";

/** 主域 orblead.com 备案号，子域 ali / hk 共用 */
export function SiteIcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`shrink-0 py-3 px-4 text-center text-xs text-[#94a3b8] ${className}`}
    >
      <a
        href={ICP_BEIAN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[#64748b] transition-colors"
      >
        {ICP_BEIAN_NO}
      </a>
    </footer>
  );
}
