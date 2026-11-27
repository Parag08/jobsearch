"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function useNavigationGuard(active: boolean, confirmLeave: (leave: () => void) => void) {
  const router = useRouter();
  const confirm = useRef(confirmLeave);
  useEffect(() => { confirm.current = confirmLeave; }, [confirmLeave]);
  useEffect(() => {
    if (!active) return;
    let proceeding = false;
    const allow = (callback: () => void) => {
      confirm.current(() => {
        proceeding = true;
        callback();
      });
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (proceeding) return;
      event.preventDefault();
      event.returnValue = true;
    };
    const click = (event: MouseEvent) => {
      if (proceeding || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download") || link.href === location.href) return;
      event.preventDefault();
      event.stopPropagation();
      allow(() => {
        const url = new URL(link.href);
        if (url.origin !== location.origin || link.dataset.settingsResult !== undefined) location.assign(url);
        else router.push(url.pathname + url.search + url.hash);
      });
    };
    const submit = (event: SubmitEvent) => {
      if (proceeding || !(event.target instanceof HTMLFormElement) || event.target.closest("[data-settings]")) return;
      const form = event.target;
      event.preventDefault();
      event.stopPropagation();
      allow(() => form.requestSubmit(event.submitter ?? undefined));
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const entry = event as Event & { navigationType: string; destination: { key: string } };
      if (proceeding || !event.cancelable || entry.navigationType !== "traverse" || !entry.destination.key) return;
      event.preventDefault();
      allow(() => (navigation as EventTarget & { traverseTo: (key: string) => void }).traverseTo(entry.destination.key));
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    navigation?.addEventListener("navigate", traverse);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      navigation?.removeEventListener("navigate", traverse);
      window.removeEventListener("beforeunload", unload);
    };
  }, [active, router]);
}
