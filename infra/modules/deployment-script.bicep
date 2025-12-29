// Deployment Script Module
// Downloads release ZIP from GitHub and deploys to Function App

targetScope = 'resourceGroup'

@description('Name for the deployment script resource')
param name string

@description('Azure region')
param location string

@description('Function App name to deploy to')
param functionAppName string

@description('GitHub repository URL (e.g., https://github.com/owner/repo)')
param repoUrl string = 'https://github.com/emildosen/totp-vault'

@description('Resource tags')
param tags object = {}

@description('Force update tag to ensure script runs on each deployment')
param forceUpdateTag string = utcNow()

// User-assigned managed identity for the deployment script
resource scriptIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
  tags: tags
}

// Get reference to existing Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: functionAppName
}

// Contributor role on the Function App for the script identity
resource functionAppContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, scriptIdentity.id, 'contributor')
  scope: functionApp
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c') // Contributor
    principalId: scriptIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Deployment script that downloads and deploys the code
resource deploymentScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: name
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${scriptIdentity.id}': {}
    }
  }
  properties: {
    azCliVersion: '2.59.0'
    forceUpdateTag: forceUpdateTag
    timeout: 'PT30M'
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      {
        name: 'FUNCTION_APP_NAME'
        value: functionAppName
      }
      {
        name: 'REPO_URL'
        value: repoUrl
      }
      {
        name: 'RESOURCE_GROUP'
        value: resourceGroup().name
      }
    ]
    scriptContent: '''
      set -e

      echo "=== TOTP Vault Code Deployment ==="
      echo "Repository: $REPO_URL"
      echo "Function App: $FUNCTION_APP_NAME"

      # Download latest release ZIP from GitHub
      echo "Downloading latest release..."
      RELEASE_URL="${REPO_URL}/releases/latest/download/totp-vault.zip"

      # Use curl to download (follows redirects)
      curl -L -o totp-vault.zip "$RELEASE_URL"

      # Verify download
      ls -la totp-vault.zip

      # Deploy to Function App using ZIP deploy
      echo "Deploying to Function App..."
      az functionapp deployment source config-zip \
        --resource-group "$RESOURCE_GROUP" \
        --name "$FUNCTION_APP_NAME" \
        --src "totp-vault.zip"

      echo "=== Deployment Complete ==="
    '''
  }
  dependsOn: [
    functionAppContributorRole
  ]
}

@description('Deployment script status')
output status string = deploymentScript.properties.provisioningState
