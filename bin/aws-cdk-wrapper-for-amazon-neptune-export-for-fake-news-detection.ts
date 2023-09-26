#!/usr/bin/env node
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NeptuneBaseStack } from '../lib/NeptuneBaseStack';
import { NeptuneMlCoreStack } from '../lib/NeptuneMlCoreStack';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag'

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
const baseStack = new NeptuneBaseStack(app, 'NeptuneBaseStack', {
  // env: { region: 'eu-west-3' }
});
const mlCoreStack = new NeptuneMlCoreStack(app, 'NeptuneCoreStack', {
  allowKMSEncryptDecrypt: baseStack.allowKMSEncryptDecrypt,
  neptuneDbClusterId: baseStack.neptuneDbClusterId,
  neptuneDb: baseStack.neptuneDb
})

mlCoreStack.addDependency(baseStack)