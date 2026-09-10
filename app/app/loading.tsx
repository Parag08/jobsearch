import ui from "./ui.module.css";

/**
 * Every /app route is force-dynamic and does database round-trips, so without
 * this the previous page sits frozen until the server answers. Skeletons match
 * the shape of what is coming rather than spinning.
 */
export default function Loading() {
  return (
    <div className={ui.loading} aria-busy="true" aria-label="Loading">
      <div className={ui.skelHead} />
      <div className={ui.skelRow}>
        <span />
        <span />
        <span />
      </div>
      <div className={ui.skelPanel} />
    </div>
  );
}
