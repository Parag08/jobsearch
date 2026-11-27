import { redirect } from "next/navigation";
import { settingsHref } from "@/lib/settings/sections";

export default function AgentAccess() {
  redirect(settingsHref("assistant"));
}
