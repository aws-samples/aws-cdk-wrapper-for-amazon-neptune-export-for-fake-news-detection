#!/bin/bash
# /*!
#  * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#  * SPDX-License-Identifier: Apache-2.0
# */
# first download the files from s3
curl https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-ml-core-stack.json > ./lib/neptune_ml_core_stack.json
curl https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-base-stack.json > ./lib/neptune_base_stack.json
curl https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-sagemaker-notebook-stack.json > ./lib/neptune_sagemaker_notebook_stack.json

# then compile the typescript files and run the script to add export names
npx tsc scripts/addExportNames.ts --resolveJsonModule true && cd scripts/ && node addExportNames.js && cd ../