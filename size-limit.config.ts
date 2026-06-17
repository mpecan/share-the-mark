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
];
