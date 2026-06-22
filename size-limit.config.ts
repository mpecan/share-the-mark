// Bundle budget — see SPEC §8.7. Caps the gzipped React UI chunks (popup,
// and later options/panel). `running: false` keeps this a pure byte-size gate
// (no headless-Chrome execution-time measurement), so it runs anywhere in CI.
export default [
  {
    name: 'UI bundle (popup/options/panel)',
    path: '.output/chrome-mv3/chunks/*.js',
    limit: '150 kB',
    gzip: true,
    running: false,
  },
  {
    // The standalone embed IIFE injected for channel A (SPEC §13.4/§13.8) — React +
    // the annotation core in one self-contained script. Run `pnpm build:embed` first.
    name: 'Embed bundle (standalone injection)',
    path: '.output/embed/embed.global.js',
    limit: '120 kB',
    gzip: true,
    running: false,
  },
];
