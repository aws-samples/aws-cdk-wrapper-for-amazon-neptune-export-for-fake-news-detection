/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/

import * as fs from 'fs'
import {cfnTemplateLocations} from '../interfaces/cfnTemplateLocations'

const saveTemplate = (template: any, fileName: string) => {
  /**
   * this saves the template to a local json file
   */
  const json = JSON.stringify(template, null, 2)
  fs.writeFileSync(fileName, json)
  console.log("successfully saved json to: ", fileName)
}

const addExportNames = (template: any) => {
  /**
   * This function adds export names to each of the exports in the base stack and the ml core stack.
   */
  const keys = Object.keys(template.Outputs!)
  // for each of they outputs, we want to use the name of the output to set the name for the export piece of the JSON.
  for (const outputKey of keys) {
    const output = template.Outputs![outputKey]
    output.Export = {"Name": outputKey};
  }
  console.log("Added required export names to outputs")
  return template
}


async function main() {
  /**
   * This function adds export names to each of the exports in the base stack and the ml core stack.
   * The export names are required so that the NeptuneMlCoreStack stack can access the outputs of the NeptuneBaseStack, like the VPC, etc. 
   * It then saves the templates to the lib folder.
   * Note that it includes the ../ before the path because this is run inside the scripts folder when you use the setup.sh script.
   */

  // neptune_base_stack
  const neptune_base_stack =require(`../${cfnTemplateLocations.BaseStack}`)
  const t1 = addExportNames(neptune_base_stack)
  saveTemplate(t1, `../${cfnTemplateLocations.BaseStack}`)

  // neptune_ml_core_stack
  const neptune_ml_core_stack= require(`../${cfnTemplateLocations.MlCoreStack}`)
  const t2 = addExportNames(neptune_ml_core_stack)
  saveTemplate(t2, `../${cfnTemplateLocations.MlCoreStack}`)
}
console.log('The CFN stacks all have exports, but most do not have an export name value. While they can be accessed by other CFN resources, they cannot be accessed by the CDK. So we will add the names to each export now.')
main()