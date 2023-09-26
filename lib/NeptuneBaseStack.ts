/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
*/

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cfninc from 'aws-cdk-lib/cloudformation-include';
import * as aws_neptune from 'aws-cdk-lib/aws-neptune';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { cfnTemplateLocations } from '../interfaces/cfnTemplateLocations';
import { NagSuppressions } from 'cdk-nag'

export class NeptuneBaseStack extends cdk.Stack {
  public readonly vpcId: string;
  public readonly neptuneKmsKey: string;
  public readonly allowKMSEncryptDecrypt: iam.PolicyStatement;
  public readonly neptuneDbClusterId: string;
  public readonly neptuneDb: aws_neptune.CfnDBCluster;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // specify file location of cloudFormation json. Do not change this value, as it is set from the setup.sh script
    const fileLocation = cfnTemplateLocations.BaseStack

    // now we set the desired query timeout. Note that if you set this too low or use the default value, the export will likely fail. 
    // you likely only need 720000 for this, but this is overly cautious. 
    const desiredQueryTimeout = 2400000;
    let iamAuthEnabledParameter = "false"
    
    // create the cloudformation stack via cdk. We do this using cfnInclude so that we can reference the template object later
    const template = new cfninc.CfnInclude(this, 'Template', { 
      templateFile: fileLocation,
      parameters: {
        "DbInstanceType": "db.r5.large",
        "NeptuneQueryTimeout": desiredQueryTimeout,
        "IamAuthEnabled": iamAuthEnabledParameter, // do not set manually. Instead, change iamAuthEnabledParameter
      },
    });

    // now that we have defined the template, we can access the resources and modify them
    // first, we need to update the parameter group. Note that in the template, the NeptuneDBClusterParameterGroup does not have the query timeout. 
    const NeptuneDBClusterParameterGroup = template.getResource('NeptuneDBClusterParameterGroup') as aws_neptune.CfnDBClusterParameterGroup;
    NeptuneDBClusterParameterGroup.parameters = {
      ...NeptuneDBClusterParameterGroup.parameters,
      "neptune_query_timeout": desiredQueryTimeout
    }

    // additionally, when the NeptuneDBClusterParameterGroup was created, it is not associated with the NeptuneDBCluster.
    const neptuneDb = template.getResource('NeptuneDBCluster') as aws_neptune.CfnDBCluster;
    neptuneDb.dbInstanceParameterGroupName = NeptuneDBClusterParameterGroup.ref;
    this.neptuneDbClusterId = neptuneDb.attrClusterResourceId
    this.neptuneDb = neptuneDb

    /*
    ****** CDK NAG CHANGES ********
    The below changes are all related to the output of CDK nag. Some may incur additional costs. 
    If you would like to disable them, make sure you understand how it will affect your security posture.
    */


    // **** AwsSolutions-VPC7: VPC Flow logs **** 
    const cfnVpc = template.getResource('VPC') as ec2.CfnVPC;
    const vpc = ec2.Vpc.fromVpcAttributes(this, "VPC", {
      vpcId: cfnVpc.attrVpcId,
      // because the template gets all AZs for each subnet in the VPC, we can do the same here. 
      availabilityZones: cdk.Fn.getAzs()
    });

