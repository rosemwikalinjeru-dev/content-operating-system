import type { Metadata } from "next";
import { Planned } from "@/components/planned";

export const metadata: Metadata = { title: "Content Calendar" };

export default function Page() {
  return <Planned title="Content Calendar" phase="Phase 7" items={["Planning calendar", "Manual publishing records", "Links from published posts back to their versions"]} />;
}
