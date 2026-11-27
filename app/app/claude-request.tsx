"use client";

import { useState } from "react";
import Link from "next/link";
import ui from "./ui.module.css";

export function CopySafeText({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState("");
  return <>
    <button className={ui.btn} type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Copied.");
      } catch {
        setStatus("Clipboard is unavailable. Select and copy the text manually.");
      }
    }}>{label}</button>
    <span className={ui.sub} role="status">{status}</span>
  </>;
}

export function ClaudeRequest({ prompt }: { prompt: string }) {
  return <>
    <p className={ui.sub}>Waiting for your Claude. Paste this request in a Claude session connected to JobSearch.</p>
    <details>
      <summary>Show request</summary>
      <p>{prompt}</p>
    </details>
    <CopySafeText text={prompt} label="Copy Claude request" />{" "}
    <Link href="/app/settings?section=assistant">Connection setup</Link>
  </>;
}
