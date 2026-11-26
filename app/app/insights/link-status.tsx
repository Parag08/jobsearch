"use client";

import { useLinkStatus } from "next/link";

export function InsightsLinkStatus() {
  const { pending } = useLinkStatus();
  return <span role="status">{pending ? " Loading…" : null}</span>;
}
