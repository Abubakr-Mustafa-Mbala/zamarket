# ZaMarket Motors — seller success-fee and vehicle listing update

This is a **separate, incremental feature** based on the supplied `zamarket.zip` Journal 2.0 copy. It does not replace Journal 2.0, does not change retail product commissions, and does not alter live orders or the universal vendor pricing model.

## Business terms

- The **vehicle price** is the seller-agreed advertised price. **Never add** an automatic marketplace fee or affiliate markup.
- The seller separately agrees to pay ZaMarket a **success fee** of X% of the real verified closing price, e.g. 5% or 10%.
- For a tracked, approved affiliate who sourced the buyer, the administrator assigns a **share of that fee**, e.g. 50%. No tracked affiliate means ZaMarket keeps 100% of the success fee.
- The fee agreement is private; customers see only the car's asking price, photographs, specs, location and enquiry buttons.
- Deal reporting records **gross seller fee**, **affiliate share**, **ZaMarket net retention** (before other business costs), and **seller net after success fee**. Both fees use the **verified closing price**, not just the advertised price.
- **Affiliate commission cannot be approved or paid until the seller success fee has been received** and the normal grace period has passed; receipt is recorded manually by staff.

### Example

Vehicle sells for K100,000. Seller agreed to pay 10% success fee. Affiliate shares 50% of that fee.

- Seller receives K90,000.
- Seller pays K10,000 success fee to ZaMarket.
- Affiliate earns K5,000 only if their tracked referral resulted in the verified sale.
- ZaMarket keeps K5,000 before other costs.
- If ZaMarket found the buyer directly, it keeps K10,000 before other costs.

## Vehicle listing workflow

1. Staff creates a draft product, then opens its **Offering page builder**, chooses **Vehicle** and **Enquire first** or **Open to offers**.
2. Upload the actual car's available photographs: front 3/4, rear, both sides, interior, dashboard/odometer, engine, tyres and any visible defects. The first image is the hero; existing gallery supports thumbnails and zoom.
3. Enter the public asking price and the true location.
4. In the **private seller agreement**, staff enters the agreed seller success-fee percentage, affiliate share of that fee, and a private evidence/authorization reference. Vendor accounts cannot set these terms.
5. Click **Add vehicle specification fields**, fill only verified information (make, model, year, mileage, transmission, fuel, condition, registration, etc.), leaving unknown fields blank.
6. Publish. Customers enquire; approved tracked affiliates can promote. Vehicle `enquire` and `negotiate` submissions create a deal.
7. Admin confirms the agreed sale price and evidence, then records the sale. The system calculates the fixed deal terms using the actual closing price. Admin records when the seller pays the fee; only then can the affiliate commission become eligible and progress to payout.

## Safe deployment

**Do not replace your current Codespaces repository with this old ZIP** if the repository contains newer Journal 2.0 changes. Use the small changed-files patch, compare changes carefully, commit the prior Journal work separately, and deploy after resolving conflicts. Never run `git reset --hard` or force-push.

1. Back up your Codespace and commit completed Journal 2.0 changes before merging this feature.
2. In Supabase SQL Editor, review and run ONLY `supabase/migrations/20261109_vehicle_success_fee_REVIEW.sql` **once**, after taking a database backup. This modifies vehicle RPC calculations and adds private terms columns; test on staging first.
3. Apply the small update ZIP to the matching source revision. **Review rather than blindly overwriting changed files** if the repository has evolved.
4. Run `npm ci`, `npm run check`, `npm run build`.
5. Test an anonymous direct enquiry, an approved affiliate enquiry, price negotiation, sale close, no-affiliate fee, pending affiliate reward, fee received, grace-period enforcement and refund/dispute handling on staging.
6. Commit and push normally; confirm Netlify deploys successfully.

**Caution:** Existing open deals created under the old calculation use legacy commission terms. This migration does **not** reprice them retroactively. Review those deals before closing them, especially when affiliate commission could exceed the seller's agreed fee. Older previously closed deals remain unchanged.
