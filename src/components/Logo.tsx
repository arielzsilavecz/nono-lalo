import tipografiaImg from '/tipografia.svg'
import tipografiaLandingImg from '/tipografia-landing.svg'

const VARIANTS = {
  default: tipografiaImg,
  landing: tipografiaLandingImg,
} as const

export function Logo({ height = 'h-9', variant = 'default' }: { height?: string; variant?: keyof typeof VARIANTS }) {
  return (
    <img
      src={VARIANTS[variant]}
      alt="il nonno Lalo"
      className={`${height} w-auto object-contain`}
    />
  )
}
