/**
 * Awaits a promise that is expected to reject and hands back the Error, so a
 * test can assert on the message and not only on the fact that it threw.
 */
export async function rejectionFrom(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}
