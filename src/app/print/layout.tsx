import './print.css';

export const metadata = { robots: { index: false } };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[210mm] bg-white p-6 print:p-0">{children}</div>;
}
