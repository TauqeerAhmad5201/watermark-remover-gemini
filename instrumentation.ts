export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize the global metrics singleton at server startup
    await import('./lib/metrics');
  }
}
