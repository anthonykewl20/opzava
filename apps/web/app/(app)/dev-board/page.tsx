import Link from "next/link";

export default function DevBoardPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dev Board — under construction</h1>
          <p className="page-sub">
            The governed Dev Board is coming through the approved #226 and #227 foundation work.
            Until it lands, the existing task and issue views remain available.
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="dev-board-legacy-heading">
        <div className="card-header">
          <h2 className="card-title" id="dev-board-legacy-heading">
            Transitional views
          </h2>
        </div>
        <div className="card-body u-row-3 u-wrap">
          <Link className="btn" href="/tasks">
            Open legacy Tasks
          </Link>
          <Link className="btn" href="/issues">
            Open legacy Issues
          </Link>
        </div>
      </section>
    </div>
  );
}
