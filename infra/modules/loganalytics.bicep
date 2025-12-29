// Log Analytics Workspace Module
// Provides audit logging for TOTP code retrievals

targetScope = 'resourceGroup'

@description('Name of the Log Analytics Workspace')
param workspaceName string

@description('Azure region for the workspace')
param location string

@description('Data retention period in days')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

@description('Resource tags')
param tags object = {}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: -1 // Unlimited
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

@description('The resource ID of the Log Analytics Workspace')
output workspaceId string = logAnalyticsWorkspace.id

@description('The workspace ID (GUID) for Data Collector API')
output workspaceCustomerId string = logAnalyticsWorkspace.properties.customerId

@description('The name of the Log Analytics Workspace')
output workspaceName string = logAnalyticsWorkspace.name
