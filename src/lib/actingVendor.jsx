import { createContext, useContext } from 'react'

// Lets a founder or staff member work inside a seller's own screens.
//
// Every vendor screen asks `useVendor()` which shop it is looking at, and the
// answer is normally "the one attached to whoever is signed in". When a seller
// cannot set their shop up themselves — no smartphone to hand, not confident
// with the forms, photos that need redoing — somebody from ZaMarket needs to be
// able to do it for them rather than talk them through it over the phone.
//
// Rather than rebuild the seller's forms a second time on the admin side, which
// would then drift out of step with the real ones, an admin page wraps the very
// same components in this provider and names the shop being worked on. The
// screens are identical to what the seller sees, so what you set up is exactly
// what they will find when they next sign in.
//
// The database already permits this: staff policies on products, vendors and
// store_sections allow it, and save_sections, vendor_set_featured and
// vendor_set_availability each check is_staff(). Nothing here grants access —
// it only tells the screens which shop to point at.
const Ctx = createContext(null)

export function ActingVendorProvider({ vendor, onSaved, children }) {
  return <Ctx.Provider value={{ vendor, onSaved }}>{children}</Ctx.Provider>
}

// The shop being worked on, or null when a seller is simply using their own
// dashboard. Null is the normal case.
export const useActingVendor = () => useContext(Ctx)?.vendor || null

// What to run after a save, since a staff member saving a seller's shop cannot
// refresh their own profile to see the change.
export const useActingSaved = () => useContext(Ctx)?.onSaved || null
