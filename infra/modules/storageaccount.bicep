// Storage Account Module
// Required for Azure Functions runtime (Consumption Plan)

targetScope = 'resourceGroup'

@description('Name of the Storage Account (3-24 chars, lowercase alphanumeric only)')
@minLength(3)
@maxLength(24)
param storageAccountName string

@description('Azure region for the Storage Account')
param location string

@description('Resource tags')
param tags object = {}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

@description('The resource ID of the Storage Account')
output storageAccountId string = storageAccount.id

@description('The name of the Storage Account')
output storageAccountName string = storageAccount.name
