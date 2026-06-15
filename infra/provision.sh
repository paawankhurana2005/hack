#!/usr/bin/env bash
# Provision the ReLoop AWS data service: DynamoDB (provenance ledger) + S3
# (grading photos) + a Node 20 Lambda behind a public Function URL.
# Idempotent — safe to re-run. Requires AWS CLI v2.
#
#   PROFILE=reloop REGION=ap-south-1 ./infra/provision.sh
#
# Prints the Function URL at the end → set it as NEXT_PUBLIC_DATA_API_URL on Vercel.

set -uo pipefail
PROFILE="${PROFILE:-reloop}"
REGION="${REGION:-ap-south-1}"
TABLE="${TABLE:-reloop-provenance}"
FUNC="${FUNC:-reloop-data}"
ROLE="${ROLE:-reloop-data-role}"
AWS="aws --profile $PROFILE --region $REGION"
HERE="$(cd "$(dirname "$0")" && pwd)"

ACCOUNT="$($AWS sts get-caller-identity --query Account --output text)" || { echo "❌ profile '$PROFILE' not authenticated"; exit 1; }
echo "▶ account=$ACCOUNT region=$REGION"

BUCKET="${BUCKET:-reloop-media-paawan}"

# ── DynamoDB ───────────────────────────────────────────────────────────────
if $AWS dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  echo "✓ DynamoDB table $TABLE exists"
else
  echo "▶ creating DynamoDB table $TABLE"
  $AWS dynamodb create-table --table-name "$TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
  $AWS dynamodb wait table-exists --table-name "$TABLE"
  echo "✓ table ready"
fi

# ── S3 bucket (+ public read + CORS) ───────────────────────────────────────
if ! $AWS s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "▶ creating S3 bucket $BUCKET"
  if ! $AWS s3api create-bucket --bucket "$BUCKET" \
        --create-bucket-configuration LocationConstraint="$REGION" >/dev/null 2>&1; then
    BUCKET="reloop-media-$ACCOUNT"
    echo "  (name taken — using $BUCKET)"
    $AWS s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
fi
echo "✓ bucket $BUCKET"
$AWS s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false >/dev/null 2>&1 || true
$AWS s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"PublicRead\",\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/*\"}]
}" >/dev/null 2>&1 || true
$AWS s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT"],"AllowedHeaders":["*"],"MaxAgeSeconds":3000}]
}' >/dev/null 2>&1 || true

# ── IAM role for the Lambda ────────────────────────────────────────────────
if $AWS iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "✓ IAM role $ROLE exists"
else
  echo "▶ creating IAM role $ROLE"
  $AWS iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }' >/dev/null
  $AWS iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
  echo "  waiting for role to propagate…"; sleep 12
fi
$AWS iam put-role-policy --role-name "$ROLE" --policy-name reloop-data-access --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:Query\",\"dynamodb:GetItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$TABLE\"},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"}
  ]
}" >/dev/null
ROLE_ARN="$($AWS iam get-role --role-name "$ROLE" --query Role.Arn --output text)"

# ── Package + deploy the Lambda ────────────────────────────────────────────
echo "▶ packaging Lambda"
( cd "$HERE/lambda" && rm -f function.zip && zip -q function.zip index.mjs )
ZIP="fileb://$HERE/lambda/function.zip"
ENVVARS="Variables={TABLE_NAME=$TABLE,BUCKET_NAME=$BUCKET}"

if $AWS lambda get-function --function-name "$FUNC" >/dev/null 2>&1; then
  echo "▶ updating Lambda code + config"
  $AWS lambda update-function-code --function-name "$FUNC" --zip-file "$ZIP" >/dev/null
  $AWS lambda wait function-updated --function-name "$FUNC"
  $AWS lambda update-function-configuration --function-name "$FUNC" \
    --environment "$ENVVARS" --timeout 15 >/dev/null
else
  echo "▶ creating Lambda $FUNC"
  for i in 1 2 3 4 5; do
    if $AWS lambda create-function --function-name "$FUNC" \
      --runtime nodejs20.x --handler index.handler --role "$ROLE_ARN" \
      --zip-file "$ZIP" --timeout 15 --environment "$ENVVARS" >/dev/null 2>/tmp/lambda_err; then
      break
    fi
    echo "  retry $i (role propagation)…"; sleep 8
  done
fi
$AWS lambda wait function-active-v2 --function-name "$FUNC" 2>/dev/null || sleep 5

# ── Public Function URL (+ CORS) ───────────────────────────────────────────
$AWS lambda add-permission --function-name "$FUNC" --statement-id FunctionURLPublic \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null 2>&1 || true
if ! FURL="$($AWS lambda get-function-url-config --function-name "$FUNC" --query FunctionUrl --output text 2>/dev/null)"; then :; fi
if [ -z "${FURL:-}" ] || [ "$FURL" = "None" ]; then
  FURL="$($AWS lambda create-function-url-config --function-name "$FUNC" --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["content-type"]}' \
    --query FunctionUrl --output text)"
else
  $AWS lambda update-function-url-config --function-name "$FUNC" --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["content-type"]}' >/dev/null 2>&1 || true
fi
FURL="${FURL%/}"

# ── Seed the staged provenance chain (Adidas Ultraboost, 2 lives) ──────────
echo "▶ seeding staged chain into DynamoDB"
sleep 3
node "$HERE/seed.mjs" "$FURL" || echo "  (seed skipped — the app will dual-write it on first use)"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ DONE"
echo " DynamoDB : $TABLE"
echo " S3       : $BUCKET"
echo " Lambda   : $FUNC"
echo " FUNCTION URL (set NEXT_PUBLIC_DATA_API_URL to this):"
echo "   $FURL"
echo "════════════════════════════════════════════════════════════════"
