#!/bin/sh

rm -rf dist/tmp
mkdir -p dist/tmp dist/tmp/lib

cp manifest.json dist/tmp/manifest.json
cp -r html visuals chrome dist/tmp
cp lib/game.js dist/tmp/lib

zip -r dist/$v.zip dist/tmp

rm -rf dist/tmp
