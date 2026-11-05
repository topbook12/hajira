import type { MetadataRoute } from 'next'

/**
 * PWA manifest — served at /manifest.webmanifest by Next.js.
 * This is what makes Hajira installable on Android/Chrome ("Add to Home
 * Screen") and gives it a name + icon on the phone's launcher.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hajira — Smart Attendance',
    short_name: 'Hajira',
    description:
      'Attendance in 60 seconds — proxy-proof, effortless. Rotating QR, GPS geofence, device binding and Excel archive.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#241C15',
    theme_color: '#241C15',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
