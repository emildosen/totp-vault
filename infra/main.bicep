// Main Bicep orchestration file for totp-vault infrastructure
// Deploys: Log Analytics Workspace, Key Vault, Storage Account, Function App with role assignments

targetScope = 'resourceGroup'

// ============================================================================
// Parameters
// ============================================================================

@description('Prefix for all resource names')
@minLength(1)
@maxLength(10)
param resourcePrefix string = 'totp-vault'

@description('Log Analytics data retention in days')
@minValue(30)
@maxValue(730)
param logAnalyticsRetentionDays int = 30

@description('GitHub repository URL to fetch releases from')
param repoUrl string = 'https://github.com/emildosen/totp-vault'

@description('Set to false to skip code deployment (infrastructure only)')
param deployCode bool = true

// ============================================================================
// Variables
// ============================================================================

// Generate a unique suffix based on resource group ID (deterministic but unique per RG)
var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 6)

var tags = {
  project: 'totp-vault'
}

// Log Analytics only needs to be unique within the resource group
var logAnalyticsName = '${resourcePrefix}-log'
// Key Vault, Storage Account, and Function App names must be globally unique
var keyVaultName = '${resourcePrefix}-kv-${uniqueSuffix}'
// Storage account names: 3-24 chars, lowercase alphanumeric only
var storageAccountName = '${replace(resourcePrefix, '-', '')}st${uniqueSuffix}'
var functionAppName = '${resourcePrefix}-func-${uniqueSuffix}'

// Key Vault Secrets User role definition ID
// https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#key-vault-secrets-user
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// ============================================================================
// Modules
// ============================================================================

// Log Analytics Workspace for audit logging
module logAnalytics 'modules/loganalytics.bicep' = {
  name: 'logAnalyticsDeployment'
  params: {
    workspaceName: logAnalyticsName
    location: resourceGroup().location
    retentionInDays: logAnalyticsRetentionDays
    tags: tags
  }
}

// Key Vault for TOTP secret storage
module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    keyVaultName: keyVaultName
    location: resourceGroup().location
    tenantId: subscription().tenantId
    tags: tags
  }
}

// Storage Account (required for Azure Functions runtime)
module storageAccount 'modules/storageaccount.bicep' = {
  name: 'storageAccountDeployment'
  params: {
    storageAccountName: storageAccountName
    location: resourceGroup().location
    tags: tags
  }
}

// ============================================================================
// Key Vault Secrets
// ============================================================================

// Reference the Key Vault to create secrets
// Using variable name (known at compile time) instead of module output
resource keyVaultRef 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  dependsOn: [
    keyVault
  ]
}

// Reference the Log Analytics workspace to get its shared key
resource logAnalyticsRef 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsName
  dependsOn: [
    logAnalytics
  ]
}

// Store Log Analytics shared key in Key Vault
// This allows Function App to use Key Vault reference instead of exposing the key
resource logAnalyticsKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultRef
  name: 'log-analytics-shared-key'
  properties: {
    value: logAnalyticsRef.listKeys().primarySharedKey
    contentType: 'text/plain'
  }
}

// Function App with API and static file serving
module functionApp 'modules/functionapp.bicep' = {
  name: 'functionAppDeployment'
  params: {
    functionAppName: functionAppName
    location: resourceGroup().location
    storageAccountName: storageAccount.outputs.storageAccountName
    keyVaultName: keyVault.outputs.keyVaultName
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceCustomerId
    tags: tags
  }
  dependsOn: [
    logAnalyticsKeySecret // Ensure secret exists before Function App tries to reference it
  ]
}

// ============================================================================
// Role Assignments
// ============================================================================

// Grant Function App managed identity access to Key Vault secrets
// Scoped to the specific Key Vault, not the entire resource group
resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultName, functionAppName, keyVaultSecretsUserRoleId)
  scope: keyVaultRef
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Code Deployment
// ============================================================================

// Deploy code from latest GitHub release
module codeDeployment 'modules/deployment-script.bicep' = if (deployCode) {
  name: 'codeDeployment'
  params: {
    name: '${resourcePrefix}-deploy'
    location: resourceGroup().location
    functionAppName: functionApp.outputs.functionAppName
    repoUrl: repoUrl
    tags: tags
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('The default hostname of the Function App (for Entra ID app registration redirect URI)')
output functionAppHostname string = functionApp.outputs.defaultHostname

@description('The full URL of the Function App')
output functionAppUrl string = 'https://${functionApp.outputs.defaultHostname}'

@description('The principal ID of the Function App managed identity')
output functionAppIdentityPrincipalId string = functionApp.outputs.principalId

@description('The name of the Function App')
output functionAppName string = functionApp.outputs.functionAppName

@description('The name of the Key Vault')
output keyVaultName string = keyVault.outputs.keyVaultName

@description('The URI of the Key Vault')
output keyVaultUri string = keyVault.outputs.keyVaultUri

@description('The Log Analytics Workspace customer ID')
output logAnalyticsWorkspaceId string = logAnalytics.outputs.workspaceCustomerId
