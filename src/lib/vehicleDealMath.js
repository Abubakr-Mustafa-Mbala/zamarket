// A vehicle seller's success fee is a share of the *agreed closing price*.
// An affiliate receives a share of that success fee, not an additional
// percentage of the vehicle price. Never add this fee to the public price.
export function vehicleDealBreakdown(salePrice, feePercent, affiliateSharePercent, hasAffiliate) {
  const amount = Number(salePrice)
  const fee = Number(feePercent)
  const share = Number(affiliateSharePercent)
  if (![amount, fee, share].every(Number.isFinite) || amount < 0 || fee < 0 || fee > 100 || share < 0 || share > 100) {
    throw new Error('Enter a valid selling price and percentages between 0 and 100')
  }
  // Arithmetic mirrors numeric(2) monetary rounding in the Supabase RPC.
  const grossFee = Math.round(amount * fee) / 100
  const affiliateEarns = hasAffiliate ? Math.round(grossFee * share) / 100 : 0
  return {
    salePrice: amount,
    grossFee,
    affiliateEarns,
    marketplaceKeeps: Math.round((grossFee - affiliateEarns) * 100) / 100,
    sellerReceives: Math.round((amount - grossFee) * 100) / 100,
  }
}
