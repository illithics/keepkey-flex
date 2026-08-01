#!/bin/bash
# Build flex.keepkey.com → docs/ (GitHub Pages serves main:/docs).
# Self-contained output: crypto libs bundled at build time, no runtime CDN.
set -e
cd "$(dirname "$0")"
rm -rf docs && mkdir docs
npx esbuild src/verify.js --bundle --minify --format=esm --outfile=docs/verify.bundle.js
cp src/index.html docs/index.html
cp docs/index.html docs/verify.html   # path-compat with dev links
touch docs/.nojekyll
echo "flex.keepkey.com" > docs/CNAME
ls -lh docs/
