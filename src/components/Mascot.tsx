/** La albóndiga con gorro de chef de la pizarra, recreada en SVG. */
export function Mascot({ className = 'h-28 w-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 130" className={className} role="img" aria-label="Mascota de il nonno Lalo">
      {/* Gorro de chef */}
      <g>
        <circle cx="38" cy="22" r="13" fill="#fdfaf2" stroke="#e4d2a8" strokeWidth="1.5" />
        <circle cx="60" cy="15" r="15" fill="#fdfaf2" stroke="#e4d2a8" strokeWidth="1.5" />
        <circle cx="82" cy="22" r="13" fill="#fdfaf2" stroke="#e4d2a8" strokeWidth="1.5" />
        <rect x="36" y="22" width="48" height="18" fill="#fdfaf2" />
        <rect x="34" y="36" width="52" height="9" rx="4" fill="#f0e4c8" stroke="#e4d2a8" strokeWidth="1.5" />
      </g>

      {/* Cuerpo: la albóndiga */}
      <circle cx="60" cy="84" r="42" fill="#b0492f" />
      <circle cx="60" cy="84" r="42" fill="none" stroke="#93371d" strokeWidth="2" />

      {/* Textura de la albóndiga */}
      <g fill="#8a3520" opacity="0.85">
        <circle cx="34" cy="76" r="2.4" />
        <circle cx="44" cy="104" r="2.8" />
        <circle cx="62" cy="116" r="2.2" />
        <circle cx="84" cy="100" r="2.6" />
        <circle cx="90" cy="78" r="2.2" />
        <circle cx="74" cy="58" r="2.1" />
      </g>
      <g fill="#cd6b4a" opacity="0.9">
        <circle cx="40" cy="60" r="2" />
        <circle cx="28" cy="90" r="2.2" />
        <circle cx="56" cy="108" r="2" />
        <circle cx="78" cy="112" r="2" />
        <circle cx="94" cy="90" r="2" />
        <circle cx="86" cy="62" r="1.8" />
      </g>

      {/* Ojos */}
      <g>
        <ellipse cx="48" cy="78" rx="8" ry="9" fill="#fdfaf2" />
        <ellipse cx="72" cy="78" rx="8" ry="9" fill="#fdfaf2" />
        <circle cx="49.5" cy="80" r="4" fill="#1a2840" />
        <circle cx="70.5" cy="80" r="4" fill="#1a2840" />
        <circle cx="51" cy="78.5" r="1.3" fill="#fdfaf2" />
        <circle cx="72" cy="78.5" r="1.3" fill="#fdfaf2" />
      </g>

      {/* Cachetes */}
      <ellipse cx="38" cy="92" rx="5" ry="3.4" fill="#d05a32" opacity="0.8" />
      <ellipse cx="82" cy="92" rx="5" ry="3.4" fill="#d05a32" opacity="0.8" />

      {/* Sonrisa */}
      <path
        d="M 48 96 Q 60 108 72 96"
        fill="none"
        stroke="#1a2840"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
