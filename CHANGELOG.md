# Changelog

## [2.0.0](https://github.com/mpecan/share-the-mark/compare/extension-v1.1.0...extension-v2.0.0) (2026-06-25)


### ⚠ BREAKING CHANGES

* embed API renames (pre-release, no external consumers): WidgetConfig.onSubmit -> onExport; Channel-A EmbedHandle.triggerExport -> exportNow; MountOptions.onExport is now optional (provide sink or onExport).

### Code Refactoring

* audit & improve the embed/UI API surface ([3492525](https://github.com/mpecan/share-the-mark/commit/34925258e37c3f93fc3e1d9ed753897f7f6feac3))

## [1.1.0](https://github.com/mpecan/share-the-mark/compare/extension-v1.0.0...extension-v1.1.0) (2026-06-24)


### Features

* **capture:** full-page screenshots for embed channels + extension opt-in ([45794a2](https://github.com/mpecan/share-the-mark/commit/45794a2c4215c317ea02a59aff33b5a11bf9eb50))
* **capture:** full-page screenshots for embed channels + extension opt-in ([16a38df](https://github.com/mpecan/share-the-mark/commit/16a38df96ebf35f50b8df6f872a538f9d64dd8d5))
* **cli:** `setup` starts the daemon; backgrounded daemons self-clean ([643fecc](https://github.com/mpecan/share-the-mark/commit/643fecceb14024c6f7b899a627bb62b8c8603f2f))
* **cli:** add `request --playwright` for headed interactive remote annotation ([05226b3](https://github.com/mpecan/share-the-mark/commit/05226b3e9baa7e88eb917c7a33c367bdf72a2518))
* **cli:** embed the Channel-C bundle into the binary (mise-orchestrated) ([45d91a4](https://github.com/mpecan/share-the-mark/commit/45d91a453923c5de4b96dcf57fc6689809ab8f13))
* **cli:** release pipeline — GitHub Releases binaries + curl|sh + binstall ([c4bd475](https://github.com/mpecan/share-the-mark/commit/c4bd47590294ec94326cb32fefd4ff32be15b440))
* **cli:** serve local artifacts for annotation (Channel C, SPEC §13.6) ([6fb1395](https://github.com/mpecan/share-the-mark/commit/6fb1395ec27ee6539a802161770a5b313774ab02))
* **cli:** start the daemon in `setup` and self-clean backgrounded daemons ([4ed763b](https://github.com/mpecan/share-the-mark/commit/4ed763b63237e154581e8fe057ae6ccc6c15e47e))
* **daemon:** extension↔CLI version handshake (SPEC §11.4) ([3a07435](https://github.com/mpecan/share-the-mark/commit/3a074355149708a1ff342ca079c35899d86c148c))
* **daemon:** extension↔CLI version handshake (SPEC §11.4) ([aebaa81](https://github.com/mpecan/share-the-mark/commit/aebaa81bce0b195ee6880568b580b7796022bf3e))
* **discovery:** cross-link the extension and CLI halves ([1d15cf6](https://github.com/mpecan/share-the-mark/commit/1d15cf64dd0af5a852ac8f3573643ddd78108cde))
* **discovery:** cross-link the extension and CLI halves ([e7d5c2b](https://github.com/mpecan/share-the-mark/commit/e7d5c2b0ba684ffda520347ef5b6b8e02d1f12c2))
* **embed:** add Playwright injection channel (SPEC §13.4) ([5fa4035](https://github.com/mpecan/share-the-mark/commit/5fa40358d828ee6e54074971cf5945a50636a760))
* **embed:** add the dev &lt;script&gt; widget channel (SPEC §13.5) ([36b432a](https://github.com/mpecan/share-the-mark/commit/36b432acb73f198ff889bc14493ef2a4791cb5de))
* **embed:** extract a browser-free annotation session (SPEC §13, M5) ([92d08dd](https://github.com/mpecan/share-the-mark/commit/92d08dd89a705b095ff5e600868f317da5d49210))
* **embed:** publish @share-the-mark/embed to npm ([9c0be0b](https://github.com/mpecan/share-the-mark/commit/9c0be0ba7a68339bd0c493364054ac3b3673e1ba))
* **embed:** publish @share-the-mark/embed to npm ([809373c](https://github.com/mpecan/share-the-mark/commit/809373ca219cfe1b357e44945ae5e2e27c5b08c5))
* **export:** add BindingSink and a generic exportSink port (SPEC §13.3) ([6d6e8af](https://github.com/mpecan/share-the-mark/commit/6d6e8afd22525ec046e64b54e9e0acd8c3a92e5f))
* extension-less / embeddable delivery (M5, SPEC §13) ([2bf2472](https://github.com/mpecan/share-the-mark/commit/2bf2472f8894a476bb60a9590c1ca395bf7ddbe1))
* **panel:** link to setup from the connect view's disconnected state ([816d0d6](https://github.com/mpecan/share-the-mark/commit/816d0d623a57025d8571441d94472fb4c29a4c73))
* **panel:** link to setup from the connect view's disconnected state ([9e3ebcc](https://github.com/mpecan/share-the-mark/commit/9e3ebcce45ce77b0598ad4a18893d26f3c920c50))
* **release:** CLI distribution pipeline — release-please, binaries, crates.io, Homebrew ([d133216](https://github.com/mpecan/share-the-mark/commit/d1332160bfc4b8cf70298bbd12d1ce025d2c6a80))
* **release:** release-please versioning + crates.io & Homebrew publishing ([8297b46](https://github.com/mpecan/share-the-mark/commit/8297b46d214d369965a92129dab01f503b58a2cd))
* **ui:** add light theme and a guided local-agent connect view ([340dc0c](https://github.com/mpecan/share-the-mark/commit/340dc0c847e7f256186e0df19dc40c0d497747dd))
* **ui:** light theme + guided local-agent connect view ([cdf7180](https://github.com/mpecan/share-the-mark/commit/cdf7180337c35c937330958b47b608f73952d9d6))


### Bug Fixes

* **agent-setup:** recommend non-blocking `start` over blocking `serve` ([1d69eb6](https://github.com/mpecan/share-the-mark/commit/1d69eb6aa2c439a923ac82770fb7ccc9363c9669))
* **agent-setup:** recommend the non-blocking `start` over `serve` ([f1c5e76](https://github.com/mpecan/share-the-mark/commit/f1c5e764e98874eda8282443c453811ff85ae46e))
* **ci:** build the embed bundles before the size gate ([12c2041](https://github.com/mpecan/share-the-mark/commit/12c20419c8ef4b9f3a4c5a39d49b4f3f7f1d57fd))
* **ci:** manage pnpm via mise so the CLI jobs find it ([6922bd2](https://github.com/mpecan/share-the-mark/commit/6922bd2e806fead43e017f6a8191d602c9d64274))
* **cli:** drop constant assert flagged by clippy 1.96 ([19d80b0](https://github.com/mpecan/share-the-mark/commit/19d80b0da056ac67a5a708620b3fc0715fae18f5))
* **embed:** don't force provenance in publishConfig ([bcecc62](https://github.com/mpecan/share-the-mark/commit/bcecc62471692e332815a285016a88333547f2c3))
* **embed:** show one correctly-labeled button in Channel C local-serve ([e384b10](https://github.com/mpecan/share-the-mark/commit/e384b101b2cfff0cbaa083c4e13c1a1ddba31d70))
* **embed:** show one correctly-labeled button in the Channel A panel too ([59a4e52](https://github.com/mpecan/share-the-mark/commit/59a4e52c88d837c894a144518dd884bae06af28e))
* **release:** correct Homebrew/install checksum asset name ([0c9d215](https://github.com/mpecan/share-the-mark/commit/0c9d215f44959814b7e326145e1033454091f5fd))
* **release:** correct Homebrew/install checksum asset name ([e4f7743](https://github.com/mpecan/share-the-mark/commit/e4f774320d0db7f4261e30e71b99a4c8ed3bc770))
