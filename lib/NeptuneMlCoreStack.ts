/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cfninc from 'aws-cdk-lib/cloudformation-include';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as aws_sagemaker from 'aws-cdk-lib/aws-sagemaker'
import { cfnTemplateLocations } from '../interfaces/cfnTemplateLocations';
import { NagSuppressions } from 'cdk-nag'

interface NeptuneMlCoreStackProps extends cdk.StackProps {
  allowKMSEncryptDecrypt: iam.PolicyStatement,
  neptuneDbClusterId: string,
  neptuneDb: cdk.aws_neptune.CfnDBCluster
}

export class NeptuneMlCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: NeptuneMlCoreStackProps) {
    super(scope, id, props);
    // import the required outputs from previous stack
    const DBClusterEndpoint = cdk.Fn.importValue('DBClusterEndpoint')
    const DBClusterId = cdk.Fn.importValue('DBClusterId')
    const VPC = cdk.Fn.importValue('VPC')
    const PublicSubnet1 = cdk.Fn.importValue('PublicSubnet1')
    const PrivateSubnet1 = cdk.Fn.importValue('PrivateSubnet1')
    const PrivateSubnet2 = cdk.Fn.importValue('PrivateSubnet2')
    const NeptuneSecurityGroup = cdk.Fn.importValue('NeptuneSG')
    const NeptuneLoadFromS3RoleArn = cdk.Fn.importValue('NeptuneLoadFromS3IAMRoleArn')
    const NeptuneClusterResourceId = cdk.Fn.importValue('DBClusterResourceId')

    // pass those values and the notebook isntance type as parameters
    const params = {
      "NotebookInstanceType": "ml.c5.9xlarge", // This uses a large instance for the notebook because there are over 100K features per user, requiring a larger instance than default to process these.
      DBClusterEndpoint,
      DBClusterId,
      VPC,
      PublicSubnet1,
      PrivateSubnet1,
      PrivateSubnet2,
      NeptuneSecurityGroup,
      NeptuneLoadFromS3RoleArn,
      NeptuneClusterResourceId,
    }

    // specify file location of cloudFormation json. Do not change this value, as it is set from the setup.sh script
    const fileLocation = cfnTemplateLocations.MlCoreStack 

    // create the parent cloudformation stack via cdk. We do this using cfnInclude so that we can reference the template object later
    const parentTemplate = new cfninc.CfnInclude(this, 'Template', { 
      templateFile: fileLocation,
      parameters: params,
      // the loadNestedStacks is used so we can pass a template into the parentTemplate
      // we added the export names to the neptune_sagemaker_notebook_stack in the setup script. 
      loadNestedStacks: {
        "NeptuneSagemakerNotebook": {
          templateFile: cfnTemplateLocations.nestedNotebookStack 
        }
      }
    });

    // get the child stack from the parent template
    const includedChildStack = parentTemplate.getNestedStack('NeptuneSagemakerNotebook');
    const childStack: cdk.NestedStack = includedChildStack.stack;
    const childTemplate: cfninc.CfnInclude = includedChildStack.includedTemplate;
    
    // the execution role used for the sagemaker notebook is missing two actions that are required for the fake news notebooks:
    // 1) s3:createBucket which is used to create a bucket for the default session for the notebook
    // 2) SageMaker:ListTrainingJobsForHyperParameterTuningJob which is required to describe the hpo job

    // first we get the role as a cfn object
    const cfnRole = childTemplate.getResource('ExecutionRole') as iam.CfnRole;
    
    // then we get the role as an iam.Role object
    const ExecutionRole = iam.Role.fromRoleArn(this, 'ExecutionRole', cfnRole.attrArn) as iam.Role;

    const listHpoJobPolicy = new iam.PolicyStatement({
      actions: ['SageMaker:ListTrainingJobsForHyperParameterTuningJob'],
      resources: [`arn:${this.partition}:sagemaker:${this.region}:${this.account}:hyper-parameter-tuning-job/*`],
    })

    const createDefaultBucketPolicy: iam.PolicyStatement = new iam.PolicyStatement({
      // create s3 bucket
      actions: ['s3:createBucket'],
      resources: [`*`],
    })
    
    // finally, we add both actions to the policy.
    ExecutionRole.addToPolicy(listHpoJobPolicy)
    ExecutionRole.addToPolicy(createDefaultBucketPolicy)

