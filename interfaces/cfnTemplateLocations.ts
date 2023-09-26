/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/

export enum cfnTemplateLocations {
  // note: if you update these, you will need to update the setup.sh script and the gitIgnore file
  MlCoreStack = "lib/neptune_ml_core_stack.json",
  BaseStack = "lib/neptune_base_stack.json",
  nestedNotebookStack = 'lib/neptune_sagemaker_notebook_stack.json',
}