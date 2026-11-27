import { ResearchTabs } from "./research-tabs";

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <ResearchTabs />
      {children}
    </div>
  );
}
