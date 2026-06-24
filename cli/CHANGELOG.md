# Changelog

## [0.3.0](https://github.com/mpecan/share-the-mark/compare/cli-v0.2.0...cli-v0.3.0) (2026-06-24)


### Features

* **cli:** `setup` starts the daemon; backgrounded daemons self-clean ([643fecc](https://github.com/mpecan/share-the-mark/commit/643fecceb14024c6f7b899a627bb62b8c8603f2f))
* **cli:** add `request --playwright` for headed interactive remote annotation ([05226b3](https://github.com/mpecan/share-the-mark/commit/05226b3e9baa7e88eb917c7a33c367bdf72a2518))
* **cli:** embed the Channel-C bundle into the binary (mise-orchestrated) ([45d91a4](https://github.com/mpecan/share-the-mark/commit/45d91a453923c5de4b96dcf57fc6689809ab8f13))
* **cli:** serve local artifacts for annotation (Channel C, SPEC §13.6) ([6fb1395](https://github.com/mpecan/share-the-mark/commit/6fb1395ec27ee6539a802161770a5b313774ab02))
* **cli:** start the daemon in `setup` and self-clean backgrounded daemons ([4ed763b](https://github.com/mpecan/share-the-mark/commit/4ed763b63237e154581e8fe057ae6ccc6c15e47e))
* **daemon:** extension↔CLI version handshake (SPEC §11.4) ([3a07435](https://github.com/mpecan/share-the-mark/commit/3a074355149708a1ff342ca079c35899d86c148c))
* **daemon:** extension↔CLI version handshake (SPEC §11.4) ([aebaa81](https://github.com/mpecan/share-the-mark/commit/aebaa81bce0b195ee6880568b580b7796022bf3e))
* **discovery:** cross-link the extension and CLI halves ([1d15cf6](https://github.com/mpecan/share-the-mark/commit/1d15cf64dd0af5a852ac8f3573643ddd78108cde))
* **discovery:** cross-link the extension and CLI halves ([e7d5c2b](https://github.com/mpecan/share-the-mark/commit/e7d5c2b0ba684ffda520347ef5b6b8e02d1f12c2))
* extension-less / embeddable delivery (M5, SPEC §13) ([2bf2472](https://github.com/mpecan/share-the-mark/commit/2bf2472f8894a476bb60a9590c1ca395bf7ddbe1))


### Bug Fixes

* **agent-setup:** recommend non-blocking `start` over blocking `serve` ([1d69eb6](https://github.com/mpecan/share-the-mark/commit/1d69eb6aa2c439a923ac82770fb7ccc9363c9669))
* **agent-setup:** recommend the non-blocking `start` over `serve` ([f1c5e76](https://github.com/mpecan/share-the-mark/commit/f1c5e764e98874eda8282443c453811ff85ae46e))
* **cli:** drop constant assert flagged by clippy 1.96 ([19d80b0](https://github.com/mpecan/share-the-mark/commit/19d80b0da056ac67a5a708620b3fc0715fae18f5))
* **embed:** show one correctly-labeled button in Channel C local-serve ([e384b10](https://github.com/mpecan/share-the-mark/commit/e384b101b2cfff0cbaa083c4e13c1a1ddba31d70))

## [0.2.0](https://github.com/mpecan/share-the-mark/compare/cli-v0.1.0...cli-v0.2.0) (2026-06-20)


### Features

* **cli:** release pipeline — GitHub Releases binaries + curl|sh + binstall ([c4bd475](https://github.com/mpecan/share-the-mark/commit/c4bd47590294ec94326cb32fefd4ff32be15b440))
* **release:** CLI distribution pipeline — release-please, binaries, crates.io, Homebrew ([d133216](https://github.com/mpecan/share-the-mark/commit/d1332160bfc4b8cf70298bbd12d1ce025d2c6a80))
