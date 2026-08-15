import { checkReadiness } from "~/modules/monitoring/health";

/**
 * Readiness endpoint: deep-checks PostgreSQL, Redis, worker heartbeat, and
 * queue health. Returns 503 when the app cannot serve (db/redis down) and
 * 200 otherwise, so orchestration can route on it.
 */
export async function loader() {
  try {
    const report = await checkReadiness();
    return Response.json(report, {
      status: report.status === "down" ? 503 : 200,
    });
  } catch (error) {
    console.error("monitoring: readiness check failed", error);
    return Response.json(
      { status: "down", checkedAt: new Date().toISOString() },
      { status: 503 },
    );
  }
}
