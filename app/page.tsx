export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1>JobSearch</h1>
      <p>
        A personal job-search operating system: sector intelligence, project repository, CV builder,
        outreach CRM, application tracker, daily brief, and sourcing engine - around one shared brain.
      </p>
      <p>
        The domain layer lives in <code>lib/</code> (fully unit-tested). UI and Supabase wiring land
        in the next milestones - see <code>docs/MEMORY.md</code> for status.
      </p>
    </main>
  );
}
