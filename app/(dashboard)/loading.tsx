// Shown inside the dashboard frame while a page loads, so a click gives instant feedback.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex-1 animate-pulse p-5 sm:p-8">
      <div className="h-7 w-48 rounded bg-lilac" />
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-card bg-lilac/60" />
        ))}
      </div>
    </div>
  );
}
