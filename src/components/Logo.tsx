import tipografiaImg from '/tipografia.svg'

export function Logo({ height = 'h-9' }: { height?: string }) {
  return (
    <img
      src={tipografiaImg}
      alt="il nonno Lalo"
      className={`${height} w-auto object-contain`}
    />
  )
}
