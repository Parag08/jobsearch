"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SECTIONS, settingsHref, type SettingsSection } from "@/lib/settings/sections";
import { AppearancePicker } from "../../_components/theme-toggle";
import ui from "../ui.module.css";
import styles from "./settings.module.css";

interface Result { key: string; label: string; section: SettingsSection; group: string }
const sections = Object.entries(SECTIONS) as [SettingsSection, string][];
const ClearSearch = createContext<() => void>(() => {});

export function useClearSettingsSearch() {
  return useContext(ClearSearch);
}

export function SettingsFrame({ section, searchable, loadFailed, children }: {
  section: SettingsSection;
  searchable: Result[];
  loadFailed?: boolean;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [jump, setJump] = useState("");
  const needle = query.trim().toLowerCase();
  const results = needle ? searchable.filter(({ label, section, group }) =>
    `${label} ${SECTIONS[section]} ${group}`.toLowerCase().includes(needle)) : [];

  useEffect(() => {
    const onHashChange = () => {
      setQuery("");
      setJump(location.hash.slice(1));
    };
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (needle || !jump) return;
    const target = document.getElementById(jump);
    if (target) {
      const details = target.closest("details");
      if (details) details.open = true;
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
  }, [jump, needle, loadFailed]);

  return (
    <div className={styles.layout} data-settings>
      <div className={styles.sidebar}>
        <strong className={styles.sidebarTitle}>Settings</strong>
        <label className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" />
          </svg>
          <input aria-label="Find a setting" placeholder="Find a setting" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} />
        </label>
        <button type="button" className={styles.sectionPicker} aria-label={`Settings section: ${SECTIONS[section]}`}
          aria-expanded={menu} aria-controls="settings-sections" onClick={() => setMenu(!menu)}>
          <span>{SECTIONS[section]}</span><span aria-hidden="true">⌄</span>
        </button>
        <div id="settings-sections" className={styles.sectionList} data-open={menu ? "" : undefined}
          onKeyDown={(event) => { if (event.key === "Escape") setMenu(false); }}>
          <nav aria-label="Settings sections">
            {sections.map(([key, label]) => <Link key={key} href={settingsHref(key)} aria-current={key === section ? "page" : undefined}
              onClick={() => { setQuery(""); setMenu(false); }}>
              <span aria-hidden="true">{SECTION_ICONS[key]}</span>{label}
            </Link>)}
          </nav>
          <AppearancePicker className={styles.appearance} />
        </div>
      </div>
      <div className={styles.content}>
        {needle && <section className={styles.results} aria-label="Find a setting">
          <div className={styles.resultHeading}><h2>Find a setting</h2><span role="status">{results.length} results</span></div>
          {results.length ? results.map(({ key, label, section }) =>
            <a className={styles.result} key={key} href={`${settingsHref(section)}#${key}`} data-settings-result
              onClick={() => setQuery("")}>
              <strong>{label}</strong><span>{SECTIONS[section]}</span>
            </a>) : <div className={styles.notice}><h3>No matching settings</h3><p>Try a term such as follow-up, CV or assistant.</p></div>}
        </section>}
        <div hidden={!!needle}>
          <h1 className={styles.title}>{SECTIONS[section]}</h1>
          {loadFailed ? <div className={styles.notice} role="alert">
            <p>Couldn’t load this section. Your saved settings haven’t changed.</p>
            <button className={ui.btn} type="button" onClick={() => location.reload()}>Try again</button>
          </div> : <ClearSearch.Provider value={() => setQuery("")}>{children}</ClearSearch.Provider>}
        </div>
      </div>
    </div>
  );
}

const SECTION_ICONS: Record<SettingsSection, string> = {
  "job-search": "◎", goals: "⚑", interview: "◉", cv: "▤", assistant: "◇", advanced: "☷",
};