    const logGroup = new logs.LogGroup(this, 'NeptuneVpcLogGroup');
    const role = new iam.Role(this, 'NeptuneFlowLogsRole', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com')
    });
    
    new ec2.FlowLog(this, 'FlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup, role)
    });
    
    // ****  AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access **** 
    NagSuppressions.addStackSuppressions(this, [
      { id: "AwsSolutions-EC23", 
      reason: "This is required to get the solution to work and is an existing part of the existing CFN template." }
    ])
    
    // **** AwsSolutions-IAM5: overly permissive IAM role / policy (1/ NeptuneAccessPolicy, 2/ NeptuneIAMAuthPolicy, 3/ NeptuneLoadFromS3Policy) ****  
    // ***** 1/ NeptuneAccessPolicy:
    const neptuneAccessPolicy = template.getResource('NeptuneAccessPolicy') as iam.CfnPolicy;
    NagSuppressions.addResourceSuppressions(neptuneAccessPolicy, [
      { id: "AwsSolutions-IAM5", 
      reason: "This is taken from AWS documentation: https://docs.aws.amazon.com/neptune/latest/userguide/bulk-load-tutorial-IAM-add-role-cluster.html" }
    ])

    // ***** 2/ NeptuneIAMAuthPolicy
    // used by: NeptuneIamAuthUser (IAM User for IAM Auth) and NeptuneClientRole (used by ec2, not relevant for this)
    // since by default, this template does not use IAM auth AND it does not use EC2, we can restrict the policy.
    // first, check if iam auth is enabled. if so, suppress the output
    // otherwise, reduce the access of the policy to only allow reading
    const neptuneIamAuthPolicyCfn = template.getResource('NeptuneIAMAuthPolicy') as iam.CfnPolicy;
    
    // if iam auth is enabled, then restrict the policy to only allow reading. 
    // note: if you set iam auth enabled to true, you will need to modify the permissions or add a new suppression to explain why you are not limiting the permissions. 
    if (iamAuthEnabledParameter === "true") {
      // in the future, you can update the actions  / resources to limit what can be accessed. 
      // neptuneIamAuthPolicyCfn.policyDocument.Statement[0].Action = ["yourAction(s)Here"];
      // neptuneIamAuthPolicyCfn.policyDocument.Statement[0].Resource = ["yourResource(s)Here"];

      // if you want to allow all actions for all DBs, comment the above lines and uncomment the below:
      // NagSuppressions.addResourceSuppressions(neptuneIamAuthPolicyCfn, [
      //   { id: "AwsSolutions-IAM5", 
      //   reason: "Because we are using IAM auth, we want to allow access to all resources for all actions" }
      // ])
    }

    if (iamAuthEnabledParameter === "false") {
      neptuneIamAuthPolicyCfn.policyDocument.Statement[0].Effect = "Deny"
      // neptuneIamAuthPolicyCfn.policyDocument.Statement[0].Action = [""];
      // neptuneIamAuthPolicyCfn.policyDocument.Statement[0].Resource = [""];

    }

    // ***** 3/ NeptuneLoadFromS3Policy
    const neptuneLoadFromS3PolicyCfn = template.getResource('NeptuneLoadFromS3Policy') as iam.CfnPolicy;
    NagSuppressions.addResourceSuppressions(neptuneLoadFromS3PolicyCfn, [
      { id: "AwsSolutions-IAM5", 
      reason: "This is taken from AWS documentation: https://docs.aws.amazon.com/neptune/latest/userguide/bulk-load-tutorial-IAM-CreateRole.html" }
    ])

     // **** AwsSolutions-N3: The Neptune DB cluster does not have a reasonable minimum backup retention period configured. ***** 
     // The retention period represents the number of days to retain automated snapshots. A minimum retention period of 7 days is recommended but can be adjust to meet system requirements. ****  
     neptuneDb.backupRetentionPeriod = 7;

     // ***** AwsSolutions-N4: The Neptune DB cluster does not have encryption at rest enabled. *****
    neptuneDb.kmsKeyId = "alias/aws/rds"
    const allowKMSEncryptDecrypt = new iam.PolicyStatement()
    allowKMSEncryptDecrypt.effect = iam.Effect.ALLOW
    allowKMSEncryptDecrypt.addActions("kms:*")
    allowKMSEncryptDecrypt.addResources("*")
    this.allowKMSEncryptDecrypt = allowKMSEncryptDecrypt
    

    // we also need to give encrypt decrypt access to the NeptuneLoadFromS3Role 
    const neptuneLoadFromS3RoleCfn = template.getResource("NeptuneLoadFromS3Role") as iam.CfnRole
    const neptuneLoadFromS3Role = iam.Role.fromRoleArn(this, "NeptuneLoadFromS3Role", neptuneLoadFromS3RoleCfn.attrArn)
    // neptuneLoadFromS3Role.addToPrincipalPolicy(allowKMSEncryptDecrypt)

    // and because we allow it to encrypt decrypt we need to suppress for now
    NagSuppressions.addResourceSuppressions(neptuneLoadFromS3Role, [{
      id: 'AwsSolutions-IAM5',
      reason: "The *s for this role are required. Listing HPO jobs requires a * so that the notebook can read all of the jobs to list them. Creating an S3 bucket requires * because the sagemaker session creates the bucket so the name is not known before hand." ,
      appliesTo: [
        'Resource::*',
        'Action::kms:*'
      ]}
    ]
    , true)


    // ***** AwsSolutions-N5: The Neptune DB cluster does not have IAM Database Authentication enabled. *****
    NagSuppressions.addResourceSuppressions(neptuneDb, [
      { id: "AwsSolutions-N5", 
      reason: "We could not get the solution to work with IAM auth. If deploying to production, please make sure to update to use IAM auth so that the system doesn't have to use a password when connecting to the cluster." }
    ])

    // ***** AwsSolutions-N2: The Neptune DB instance does not have Auto Minor Version Upgrade enabled. *****
    const neptuneDBInstance = template.getResource('NeptuneDBInstance') as aws_neptune.CfnDBInstance;
    neptuneDBInstance.autoMinorVersionUpgrade = true;
    const neptuneDBReplicaInstance = template.getResource('NeptuneDBReplicaInstance') as aws_neptune.CfnDBInstance;
    neptuneDBReplicaInstance.autoMinorVersionUpgrade = true;
  }
}
