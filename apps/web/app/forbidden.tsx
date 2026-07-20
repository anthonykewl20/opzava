export default function Forbidden() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-6)",
        background: "var(--bg)",
      }}
    >
      <section className="error-state" aria-labelledby="forbidden-title">
        <p className="auth-cap">403</p>
        <h1 id="forbidden-title">Access denied</h1>
        <p>You do not have permission to access this area.</p>
      </section>
    </main>
  );
}
