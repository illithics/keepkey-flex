# flex.keepkey.com

Verified Flex — the zero-server verifier page for KeepKey pendant and
broadcast flex proofs.

Proof bundles travel in the URL **fragment** (never sent to any server) and
are verified entirely in-browser: EIP-712 signer recovery, live `ownerOf`
against public RPCs, validity window, and display binding. Includes the
"make phone wallpaper" composer.

Build: `./build.sh` — bundles viem + qrcode with esbuild into `docs/`,
which GitHub Pages serves. No runtime CDN dependencies.

Source of truth: the `keepkey-pendant` repo (`dapp/verify.html`).
