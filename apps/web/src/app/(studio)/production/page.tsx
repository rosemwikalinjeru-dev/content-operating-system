import type { Metadata } from "next";
import { Planned } from "@/components/planned";

export const metadata: Metadata = { title: "Production Studio" };

export default function Page() {
  return <Planned title="Production Studio" phase="Phases 1, 3 and 4" items={["Master brief generation and approval", "LinkedIn, X, carousel and video script generation", "Independent editorial review with targeted revisions", "Version history and approval"]} />;
}
