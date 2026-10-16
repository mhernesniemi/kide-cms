export function AccessDeniedView() {
  return (
    <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="text-muted-foreground">You do not have permission to view this collection.</p>
    </section>
  );
}
