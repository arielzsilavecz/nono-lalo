export function Logo({ className = 'text-4xl' }: { className?: string }) {
  return (
    <span className={`font-script font-bold tracking-wide text-navy-800 ${className}`}>
      il nonno <span className="text-tomate-600">Lalo</span>
    </span>
  )
}
