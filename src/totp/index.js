const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { TOTP } = require("otpauth");
const crypto = require("crypto");

// Cache the credential and secret client for connection reuse
let secretClient = null;

/**
 * Initialize the Key Vault secret client with managed identity
 */
function getSecretClient() {
  if (!secretClient) {
    const keyVaultName = process.env.KEYVAULT_NAME;
    if (!keyVaultName) {
      throw new Error("KEYVAULT_NAME environment variable is not configured");
    }
    const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(keyVaultUrl, credential);
  }
  return secretClient;
}

/**
 * Parse the client principal from the x-ms-client-principal header
 * This header is set by Azure Static Web Apps authentication
 */
function parseClientPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) {
    return null;
  }

  try {
    const buffer = Buffer.from(header, "base64");
    const principal = JSON.parse(buffer.toString("utf-8"));
    return principal;
  } catch (error) {
    return null;
  }
}

/**
 * Extract user details from the client principal
 */
function getUserDetails(principal) {
  if (!principal || !principal.claims) {
    return { upn: null, groups: [] };
  }

  const claims = principal.claims;

  // Get UPN (preferred_username or upn claim)
  const upnClaim = claims.find(
    (c) => c.typ === "preferred_username" ||
           c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn" ||
           c.typ === "upn"
  );
  const upn = upnClaim ? upnClaim.val : principal.userDetails || "unknown";

  // Get group memberships
  const groupClaims = claims.filter(
    (c) => c.typ === "groups" ||
           c.typ === "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
  );
  const groups = groupClaims.map((c) => c.val);

  return { upn, groups };
}

/**
 * Check if user is a member of the allowed security group
 */
function isUserAuthorized(groups, allowedGroupId) {
  if (!allowedGroupId) {
    throw new Error("ALLOWED_GROUP_ID environment variable is not configured");
  }
  return groups.includes(allowedGroupId);
}

/**
 * Send log entry to Log Analytics using the Data Collector API
 */
async function logToAnalytics(logEntry) {
  const workspaceId = process.env.LOG_ANALYTICS_WORKSPACE_ID;
  const sharedKey = process.env.LOG_ANALYTICS_SHARED_KEY;

  if (!workspaceId || !sharedKey) {
    // Log Analytics not configured, skip logging but don't fail
    return;
  }

  const logType = "TOTPVaultAudit";
  const body = JSON.stringify([logEntry]);
  const contentLength = Buffer.byteLength(body, "utf-8");
  const dateString = new Date().toUTCString();

  // Build the authorization signature
  const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${dateString}\n/api/logs`;
  const signature = crypto
    .createHmac("sha256", Buffer.from(sharedKey, "base64"))
    .update(stringToSign, "utf-8")
    .digest("base64");
  const authorization = `SharedKey ${workspaceId}:${signature}`;

  const url = `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Log-Type": logType,
        "x-ms-date": dateString,
        Authorization: authorization,
      },
      body: body,
    });

    if (!response.ok) {
      // Log Analytics API error - don't fail the request
    }
  } catch (error) {
    // Don't fail the request if logging fails
  }
}

/**
 * Generate TOTP code from secret configuration
 * Accepts either:
 * - Plain base32 string: "JBSWY3DPEHPK3PXP"
 * - JSON config: {"secret":"JBSWY3DPEHPK3PXP","algorithm":"SHA1","digits":6,"period":30}
 */
function generateTotpCode(secretConfig) {
  let config;

  if (typeof secretConfig === "string") {
    const trimmed = secretConfig.trim();
    // If it looks like JSON, parse it; otherwise treat as plain base32 secret
    if (trimmed.startsWith("{")) {
      config = JSON.parse(trimmed);
    } else {
      config = { secret: trimmed };
    }
  } else {
    config = secretConfig;
  }

  const secret = config.secret;
  if (!secret) {
    throw new Error("Secret configuration missing 'secret' field");
  }

  const algorithm = config.algorithm || "SHA1";
  const digits = config.digits || 6;
  const period = config.period || 30;

  // Create TOTP instance
  const totp = new TOTP({
    secret: secret,
    algorithm: algorithm,
    digits: digits,
    period: period,
  });

  // Generate the current code
  const code = totp.generate();

  // Calculate seconds remaining until next code
  const now = Math.floor(Date.now() / 1000);
  const remaining = period - (now % period);

  return { code, remaining };
}

/**
 * Validate that the ID is a numeric string (IT Glue password ID format)
 */
function isValidId(id) {
  return /^\d+$/.test(id);
}

/**
 * Main Azure Function handler
 */
module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const timestamp = new Date().toISOString();
  let userUpn = "unknown";
  let success = false;
  let errorMessage = null;

  try {
    // Validate input: id must be numeric string
    if (!id || !isValidId(id)) {
      errorMessage = "Invalid ID format";
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "Invalid ID format. ID must be a numeric string." },
      };
      return;
    }

    // Parse authentication header
    const clientPrincipal = parseClientPrincipal(req);
    if (!clientPrincipal) {
      errorMessage = "Not authenticated";
      context.res = {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: { error: "Authentication required" },
      };
      return;
    }

    // Extract user details
    const { upn, groups } = getUserDetails(clientPrincipal);
    userUpn = upn;

    // Check group membership
    const allowedGroupId = process.env.ALLOWED_GROUP_ID;
    if (!isUserAuthorized(groups, allowedGroupId)) {
      errorMessage = "Not authorized - not a member of allowed group";
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: "Access denied. You are not authorized to access this resource." },
      };
      return;
    }

    // Retrieve secret from Key Vault
    const client = getSecretClient();
    const secretName = `totp-${id}`;

    let secretValue;
    try {
      const secret = await client.getSecret(secretName);
      secretValue = secret.value;
    } catch (error) {
      if (error.code === "SecretNotFound" || error.statusCode === 404) {
        errorMessage = "Secret not found";
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "TOTP configuration not found for the specified ID" },
        };
        return;
      }
      throw error;
    }

    // Parse secret and generate TOTP code
    const { code, remaining } = generateTotpCode(secretValue);

    success = true;
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { code, remaining },
    };
  } catch (error) {
    context.log.error("Error processing TOTP request:", error.message, error.stack);
    errorMessage = error.message;
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "An internal error occurred while processing the request", details: error.message },
    };
  } finally {
    // Log the request to Log Analytics (fire and forget)
    logToAnalytics({
      Timestamp: timestamp,
      UserPrincipalName: userUpn,
      SecretId: id || "invalid",
      Success: success,
      ErrorMessage: errorMessage,
      ClientIP: req.headers["x-forwarded-for"] || req.headers["x-client-ip"] || "unknown",
    }).catch((err) => console.error("Failed to log audit entry:", err));
  }
};
