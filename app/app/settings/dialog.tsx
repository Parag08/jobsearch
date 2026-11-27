"use client";

import { createContext, useContext, useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./settings.module.css";

export const SettingsDialogHost = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function SettingsDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const host = useContext(SettingsDialogHost)?.current;
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [host]);
  return host ? createPortal(
    <dialog ref={ref} className={styles.dialog} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>,
    host,
  ) : null;
}
