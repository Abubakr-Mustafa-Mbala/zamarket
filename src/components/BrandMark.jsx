import { memo } from 'react'

// The ZA mark, drawn rather than loaded as an image so it is crisp at every
// size, needs no extra request, and shows instantly with the rest of the
// header. The two paths and the transform are the approved symbol, lifted
// straight from public/favicon.svg — keep them in step if that file changes.
const CREAM = 'M68,376 73,376 101,366 157,351 197,344 221,335 255,325 318,311 369,303 418,298 469,295 515,295 555,245 564,238 571,239 579,247 653,335 660,340 668,342 684,342 741,347 793,354 853,366 888,376 896,376 856,357 806,337 748,318 722,312 611,181 599,169 581,161 551,161 541,164 528,172 453,266 445,273 435,277 420,279 384,281 369,280 578,25 582,18 328,18 318,21 310,26 268,79 251,103 277,94 327,84 435,83 439,85 258,300 218,310 166,328 126,345Z'
const TRANSFORM = 'translate(80.000 314.286) scale(0.879121)'
const VIOLET = 'M637,341 615,315 555,311 461,311 426,313 340,323 274,337 227,352 207,360 175,376 185,376 223,364 268,354 319,346 378,340 457,336 530,336Z M714,18 619,18 612,21 527,125 613,126 621,125 632,120 639,114Z'

// `ink` recolours the cream for a light background. The mark is cream on
// black by design, and on white paper the cream all but disappears — which
// is exactly where a receipt prints.
function BrandMark({ size = 30, title = 'ZaMarket', ink }) {
  const transform = TRANSFORM
  return (
    <svg className="brand-mark" width={size} height={size}
      viewBox="235.7 175.7 597.4 597.4" role="img" aria-label={title} focusable="false">
      <g transform={transform}>
        <path fill={ink || '#FAF9F6'} fillRule="evenodd" d={CREAM} />
        <path fill="#9432F4" fillRule="evenodd" d={VIOLET} />
      </g>
    </svg>
  )
}

export default memo(BrandMark)
