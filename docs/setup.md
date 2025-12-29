# TOTP Vault Setup Guide

This guide covers the complete setup process for TOTP Vault.

## Quick Start (Deploy to Azure)

The fastest way to deploy is using the Deploy to Azure button in the README. This deploys all infrastructure and code in one step.

**Prerequisites:**
- Azure subscription with Contributor access
- An Entra ID security group for authorized users (create one first and note the Object ID)

After clicking Deploy to Azure:
1. Select your subscription and resource group
2. Enter a resource prefix (max 10 chars, e.g., `totpvault`)
3. Click **Review + create**

The deployment takes ~5 minutes. Code is automatically pulled from the latest GitHub release and deployed.

## Manual Deployment (CLI)

If you prefer CLI deployment:

```bash
# Create resource group
az group create --name rg-totp-vault --location australiaeast

# Deploy infrastructure + code
az deployment group create \
  --resource-group rg-totp-vault \
  --template-file infra/main.bicep \
  --parameters resourcePrefix=totpvault
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resourcePrefix` | Prefix for resource names (max 10 chars) | `totp-vault` |
| `logAnalyticsRetentionDays` | Log retention (30-730 days) | 30 |
| `repoUrl` | GitHub repo URL for releases | This repo |
| `deployCode` | Deploy code (false = infra only) | true |

## Post-Deployment: Entra ID Configuration

After deployment, configure authentication:

### 1. Get Your Function App Hostname

From deployment outputs or Azure Portal, note your Function App hostname:
```
https://<prefix>-func-<suffix>.azurewebsites.net
```

### 2. Create App Registration

1. Go to **Azure Portal** > **Microsoft Entra ID** > **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: `TOTP Vault`
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**:
     - Platform: `Web`
     - URI: `https://<your-function-app-hostname>/.auth/login/aad/callback`
4. Click **Register**

### 3. Configure Authentication

1. Go to **Authentication**
2. Under **Implicit grant and hybrid flows**, enable **ID tokens**
3. Click **Save**

### 4. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and expiry
4. Click **Add**
5. **Copy the secret value immediately**

### 5. Configure Token Claims (for group membership)

1. Go to **Token configuration**
2. Click **Add groups claim**
3. Select **Security groups**
4. Click **Add**

### 6. Configure Function App Authentication

1. Go to **Azure Portal** > **Function Apps** > your app
2. Go to **Settings** > **Authentication**
3. Click **Add identity provider**
4. Select **Microsoft**
5. Configure:
   - **App registration type**: Pick an existing app registration
   - **Application (client) ID**: Your app registration client ID
   - **Client secret**: Your client secret value
   - **Issuer URL**: `https://sts.windows.net/<your-tenant-id>/v2.0`
   - **Allowed token audiences**: `api://<your-client-id>`
6. Click **Add**

### 7. Set Function App Settings

```bash
az functionapp config appsettings set \
  --name <your-function-app-name> \
  --resource-group <your-rg> \
  --settings ALLOWED_GROUP_ID=<your-security-group-object-id>
```

## Optional: Conditional Access

For maximum security, create a Conditional Access policy:

1. Go to **Entra ID** > **Security** > **Conditional Access**
2. Create new policy:
   - **Users**: Your TOTP Vault Users security group
   - **Cloud apps**: Your TOTP Vault app registration
   - **Grant**: Require authentication strength (Phishing-resistant MFA)
   - **Session**: Sign-in frequency = Every time

## Adding TOTP Secrets

Add secrets to Key Vault using the naming convention `totp-{id}`:

```bash
# Full format with all options
az keyvault secret set \
  --vault-name <your-keyvault> \
  --name totp-29244496 \
  --value '{"secret":"JBSWY3DPEHPK3PXP","algorithm":"SHA1","digits":6,"period":30}'

# Minimal format (uses defaults: SHA1, 6 digits, 30 seconds)
az keyvault secret set \
  --vault-name <your-keyvault> \
  --name totp-29244496 \
  --value '{"secret":"JBSWY3DPEHPK3PXP"}'
```

## Usage

Share links with users:
```
https://<your-function-app-hostname>/code/<password-id>
```

Example: `https://totp-vault-func-abc123.azurewebsites.net/code/29244496`

## Troubleshooting

### "Access Denied" / 403 Error
- User is not in the allowed security group
- Verify `ALLOWED_GROUP_ID` in Function App settings matches your group's Object ID
- Ensure the app registration has groups claim configured

### "Secret Not Found" / 404 Error
- Secret doesn't exist in Key Vault
- Check secret name is `totp-{id}` (e.g., `totp-29244496`)
- Verify `KEYVAULT_NAME` app setting is correct

### Authentication Loop
- Redirect URI mismatch - must be exactly `https://<hostname>/.auth/login/aad/callback`
- Client ID or secret incorrect
- ID tokens not enabled in app registration

### Deployment Script Failed
- Check the deployment script logs in Azure Portal
- Ensure the GitHub repo has a release with `totp-vault.zip` artifact
- Verify the repo URL is accessible

## Architecture

```
User clicks link
       │
       ▼
┌─────────────────────────────────┐
│     Function App (Consumption)  │
│  ┌───────────────────────────┐  │
│  │  Static Files             │  │
│  │  - /code/{id} page        │  │
│  │  - Countdown timer        │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  API Function             │  │
│  │  - GET /api/totp/{id}     │  │
│  │  - Validates group claim  │  │
│  │  - Generates TOTP code    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│  Key Vault  │     │Log Analytics │
│  (Secrets)  │     │   (Audit)    │
└─────────────┘     └──────────────┘
```

## Security Checklist

- [ ] Security group created with only authorized users
- [ ] App registration is single-tenant
- [ ] Client secret has appropriate expiry (consider 6-12 months)
- [ ] Conditional Access enforces MFA (recommended)
- [ ] Key Vault firewall configured (optional)
- [ ] Audit logs reviewed periodically
