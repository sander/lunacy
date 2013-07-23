#!/bin/sh

for doc in $( ls design )
do
  node node_modules/couchapp/bin.js push design/$doc http://$server/lunacy
done
