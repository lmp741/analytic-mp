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

    // Check if import already exists
    const { data: existingImport } = await supabase
      .from('imports')
      .select('id')
      .eq('marketplace', marketplace)
      .eq('period_start', periodStart)
      .single();

    let importId: string;

    if (existingImport) {
      // Update existing import
      const { data: updated, error: updateError } = await supabase
        .from('imports')
        .update({
          period_end: periodEnd,
          file_hash: fileHash,
          status: 'PENDING',
          error_message: null,
        })
        .eq('id', existingImport.id)
        .select()
        .single();

      if (updateError) throw updateError;
      importId = updated.id;

      // Delete existing metrics
      await supabase
        .from('weekly_metrics')
        .delete()
        .eq('import_id', importId);
    } else {
      // Create new import
      const { data: newImport, error: createError } = await supabase
        .from('imports')
        .insert({
          marketplace,
          period_start: periodStart,
          period_end: periodEnd,
          file_hash: fileHash,
          status: 'PENDING',
        })
        .select()
        .single();

      if (createError) throw createError;
      importId = newImport.id;
    }

    // Upsert SKUs
    const artikuls = [...new Set(rows.map((r: any) => r.artikul))];
    for (const artikul of artikuls) {
      await supabase
        .from('sku')
        .upsert({ artikul }, { onConflict: 'artikul' });
    }

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

      if (insertError) throw insertError;
    }

    // Update import status
    await supabase
      .from('imports')
      .update({ status: 'IMPORTED' })
      .eq('id', importId);

    return NextResponse.json({ success: true, importId });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}
