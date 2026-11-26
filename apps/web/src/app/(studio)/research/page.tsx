import type { Metadata } from "next";
import { Planned } from "@/components/planned";

export const metadata: Metadata = { title: "Research" };

export default function Page() {
  return <Planned title="Research" phase="Phase 2" items={["Competitor profiles and monitoring schedules", "Baseline-relative outlier analysis", "Comment mining for questions and objections", "Research reports that feed the Idea Inbox"]} />;
}
