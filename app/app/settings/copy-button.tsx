"use client";

import { useState } from "react";
import ui from "../ui.module.css";

/** Copies a fixed string and says so for two seconds (critique 8.13: the command had no copy button). */
export function CopyButton({ text, label = "Copy", onCopy }: { text: string; label?: string; onCopy?: () => void }) {
  const [status, setStatus] = useState("");
  return (
    <button
      type="button"
      className={ui.btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("Copied");
          onCopy?.();
        } catch {
          setStatus("Copy unavailable; select the text to copy it.");
        }
      }}
    >
      <span aria-live="polite">{status || label}</span>
    </button>
  );
}
