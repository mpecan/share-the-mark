// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Documentation site for share-the-mark — served from GitHub Pages on the custom
// domain share-the-mark.com (so `base` is the root `/`; the domain is set via
// website/public/CNAME). Content is the repo's `docs/` folder (see
// src/content.config.ts), which is also the source for the generated README.
export default defineConfig({
  site: 'https://share-the-mark.com',
  integrations: [
    starlight({
      title: 'share-the-mark',
      description:
        'Annotate live web pages and export a Markdown changelog plus an annotated screenshot — ready for an AI assistant or a bug report.',
      logo: { src: './src/assets/logo.svg', alt: 'share-the-mark' },
      favicon: '/favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/mpecan/share-the-mark',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/mpecan/share-the-mark/edit/main/docs/',
      },
      customCss: ['./src/styles/custom.css'],
      // Sidebar is auto-generated from the docs and ordered by each page's
      // `sidebar.order` frontmatter (the same field the README generator reads) —
      // one source of truth for ordering, no hand-kept list to drift.
    }),
  ],
});
