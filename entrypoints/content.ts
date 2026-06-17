export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // M1: on activation from the popup, mount the imperative drawing overlay
    // and the React changelog panel into a closed shadow root (SPEC §5.1, §5.8).
  },
});
