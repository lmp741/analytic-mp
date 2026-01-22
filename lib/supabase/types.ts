export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: number;
          summary_min_impressions: number;
          ctr_drop_pct: number;
          cr_to_cart_drop_pct: number;
          orders_drop_pct: number;
          revenue_drop_pct: number;
          drr_worse_pct: number;
          max_zone_tags: number;
          ignore_prev_zero: boolean;
          updated_at: string;
        };
        Insert: {
          id?: number;
          summary_min_impressions?: number;
          ctr_drop_pct?: number;
          cr_to_cart_drop_pct?: number;
          orders_drop_pct?: number;
          revenue_drop_pct?: number;
          drr_worse_pct?: number;
          max_zone_tags?: number;
          ignore_prev_zero?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: number;
          summary_min_impressions?: number;
          ctr_drop_pct?: number;
          cr_to_cart_drop_pct?: number;
          orders_drop_pct?: number;
          revenue_drop_pct?: number;
          drr_worse_pct?: number;
          max_zone_tags?: number;
          ignore_prev_zero?: boolean;
          updated_at?: string;
        };
      };
      sku: {
        Row: {
          id: string;
          artikul: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artikul: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          artikul?: string;
          created_at?: string;
        };
      };
      imports: {
        Row: {
          id: string;
          marketplace: 'WB' | 'OZON';
          period_start: string;
          period_end: string;
          uploaded_at: string;
          file_hash: string;
          status: 'PENDING' | 'IMPORTED' | 'FAILED';
          error_message: string | null;
        };
        Insert: {
          id?: string;
          marketplace: 'WB' | 'OZON';
          period_start: string;
          period_end: string;
          uploaded_at?: string;
          file_hash: string;
          status?: 'PENDING' | 'IMPORTED' | 'FAILED';
          error_message?: string | null;
        };
        Update: {
          id?: string;
          marketplace?: 'WB' | 'OZON';
          period_start?: string;
          period_end?: string;
          uploaded_at?: string;
          file_hash?: string;
          status?: 'PENDING' | 'IMPORTED' | 'FAILED';
          error_message?: string | null;
        };
      };
      weekly_metrics: {
        Row: {
          id: string;
          import_id: string;
          marketplace: 'WB' | 'OZON';
          artikul: string;
          impressions: number;
          visits: number;
          ctr: number;
          add_to_cart: number;
          cr_to_cart: number;
          orders: number;
          revenue: number | null;
          price_avg: number | null;
          drr: number | null;
          stock_end: number | null;
          delivery_avg_hours: number | null;
          rating: number | null;
          reviews_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          marketplace: 'WB' | 'OZON';
          artikul: string;
          impressions: number;
          visits: number;
          ctr: number;
          add_to_cart: number;
          cr_to_cart: number;
          orders: number;
          revenue?: number | null;
          price_avg?: number | null;
          drr?: number | null;
          stock_end?: number | null;
          delivery_avg_hours?: number | null;
          rating?: number | null;
          reviews_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string;
          marketplace?: 'WB' | 'OZON';
          artikul?: string;
          impressions?: number;
          visits?: number;
          ctr?: number;
          add_to_cart?: number;
          cr_to_cart?: number;
          orders?: number;
          revenue?: number | null;
          price_avg?: number | null;
          drr?: number | null;
          stock_end?: number | null;
          delivery_avg_hours?: number | null;
          rating?: number | null;
          reviews_count?: number | null;
          created_at?: string;
        };
      };
      ab_tests: {
        Row: {
          id: string;
          marketplace: 'WB' | 'OZON';
          artikul: string;
          label: string;
          created_at: string;
          baseline_period_start: string;
          baseline_metrics: any;
          is_active: boolean;
          removed_at: string | null;
        };
        Insert: {
          id?: string;
          marketplace: 'WB' | 'OZON';
          artikul: string;
          label: string;
          created_at?: string;
          baseline_period_start: string;
          baseline_metrics: any;
          is_active?: boolean;
          removed_at?: string | null;
        };
        Update: {
          id?: string;
          marketplace?: 'WB' | 'OZON';
          artikul?: string;
          label?: string;
          created_at?: string;
          baseline_period_start?: string;
          baseline_metrics?: any;
          is_active?: boolean;
          removed_at?: string | null;
        };
      };
      import_logs: {
        Row: {
          id: string;
          import_id: string | null;
          level: 'INFO' | 'WARN' | 'ERROR';
          message: string;
          details: any | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_id?: string | null;
          level: 'INFO' | 'WARN' | 'ERROR';
          message: string;
          details?: any | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string | null;
          level?: 'INFO' | 'WARN' | 'ERROR';
          message?: string;
          details?: any | null;
          created_at?: string;
        };
      };
    };
  };
};
