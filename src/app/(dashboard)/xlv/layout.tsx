import { XlvWorkspacePrefetch } from "@/components/xlv/XlvWorkspacePrefetch";

export default function XlvLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <XlvWorkspacePrefetch />
      {children}
    </>
  );
}
