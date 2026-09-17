// Mirrors order_transition_allowed() in schema.sql so the UI only offers legal moves.
export const ORDER_NEXT = {
  pending: ['confirmed', 'payment_pending', 'customer_unreachable', 'fraud_review', 'cancelled'],
  customer_unreachable: ['confirmed', 'pending', 'cancelled'],
  confirmed: ['payment_pending', 'paid', 'processing', 'cancelled'],
  payment_pending: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'ready_for_dispatch', 'refunded', 'cancelled'],
  processing: ['ready_for_dispatch', 'out_for_delivery', 'cancelled'],
  ready_for_dispatch: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'failed_delivery', 'cancelled'],
  failed_delivery: ['out_for_delivery', 'returned', 'cancelled'],
  delivered: ['completed', 'returned', 'refunded'],
  completed: ['returned', 'refunded'],
  fraud_review: ['confirmed', 'pending', 'cancelled'],
  cancelled: [],
  refunded: [],
  returned: [],
}

export const TONE = {
  pending: 'warn', customer_unreachable: 'warn', payment_pending: 'warn', fraud_review: 'bad',
  confirmed: 'info', paid: 'ok', processing: 'info', ready_for_dispatch: 'info', out_for_delivery: 'info',
  delivered: 'ok', completed: 'ok', cancelled: 'bad', refunded: 'bad', returned: 'bad', failed_delivery: 'bad',
  approved: 'ok', rejected: 'bad', suspended: 'bad', terminated: 'bad', active: 'ok', published: 'ok',
  draft: '', submitted: 'warn', out_of_stock: 'warn', verified: 'info', eligible: 'info', reversed: 'bad',
  received: 'ok', in_transit: 'info', ordered: 'info', paused: 'warn', expired: '', archived: '',
  scheduled: 'info', sold_out: 'warn', healthy: 'ok', watch: 'warn', at_risk: 'bad', pending_approval: 'warn', failed: 'bad', fee_pending: 'warn', fee_confirmed: 'ok',
}

export const SOURCES = ['organic', 'facebook_ad', 'instagram', 'whatsapp', 'referral', 'founder', 'vendor_audience', 'influencer', 'partnership', 'outbound', 'phone', 'physical']
export const CHANNELS = ['marketplace', 'whatsapp', 'phone', 'physical', 'instagram', 'facebook']
export const CATEGORIES = ['Electronics', 'Home', 'Beauty', 'Fashion', 'Food', 'Kids', 'Health', 'Tools', 'Other']
export const PAYMENT_METHODS = ['cash', 'airtel_money', 'mtn_money', 'bank', 'paypal', 'other']
export const EXPENSE_CATEGORIES = ['packaging', 'fuel', 'transport', 'rent', 'storage', 'airtime', 'software', 'advertising', 'other']
