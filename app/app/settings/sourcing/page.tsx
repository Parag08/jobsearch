import { redirect } from "next/navigation";
import { SETTINGS_PATH } from "@/lib/settings/sections";

export default function SourcingSettings() {
  redirect(SETTINGS_PATH);
}
