/**
 * Shared body for sections that are not built yet.
 *
 * Deliberately shows no sample or invented records: a placeholder that renders
 * plausible-looking fake data is worse than an empty one, because it is easy to
 * mistake for real information while building against it.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-note">
        This section is not built yet. Its data will come from the Gymly API, which already
        enforces who may read it.
      </p>
    </div>
  );
}
