import type { SVGProps } from 'react'

export function CoffeeIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg data-wave-coffee-icon="" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M6 23h12" />
    </svg>
  )
}
