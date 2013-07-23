#!/bin/sh

rm -rf dist/tmp
mkdir -p dist/tmp dist/tmp/lib

cp chrome/manifest_v1.9.json dist/tmp/manifest.json
cp -r html images dist/tmp
cp lib/game.js dist/tmp/lib

zip -r dist/$v.zip dist/tmp

rm -rf dist/tmp
