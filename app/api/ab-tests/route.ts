import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const { marketplace, artikul } = body;

    if (!marketplace || !artikul) {
      return NextResponse.json(
        { error: 'Missing marketplace or artikul' },
        { status: 400 }
      );
    }

    // Get latest import for baseline
    const { data: latestImport } = await supabase
      .from('imports')
      .select('id, period_start')
      .eq('marketplace', marketplace)
      .eq('status', 'IMPORTED')
      .order('period_start', { ascending: false })
      .limit(1)
      .single();

    if (!latestImport) {
      return NextResponse.json(
        { error: 'No recent import found' },
        { status: 404 }
      );
    }

    // Get baseline metrics
    const { data: baselineMetric } = await supabase
      .from('weekly_metrics')
      .select('*')
      .eq('import_id', latestImport.id)
      .eq('artikul', artikul)
      .single();

    if (!baselineMetric) {
      return NextResponse.json(
        { error: 'Artikul not found in latest import' },
        { status: 404 }
      );
    }

    // Count existing tests for this artikul to generate label
    const { count } = await supabase
      .from('ab_tests')
      .select('*', { count: 'exact', head: true })
      .eq('marketplace', marketplace)
      .eq('artikul', artikul);

    const label = `#${(count || 0) + 1}`;

    // Create AB test
    const { data: newTest, error: createError } = await supabase
      .from('ab_tests')
      .insert({
        marketplace,
        artikul,
        label,
        baseline_period_start: latestImport.period_start,
        baseline_metrics: {
          impressions: baselineMetric.impressions,
          ctr: baselineMetric.ctr,
          cr_to_cart: baselineMetric.cr_to_cart,
          orders: baselineMetric.orders,
          revenue: baselineMetric.revenue,
          price_avg: baselineMetric.price_avg,
        },
        is_active: true,
      })
      .select()
      .single();

    if (createError) throw createError;

    return NextResponse.json({ success: true, test: newTest });
  } catch (error) {
    console.error('AB test creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create AB test' },
      { status: 500 }
    );
  }
}
