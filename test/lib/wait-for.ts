// Repeats `check` until it holds; the run's kill timer is the only bound. `what` names the stuck wait in the output.
export default async function waitFor(what: string, check: () => boolean | Promise<boolean>): Promise<void> {
  if (await check()) return;
  console.log(`      ...waiting for ${what}`);
  while (!(await check())) await new Promise((resolve) => setTimeout(resolve, 5));
}
