export const dynamic = "force-dynamic";

export default function SignOutPage() {
  return (
    <main className="auth" style={{ justifyContent: "center" }}>
      <section className="auth-card" aria-label="Signed out of Opzava" style={{ textAlign: "center" }}>
        <div className="auth-logo auth-logo--soft" aria-hidden="true">
          ◆
        </div>
        <h1>You have signed out</h1>
        <p className="auth-lead">
          This device is signed out. Other sessions stay open until you end them from Security in
          your profile.
        </p>
        <div className="u-col-2">
          <a className="btn btn-primary" href="/login" style={{ minHeight: 44, fontSize: "var(--text-md)" }}>
            Sign back in
          </a>
          <a className="btn btn-ghost" href="/">
            Back to Opzava
          </a>
        </div>
      </section>
    </main>
  );
}