    /*
    ****** CDK NAG CHANGES ********
    The below changes are all related to the output of CDK nag. Some may incur additional costs. 
    If you would like to disable them, make sure you understand how it will affect your security posture.
    */

    // ***** AwsSolutions-SM2: The SageMaker notebook instance does not have an encrypted storage volume *******
    // create cdk kms key
    const kmsKey = new cdk.aws_kms.Key(this, 'sagemaker-cmk', {
      enableKeyRotation: true,
    })
    const smNotebookCfn = childTemplate.getResource('NeptuneNotebookInstance') as aws_sagemaker.CfnNotebookInstance;

    const smNotebookRole = iam.Role.fromRoleArn(this, 'sagemakerRole', smNotebookCfn.roleArn)
    kmsKey.grantEncryptDecrypt(smNotebookRole)
    smNotebookCfn.kmsKeyId = kmsKey.keyArn;

    // ****** AwsSolutions-SM3: The SageMaker notebook instance has direct internet access enabled ******
    NagSuppressions.addResourceSuppressions(smNotebookCfn, [
      { id: "AwsSolutions-SM3", 
      reason: "This is required to enable the notebook instance to download the public dataset. Consider restricting after deploying or if moving to production to minimize security risk." }
    ])

    // ***** AwsSolutions-IAM5[Resource::*]: The IAM entity contains wildcard permissions and does not have a cdk-nag rule suppression with evidence for those permission. *****
    NagSuppressions.addResourceSuppressions(smNotebookRole, [
      { id: 'AwsSolutions-IAM5',
      reason: "We used the cdk permissions to give it encrypt / decrypt access to KMS." ,
      appliesTo: [
        'Action::kms:GenerateDataKey*',
        'Action::kms:ReEncrypt*'
      ]
    }
    ], true)

    NagSuppressions.addResourceSuppressions(ExecutionRole, [
      { id: 'AwsSolutions-IAM5',
      reason: "The *s for this role are required. Listing HPO jobs requires a * so that the notebook can read all of the jobs to list them. Creating an S3 bucket requires * because the sagemaker session creates the bucket so the name is not known before hand." ,
      appliesTo: [
        'Resource::*',
        'Resource::arn:<AWS::Partition>:sagemaker:<AWS::Region>:<AWS::AccountId>:hyper-parameter-tuning-job/*',
        // 'Action::kms:*'
      ]
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: "The execution role needs full neptune access" ,
      appliesTo: [
        'Action::neptune-db:*',
      ]
    }
    ], true)

    NagSuppressions.addResourceSuppressions(cfnRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: "The actions for this include create and delete models, and since the models haven't been defined it needs wildcard permissions." ,
        appliesTo: [
          'Resource::arn:<AWS::Partition>:sagemaker:<AWS::Region>:<AWS::AccountId>:*/*',
        ]
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: "The API defined as part of this stack is in a different nested stack with no output, so the original authors could not access it in the cfn nor can we via CDK." ,
        appliesTo: [
          'Resource::arn:<AWS::Partition>:execute-api:<AWS::Region>:<AWS::AccountId>:*/*',
        ]
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: "The buckets (including the default buckets) have not been created / defined yet so they cannot be passed into the policy" ,
        appliesTo: [
          'Resource::arn:<AWS::Partition>:s3:::*',
        ]
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: "This is required to perform the application operations" ,
        appliesTo: [
          'Action::s3:Get*',
          'Action::s3:List*',
          'Action::s3:Put*',
          'Action::neptune-db:*'
        ]
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: "Because the logs and metrics have not yet been defined / created, we need to use wildcards" ,
        appliesTo: [
          'Resource::arn:<AWS::Partition>:cloudwatch:<AWS::Region>:<AWS::AccountId>:*',
          'Resource::arn:<AWS::Partition>:logs:<AWS::Region>:<AWS::AccountId>:*',
        ]
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: "This is the required format for Neptune IAM data access policies (https://docs.aws.amazon.com/neptune/latest/userguide/iam-data-resources.html)" ,
        appliesTo: [
          'Resource::arn:<AWS::Partition>:neptune-db:<AWS::Region>:<AWS::AccountId>:<NeptuneClusterResourceId>/*',
        ]
      },
    ], true)
}
}