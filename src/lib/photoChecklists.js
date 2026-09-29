// What to photograph, per kind of thing. A charger needs its ports shown; a cake
// needs a slice; a car needs eight angles. Generic advice helps nobody.

const LISTS = {
  electronics: {
    label: 'Electronics',
    shots: ['The front, straight on', 'The back, showing ports and labels', 'The box or packaging', 'Anything included — cable, plug, case', 'Any mark or scratch, if it is used'],
    tips: ['Daylight, no flash — screens and shiny plastic bounce the flash back', 'Wipe fingerprints off first', 'Keep the model number readable if it is on the item'],
  },
  fashion: {
    label: 'Clothing and shoes',
    shots: ['The whole item, flat or on a hanger', 'The back', 'A close-up of the fabric or stitching', 'The size label', 'Worn, if you can — clothes sell better on a person'],
    tips: ['Hang it or lay it flat and smooth — creases read as cheap', 'Plain wall or bedsheet behind it', 'Daylight shows the true colour; indoor bulbs turn white into yellow'],
  },
  beauty: {
    label: 'Beauty and cosmetics',
    shots: ['The product upright, label facing you', 'The ingredients or back label', 'The size, next to something familiar', 'The texture or colour, if that matters'],
    tips: ['Wipe the bottle — every smudge shows', 'Soft daylight, not direct sun', 'Do not use filters. The colour must be the real colour'],
  },
  food: {
    label: 'Food and cakes',
    shots: ['The whole thing, from slightly above', 'A close crop showing the texture', 'A slice or portion, if it can be cut', 'How it is packaged for delivery'],
    tips: ['Photograph it fresh — an hour later it is a different product', 'Daylight near a window beats any kitchen bulb', 'A plain plate or board, nothing competing in the frame'],
  },
  home: {
    label: 'Home and furniture',
    shots: ['The whole piece, straight on', 'At an angle, so the depth reads', 'A close-up of the material', 'In a room, so people can judge the size', 'Any damage, if used'],
    tips: ['Tidy what is behind it', 'Stand back and zoom with your feet, not the screen', 'Say the measurements in the description — photos cannot show size'],
  },
  vehicle: {
    label: 'Vehicles',
    shots: ['Front three-quarter — the classic car photo', 'Rear three-quarter', 'Both sides, straight on', 'Interior, front seats', 'Dashboard with the mileage showing', 'Engine bay', 'Tyres', 'Any dent, scratch or rust — honestly'],
    tips: ['Wash it first. This alone changes the price people offer', 'Early morning or late afternoon light, never midday sun', 'Open ground, not a crowded yard', 'Show the faults. Hiding them wastes everyone’s trip'],
  },
  service: {
    label: 'Services',
    shots: ['You or your team actually working', 'A finished job', 'Before and after, if you have both', 'Your tools or equipment', 'Where the work happens'],
    tips: ['A person in the photo makes a service real', 'Ask a customer before photographing their home or business', 'Do not use pictures from the internet — people can tell'],
  },
  course: {
    label: 'Courses and training',
    shots: ['The instructor', 'The classroom, workshop or vehicle', 'Students at work, with permission', 'Materials or certificates'],
    tips: ['A face builds more trust than a logo', 'Show the real room, even if it is modest', 'No stock photos of foreign classrooms'],
  },
  event: {
    label: 'Events',
    shots: ['The venue', 'A previous edition, if there was one', 'The performer, speaker or host', 'The poster or lineup'],
    tips: ['The date and place must be readable in the picture', 'Only use photos from your own event'],
  },
  general: {
    label: 'Everything else',
    shots: ['The whole item, straight on', 'A second angle', 'A close-up of the important detail', 'Packaging or what is included'],
    tips: ['Daylight near a window', 'Plain background — a wall, a bedsheet, a clean table', 'Fill the frame with the product'],
  },
}

export function checklistFor({ category, offeringType, fulfilment } = {}) {
  const t = (offeringType || '').toLowerCase()
  const c = (category || '').toLowerCase()
  if (t === 'vehicle') return LISTS.vehicle
  if (t === 'event') return LISTS.event
  if (t === 'course' || t === 'class') return LISTS.course
  if (fulfilment === 'service') return LISTS.service
  if (/food|cake|bak|snack|drink|cater|meal/.test(c)) return LISTS.food
  if (/phone|electronic|laptop|computer|tv|charger|audio/.test(c)) return LISTS.electronics
  if (/fashion|cloth|wear|shoe|dress|bag/.test(c)) return LISTS.fashion
  if (/beauty|cosmetic|hair|skin|nail|perfume/.test(c)) return LISTS.beauty
  if (/home|kitchen|furnitur|decor|living/.test(c)) return LISTS.home
  return LISTS.general
}

export const ALL_CHECKLISTS = LISTS
