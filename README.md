<!-- /*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/ -->
Table of Contents
- [What is being created?](#what-is-being-created)
- [Modifications to the CFN templates](#modifications-to-the-cfn-templates)
  - [Modifications done in the setup script](#modifications-done-in-the-setup-script)
  - [Modifications in the CDK](#modifications-in-the-cdk)
    - [BaseStack](#basestack)
    - [NeptuneMlCoreStack](#neptunemlcorestack)
      - [parameters](#parameters)
      - [nested stack](#nested-stack)
      - [AWS IAM Role](#aws-iam-role)
- [Before your first deployment](#before-your-first-deployment)
- [Making Changes to the infrastructure](#making-changes-to-the-infrastructure)
- [How to run the Amazon Sagemaker Notebook code for detecting fake news](#how-to-run-the-amazon-sagemaker-notebook-code-for-detecting-fake-news)
- [Generic CDK readme](#generic-cdk-readme)
  - [Useful commands](#useful-commands)



# What is being created?
The AWS Cloud Development Kit (CDK) stacks in this repository modify and deploy the AWS CloudFormation templates for the neptune ML and export functionality. The original CloudFormation templates can be found in the following locations:
1. [The core stack](https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-base-stack.json)
2. [The Amazon Neptune ML stack](https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-ml-core-stack.json)
3. The [Nested Amazon Sagemaker Notebook stack](https://s3.amazonaws.com/aws-neptune-customer-samples/v2/cloudformation-templates/neptune-sagemaker-notebook-stack.json) inside of the Neptune ML stack

For more information on this template and the Neptune export service, see https://docs.aws.amazon.com/neptune/latest/userguide/export-service.html

# Modifications to the CFN templates
There are a few modifications that happen to the CloudFormation stacks:

## Modifications done in the setup script
The setup.sh script performs the following tasks for you:
1. It downloads the CloudFormation templates from the stacks locally. This is done so that you can interact with the template objects in CDK.
2. It adds the export names to the CloudFormation templates so that you can reference them elsewhere and between the two stacks. This is especially important since the NeptuneMlCoreStack uses the outputs from the NeptuneBase stack as parameters of the template.

## Modifications in the CDK
### BaseStack
The updates to the base stack are all related to the desired query timeout. If these changes are not made, the `%%neptune_ml export` command fails because of a timeout. So, we increase the timeout of the Neptune DB Cluster parameter group and the Neptune Instance parameter group. To do this we:
* First update the NeptuneQueryTimeout parameter in the CloudFormation template. This will update the value for the NeptuneDBParameterGroup.
* Then we update the query timeout for the NeptuneDBClusterParameterGroup, as it does not reference the template parameter
* finally, we associate the NeptuneDBClusterParameterGroup with the Neptune DB Cluster, as the NeptuneDB Cluster does not reference the NeptuneDBClusterParameterGroup in the original CloudFormation template.

We also modify the DB instance type by setting the parameter for the CloudFormation template. 

### NeptuneMlCoreStack
For the neptuneML Core stack, the following changes are made:
1. update the stack parameters
2. load the nested CloudFormation stack so that we can make the below update:
3. update the permissions for the AWS Identity and Access Management (IAM) role associated with the sagemaker notebook. 


#### parameters
First, we get the various imports from the base stack that we will need for the parameters of the neptune ML core stack cdk template. We pass those values in as parameters to the CloudFormation template. We update the notebook instance type as well. 
#### nested stack
Note that the AWS IAM role associated with the sagemaker notebook is defined in a nested stack. We can load the nested stack by specifying that as an input on the cfn include object we create (called parentTemplate).

Then, we can create a cfnInclude object for the child stack by referencing the name of the AWS::CloudFormation::stack resource in the parent cloudformation template. In this case it's NeptuneSagemakerNotebook. Check the neptune_ml_core_stack.json file to see how this is created in CloudFormation if desired. 

#### AWS IAM Role
The AWS IAM role used for the sagemaker notebook is missing two actions that are required for detect-fake-news notebooks:
1. `s3:createBucket` which is used to create a bucket for the default session for the notebook
2. `SageMaker:ListTrainingJobsForHyperParameterTuningJob` which is required to describe the hpo job

We get the IAM role from the child template, and then these are both added to the role policy. 

# Before your first deployment
You must run the following commands before your first deployment:
```
cd /path/to/neptune_ml/folder/
chmod +x ./setup.sh && ./setup.sh
```



# Making Changes to the infrastructure
Please reference the [Modifications in the CDK](#modifications-in-the-cdk) sections for examples of how to make updates to various resources in the CDK. Note that examples are given for parent stacks as well as nested stacks. 

# How to run the Amazon Sagemaker Notebook code for detecting fake news
The code for the notebooks is located [here](https://github.com/aws-samples/amazon-neptune-ml-fake-news-detection) and contains a few notebooks that you'll want to run in the Sagemaker notebook you've created as part of the SDK. 

1. In the AWS console, navigate to the Amazon Sagemaker Notebook Instance that was created using [these instructions](https://docs.aws.amazon.com/sagemaker/latest/dg/howitworks-access-ws.html)
2. on the notebook instances page, click open JupyterLab for the notebook created by the CDK (name: aws-neptune-notebook-for-neptunedbcluster-<uniqueID>)
2. In JupyterLab,open up a terminal
3. enter the following command: `cd Sagemaker && git clone https://github.com/aws-samples/amazon-neptune-ml-fake-news-detection.git`
3. On the left hand side, you should see a folder appear called amazon-neptune-ml-fake-news-detection. Note it may take a moment for it to appear.
3. open that folder and run the notebooks in the following order:
 1. create-graph-dataset
 3. load-graph-dataset
 3. detect-fake-news-neptune-ml
 4. inductive-inference

# Generic CDK readme

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm install`     installs the required packages
* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
