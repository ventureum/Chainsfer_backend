#!/bin/bash
rm getPrefilledAccount.zip
npm install
zip -r getPrefilledAccount.zip ./
aws s3 cp getPrefilledAccount.zip s3://get-prefilled-account/
aws lambda update-function-code \
    --function-name "GetPrefilledAccount" \
    --s3-bucket "get-prefilled-account" \
    --s3-key "getPrefilledAccount.zip"
