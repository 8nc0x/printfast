export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-lg font-semibold">You&rsquo;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        PrintFlow needs a connection to load your jobs. Reconnect and try again.
      </p>
    </div>
  );
}
