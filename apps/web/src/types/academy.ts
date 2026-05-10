export interface AcademyProduct {
  id: string;
  name: string;
  description: string | null;
  price_ngn: number;
  credits_grant: number;
  leadash_months: number;
  is_active: boolean;
  created_at: string;
}

export interface AcademyCohort {
  id: string;
  product_id: string;
  name: string;
  starts_at: string;
  max_seats: number | null;
  status: string;
  created_at: string;
}

export interface AcademyModule {
  id: string;
  product_id: string;
  day_number: number;
  title: string;
  description: string | null;
  daily_action: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  duration_secs: number | null;
  unlock_offset_hours: number;
  created_at: string;
}

export interface AcademyEnrollment {
  id: string;
  user_id: string;
  workspace_id: string;
  product_id: string;
  cohort_id: string | null;
  status: string;
  paystack_reference: string | null;
  amount_kobo: number | null;
  phone: string | null;
  credits_granted: boolean;
  leadash_access_ends_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export interface AcademyProgress {
  id: string;
  enrollment_id: string;
  module_id: string;
  completed_at: string;
}

export interface ProductWithEnrollment extends AcademyProduct {
  enrollment: AcademyEnrollment | null;
  cohort: AcademyCohort | null;
  progress_count: number;
  module_count: number;
}
