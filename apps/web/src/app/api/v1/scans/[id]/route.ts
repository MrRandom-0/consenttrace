import { requireApiKey } from '@/server/apikeys';
import { handleError, HttpError, json } from '@/server/http';
import { getScanForOrg, loadScanResult } from '@/server/scans';
import { v1RateLimit } from '@/server/v1';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const { id } = await params;
    const scan = await getScanForOrg(id, ctx.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    const includeResult = new URL(req.url).searchParams.get('include') === 'result';
    const result = includeResult && scan.result_artifact_path ? await loadScanResult(scan) : undefined;
    return json({
      data: {
        id: scan.id,
        status: scan.status,
        triggerType: scan.trigger_type,
        createdAt: scan.created_at,
        startedAt: scan.started_at,
        completedAt: scan.completed_at,
        scannerVersion: scan.scanner_version,
        rulePackVersion: scan.rule_pack_version,
        errorCode: scan.error_code,
        baselineScanId: scan.baseline_scan_id,
        summary: scan.summary,
        ...(result !== undefined ? { result } : {}),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
