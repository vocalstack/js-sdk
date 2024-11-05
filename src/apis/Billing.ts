import { VocalStackApi } from '../VocalStackApi';

import { SummaryTranscription } from './Transcriptions';

export type BillingDetailsPlan = {
  uuid: string;
  start_date: string;
  stop_date: string;
  price: number;
  billing_frequency: string;
  free_hours: number;
  overage_rate_prerecorded: number;
  overage_rate_live: number;
  meta_name: string;
};

export type BillingDetails = {
  balance: number;
  prerecorded_hours_available: number;
  live_hours_available: number;
  free_hours_used: number;
  free_hours_left: number;
  total_per_month: Record<string, number>;
  savings_per_month: Record<string, number>;
  paid_per_month: Record<string, number>;
  owed_per_month: Record<string, number>;
  plans: BillingDetailsPlan[];
  active_plan: BillingDetailsPlan;
  hobby_plan: BillingDetailsPlan;
  month_plans: Record<string, string[]>;
  billing: Record<
    string,
    Array<
      Partial<SummaryTranscription> & {
        plan: string;
        length_in_adjusted_seconds: number;
        free_seconds_available_before?: number;
        free_seconds_available_after?: number;
        cost: number;
        notes: string[];
      }
    >
  >;
  invoices: Array<{
    invoice_id: string;
    plan_id?: string;
    plan_uuid?: string;
    interval?: 'year' | 'month';
    status: 'open' | 'paid' | 'void';
    status_transitions: {
      paid_at: number;
      finalized_at: number;
      marked_uncollectible_at: number;
      voided_at: number;
    };
    paid: boolean;
    amount: number;
    amount_paid: number;
    amount_remaining: number;
    view_link: string;
    download_link: string;
    metadata?: Record<string, string>;
  }>;
};

export class Billing extends VocalStackApi {
  async getBillingDetails() {
    return this._rest().get<BillingDetails>('/billing/details');
  }
}
