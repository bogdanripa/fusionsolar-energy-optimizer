# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | xargs)
else
  echo ".env file not found. Please create one with TESLA_CLIENT_ID and TESLA_CLIENT_SECRET."
  exit 1
fi

# Tesla OAuth 2.0 endpoints
AUTH_URL="https://auth.tesla.com/oauth2/v3/authorize"
TOKEN_URL="https://auth.tesla.com/oauth2/v3/token"
TESLA_REDIRECT_URI=http://localhost:53291/callback
SCOPE="openid vehicle_device_data offline_access vehicle_cmds vehicle_charging_cmds vehicle_location"

ENCODED_CLIENT_ID=$(printf "%s" "${TESLA_CLIENT_ID}" | jq -sRr @uri)
ENCODED_CLIENT_SECRET=$(printf "%s" "${TESLA_CLIENT_SECRET}" | jq -sRr @uri)
ENCODED_REDIRECT_URI=$(printf "%s" "${TESLA_REDIRECT_URI}" | jq -sRr @uri)
ENCODED_SCOPE=$(printf "%s" "${SCOPE}" | jq -sRr @uri)

# Construct the authorization URL
AUTH_REQUEST_URL="${AUTH_URL}?response_type=code&client_id=${ENCODED_CLIENT_ID}&redirect_uri=${ENCODED_REDIRECT_URI}&scope=${ENCODED_SCOPE}&state=${RANDOM}"

# Open the authorization URL in the default web browser
echo "Please open the following URL in your browser:"
echo "${AUTH_REQUEST_URL}"

# Start a simple HTTP server to listen for the redirect with the authorization code
echo "Starting local server at ${TESLA_REDIRECT_URI} to capture the authorization code..."
read -p  "Please complete the authorization in your browser and press Enter."

# Extract the port from the redirect URI
REDIRECT_PORT=$(echo "${TESLA_REDIRECT_URI}" | awk -F[:/] '{print $5}')

echo "Listening on port ${REDIRECT_PORT} for the authorization code..."

# Start a temporary server to catch the authorization code
CODE=$(nc -l "${REDIRECT_PORT}" | grep "GET /callback?code=" | sed -n 's/.*code=\([^&]*\).*/\1/p')

# Check if the authorization code was captured
if [ -z "${CODE}" ]; then
  echo "Failed to capture authorization code."
  exit 1
fi

echo "Authorization code received: ${CODE}"
# Exchange the authorization code for access and refresh tokens
RESPONSE=$(curl -s -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=${ENCODED_CLIENT_ID}" \
  -d "client_secret=${ENCODED_CLIENT_SECRET}" \
  -d "code=${CODE}" \
  -d "redirect_uri=${ENCODED_REDIRECT_URI}")

# Extract the refresh token from the response
REFRESH_TOKEN=$(echo "${RESPONSE}" | jq -r '.refresh_token')

# Check if the refresh token was obtained
if [ "${REFRESH_TOKEN}" == "null" ]; then
  echo "Failed to obtain refresh token. Response from server:"
  echo "${RESPONSE}"
  exit 1
fi

# Display the refresh token
echo "Your refresh token is: ${REFRESH_TOKEN}"