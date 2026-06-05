import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Stämpla',
  description: 'Påminnelse om att stämpla in och ut i Medvind',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E1245',
}

export default function StämplaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
