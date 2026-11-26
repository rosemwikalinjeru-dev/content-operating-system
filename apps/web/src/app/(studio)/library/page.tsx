import type { Metadata } from "next";
import { Planned } from "@/components/planned";

export const metadata: Metadata = { title: "Media Library" };

export default function Page() {
  return <Planned title="Media Library" phase="Phases 5 and 6" items={["Uploaded videos, audio and images", "Generated scenes, voiceovers and renders", "Brand assets", "Signed, private downloads"]} />;
}
