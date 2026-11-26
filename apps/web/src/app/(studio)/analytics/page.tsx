import type { Metadata } from "next";
import { Planned } from "@/components/planned";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <Planned title="Analytics" phase="Phase 7" items={["Dated performance snapshots", "Format and hook comparisons", "Cost per approved asset", "Experiment tracking"]} />;
}
