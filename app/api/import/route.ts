import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeFileHash } from '@/lib/utils/hash';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const { marketplace, periodStart, periodEnd, fileHash, rows } = body;

    if (!marketplace || !periodStart || !periodEnd || !fileHash || !rows) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    if (!['WB', 'OZON'].includes(marketplace)) {
      return NextResponse.json({ error: 'Invalid marketplace' }, { status: 400 });
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(periodStart) || !datePattern.test(periodEnd)) {
      return NextResponse.json(
        { error: 'Invalid period format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    // Upsert SKUs
    const artikuls = [...new Set(rows.map((r: any) => r.artikul))];
    const skuPayload = artikuls.map((artikul) => ({ artikul }));
    const { error: skuError } = await supabase
      .from('sku')
      .upsert(skuPayload, { onConflict: 'artikul', ignoreDuplicates: true });
    if (skuError) throw skuError;

    // Upsert import
    const { data: importRow, error: importError } = await supabase
      .from('imports')
      .upsert(
        {
          marketplace,
          period_start: periodStart,
          period_end: periodEnd,
          file_hash: fileHash,
          status: 'IMPORTED',
          error_message: null,
        },
        { onConflict: 'marketplace,period_start' }
      )
      .select('id')
      .single();
    if (importError) throw importError;
    const importId = importRow.id;

    // Delete existing metrics for this import
    const { error: deleteError } = await supabase
      .from('weekly_metrics')
      .delete()
      .eq('import_id', importId);
    if (deleteError) throw deleteError;

    // Insert metrics in chunks
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const metrics = chunk.map((row: any) => ({
        import_id: importId,
        marketplace,
        artikul: row.artikul,
        impressions: row.impressions,
        visits: row.visits,
        ctr: row.ctr,
        add_to_cart: row.add_to_cart,
        cr_to_cart: row.cr_to_cart,
        orders: row.orders,
        revenue: row.revenue,
        price_avg: row.price_avg,
        drr: row.drr,
        stock_end: row.stock_end,
        delivery_avg_hours: row.delivery_avg_hours,
        rating: row.rating,
        reviews_count: row.reviews_count,
      }));

      const { error: insertError } = await supabase
        .from('weekly_metrics')
        .insert(metrics);

      if (insertError) {
        await supabase
          .from('imports')
          .update({
            status: 'FAILED',
            error_message: insertError.message,
          })
          .eq('id', importId);
        throw insertError;
      }
    }

    const { count, error: countError } = await supabase
      .from('weekly_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('import_id', importId);
    if (countError) throw countError;

    if (!count || count === 0) {
      await supabase
        .from('imports')
        .update({ status: 'FAILED', error_message: 'No metrics saved' })
        .eq('id', importId);
      return NextResponse.json(
        { error: 'No metrics saved for this import' },
        { status: 500 }
      );
    }

    // Update import status
    const { error: statusError } = await supabase
      .from('imports')
      .update({ status: 'IMPORTED' })
      .eq('id', importId);
    if (statusError) throw statusError;

    return NextResponse.json({ success: true, importId, metricsCount: count });
  } catch (error) {
    console.error('Import error:', error);
    const details =
      typeof error === 'object' && error !== null && 'details' in error
        ? (error as { details?: string }).details
        : null;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Import failed',
        details: details || null,
      },
      { status: 500 }
    );
  }
}
