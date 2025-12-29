// Function App Module
// Hosts the TOTP vault API and serves static frontend files

targetScope = 'resourceGroup'

@description('Name of the Function App')
param functionAppName string

@description('Azure region for the Function App')
param location string

@description('Resource tags')
param tags object = {}

@description('Storage Account name')
param storageAccountName string

@description('Key Vault name for app settings')
param keyVaultName string

@description('Log Analytics Workspace ID (customer ID/GUID)')
param logAnalyticsWorkspaceId string

@description('URL to the deployment package ZIP')
param packageUrl string

@description('Application Insights connection string')
param appInsightsConnectionString string

// Reference existing Storage Account to construct connection string internally
// This avoids exposing the connection string in deployment outputs
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'

// App Service Plan (Consumption/Dynamic)
resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionAppName}-plan'
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: false // Windows
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      netFrameworkVersion: 'v8.0'
      use32BitWorkerProcess: false
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'KEYVAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'LOG_ANALYTICS_WORKSPACE_ID'
          value: logAnalyticsWorkspaceId
        }
        {
          name: 'LOG_ANALYTICS_SHARED_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=log-analytics-shared-key)'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: packageUrl
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
      ]
    }
  }
}

@description('The default hostname of the Function App')
output defaultHostname string = functionApp.properties.defaultHostName

@description('The resource ID of the Function App')
output functionAppId string = functionApp.id

@description('The name of the Function App')
output functionAppName string = functionApp.name

@description('The principal ID of the system-assigned managed identity')
output principalId string = functionApp.identity.principalId

@description('The tenant ID of the system-assigned managed identity')
output tenantId string = functionApp.identity.tenantId
