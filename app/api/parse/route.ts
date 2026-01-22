import { NextRequest, NextResponse } from 'next/server';

/**
 * Parse-only endpoint for dry-run validation
 * Does NOT write to database
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const marketplace = formData.get('marketplace') as string;

    if (!file || !marketplace) {
      return NextResponse.json(
        { error: 'Missing file or marketplace' },
        { status: 400 }
      );
    }

    // Dynamic import parsers
    let result;
    if (marketplace === 'WB') {
      const { parseWBFile } = await import('@/lib/parsers/wb');
      result = await parseWBFile(file);
    } else if (marketplace === 'OZON') {
      const { parseOzonFile } = await import('@/lib/parsers/ozon');
      result = await parseOzonFile(file);
    } else {
      return NextResponse.json(
        { error: 'Invalid marketplace' },
        { status: 400 }
      );
    }

    // Return diagnostics (no DB writes)
    return NextResponse.json({
      success: true,
      result: {
        ...result,
        periodStart: result.periodStart?.toISOString() || null,
        periodEnd: result.periodEnd?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Parse failed' },
      { status: 500 }
    );
  }
}
