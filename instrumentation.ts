export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ initDatabaseOnBoot }, { prefetchPayPalAccessToken }] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/paypal'),
    ]);
    initDatabaseOnBoot();
    await prefetchPayPalAccessToken();
  }
}
