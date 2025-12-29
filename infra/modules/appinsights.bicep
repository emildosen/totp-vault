// Application Insights Module
// Linked to Log Analytics Workspace for unified monitoring

targetScope = 'resourceGroup'

@description('Name of the Application Insights resource')
param appInsightsName string

@description('Azure region')
param location string

@description('Log Analytics Workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Resource tags')
param tags object = {}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspaceId
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

@description('The connection string for Application Insights')
output connectionString string = appInsights.properties.ConnectionString

@description('The instrumentation key for Application Insights')
output instrumentationKey string = appInsights.properties.InstrumentationKey
