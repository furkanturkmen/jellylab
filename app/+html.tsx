import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

import { Brand } from '@/constants/brand';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/*
          Saved to an iOS home screen, the bookmark takes its icon from here and
          nowhere else: iOS refuses an SVG, composites transparency over black,
          and crops the corners itself, so this is a 180-square opaque PNG with
          no padding. It is served from public/ at a fixed path because a
          bundled asset would get a hashed name. scripts/brand-sync.mjs writes
          it. iOS caches per bookmark - re-add the page to see a change.
        */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="theme-color" content={Brand.substrate} />
        <meta name="apple-mobile-web-app-title" content="JellyLab" />
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

/*
 * The page's ground is the substrate in both schemes - the same value as the
 * icon tile and the launch screen, so a saved-to-home-screen bookmark opens
 * into the same colour it was launched from.
 */
const responsiveBackground = `
body {
  background-color: ${Brand.substrate};
}`;
