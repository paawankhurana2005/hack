#!/usr/bin/env bash
# Provision the ReLoop AWS data service: DynamoDB (provenance ledger) + S3
# (grading photos) + a Node 20 Lambda behind a public Function URL, plus
# (spec 025) the async return-grading pipeline: a second DynamoDB table for
# job status, an SQS queue + DLQ fed by an S3 event notification, and a second
# Lambda that consumes the queue and calls the Render API's grade/route/
# health-card endpoints.
# Idempotent — safe to re-run. Requires AWS CLI v2 + jq.
#
#   PROFILE=reloop REGION=ap-south-1 INTERNAL_API_SECRET=... RENDER_API_BASE=https://reloop-api-po73.onrender.com ./infra/provision.sh
#
# Prints the Function URL at the end → set it as NEXT_PUBLIC_DATA_API_URL on Vercel.

set -uo pipefail
PROFILE="${PROFILE:-reloop}"
REGION="${REGION:-ap-south-1}"
TABLE="${TABLE:-reloop-provenance}"
FUNC="${FUNC:-reloop-data}"
ROLE="${ROLE:-reloop-data-role}"
JOBS_TABLE="${JOBS_TABLE:-reloop-return-jobs}"
QUEUE="${QUEUE:-reloop-return-jobs}"
DLQ="${DLQ:-reloop-return-jobs-dlq}"
WORKER_FUNC="${WORKER_FUNC:-reloop-return-worker}"
WORKER_ROLE="${WORKER_ROLE:-reloop-return-worker-role}"
RENDER_API_BASE="${RENDER_API_BASE:-https://reloop-api-po73.onrender.com}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"
AWS="aws --profile $PROFILE --region $REGION"
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v jq >/dev/null || { echo "❌ jq is required (brew install jq)"; exit 1; }

ACCOUNT="$($AWS sts get-caller-identity --query Account --output text)" || { echo "❌ profile '$PROFILE' not authenticated"; exit 1; }
echo "▶ account=$ACCOUNT region=$REGION"

if [ -z "$INTERNAL_API_SECRET" ]; then
  echo "⚠ INTERNAL_API_SECRET is unset — the worker Lambda will call Render's"
  echo "  return-flow routes with no shared secret. Fine for a first deploy, but"
  echo "  set it (and the matching Render env var) before relying on this in prod."
fi

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

# ── DynamoDB: async return-job status table (spec 025) ─────────────────────
if $AWS dynamodb describe-table --table-name "$JOBS_TABLE" >/dev/null 2>&1; then
  echo "✓ DynamoDB table $JOBS_TABLE exists"
else
  echo "▶ creating DynamoDB table $JOBS_TABLE"
  $AWS dynamodb create-table --table-name "$JOBS_TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST >/dev/null
  $AWS dynamodb wait table-exists --table-name "$JOBS_TABLE"
  $AWS dynamodb update-time-to-live --table-name "$JOBS_TABLE" \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null
  echo "✓ table ready (TTL on 'ttl')"
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

# ── SQS: return-job intake queue + DLQ (spec 025) ───────────────────────────
if $AWS sqs get-queue-url --queue-name "$DLQ" >/dev/null 2>&1; then
  echo "✓ SQS DLQ $DLQ exists"
  DLQ_URL="$($AWS sqs get-queue-url --queue-name "$DLQ" --query QueueUrl --output text)"
else
  echo "▶ creating SQS DLQ $DLQ"
  DLQ_URL="$($AWS sqs create-queue --queue-name "$DLQ" \
    --attributes MessageRetentionPeriod=1209600 --query QueueUrl --output text)"
fi
DLQ_ARN="$($AWS sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)"

# Full JSON-object form (not the comma-separated shorthand) — RedrivePolicy's
# value is itself JSON containing commas, which the shorthand parser can't
# handle safely.
REDRIVE_ATTRS="$(jq -n --arg dlqArn "$DLQ_ARN" '{
  VisibilityTimeout: "300",
  MessageRetentionPeriod: "86400",
  RedrivePolicy: ({deadLetterTargetArn: $dlqArn, maxReceiveCount: "3"} | tostring)
}')"
if $AWS sqs get-queue-url --queue-name "$QUEUE" >/dev/null 2>&1; then
  echo "✓ SQS queue $QUEUE exists"
  QUEUE_URL="$($AWS sqs get-queue-url --queue-name "$QUEUE" --query QueueUrl --output text)"
  $AWS sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes "$REDRIVE_ATTRS" >/dev/null
else
  echo "▶ creating SQS queue $QUEUE"
  QUEUE_URL="$($AWS sqs create-queue --queue-name "$QUEUE" --attributes "$REDRIVE_ATTRS" --query QueueUrl --output text)"
fi
QUEUE_ARN="$($AWS sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)"

# Allow S3 (this bucket only) to SendMessage to the queue.
QUEUE_POLICY="$(jq -n --arg qarn "$QUEUE_ARN" --arg barn "arn:aws:s3:::$BUCKET" --arg acct "$ACCOUNT" '{
  Version: "2012-10-17",
  Statement: [{Sid: "AllowS3SendMessage", Effect: "Allow", Principal: {Service: "s3.amazonaws.com"},
    Action: "sqs:SendMessage", Resource: $qarn,
    Condition: {ArnEquals: {"aws:SourceArn": $barn}, StringEquals: {"aws:SourceAccount": $acct}}}]
}')"
QUEUE_ATTRS="$(jq -n --arg policy "$QUEUE_POLICY" '{Policy: $policy}')"
$AWS sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes "$QUEUE_ATTRS" >/dev/null
echo "✓ queue $QUEUE (dlq $DLQ)"

# ── S3 → SQS event notification (manifest.json only) ────────────────────────
# put-bucket-notification-configuration is a full REPLACE, not additive — read,
# merge in our queue config (replacing any prior entry for the same queue), write.
EXISTING_NOTIF="$($AWS s3api get-bucket-notification-configuration --bucket "$BUCKET" 2>/dev/null)"
[ -z "$EXISTING_NOTIF" ] && EXISTING_NOTIF='{}'
MERGED_NOTIF="$(echo "$EXISTING_NOTIF" | jq --arg qarn "$QUEUE_ARN" '
  .QueueConfigurations = ((.QueueConfigurations // []) | map(select(.QueueArn != $qarn))) + [{
    Id: "reloop-return-manifest",
    QueueArn: $qarn,
    Events: ["s3:ObjectCreated:*"],
    Filter: { Key: { FilterRules: [{Name: "prefix", Value: "returns/"}, {Name: "suffix", Value: "manifest.json"}] } }
  }]
')"
$AWS s3api put-bucket-notification-configuration --bucket "$BUCKET" \
  --notification-configuration "$MERGED_NOTIF" >/dev/null
echo "✓ bucket notification: returns/*manifest.json → $QUEUE"

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
    {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:PutItem\",\"dynamodb:GetItem\",\"dynamodb:UpdateItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$JOBS_TABLE\"},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"}
  ]
}" >/dev/null
ROLE_ARN="$($AWS iam get-role --role-name "$ROLE" --query Role.Arn --output text)"

# ── IAM role for the return-worker Lambda (spec 025) ────────────────────────
if $AWS iam get-role --role-name "$WORKER_ROLE" >/dev/null 2>&1; then
  echo "✓ IAM role $WORKER_ROLE exists"
else
  echo "▶ creating IAM role $WORKER_ROLE"
  $AWS iam create-role --role-name "$WORKER_ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }' >/dev/null
  $AWS iam attach-role-policy --role-name "$WORKER_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
  echo "  waiting for role to propagate…"; sleep 12
fi
$AWS iam put-role-policy --role-name "$WORKER_ROLE" --policy-name reloop-return-worker-access --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/returns/*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"sqs:ReceiveMessage\",\"sqs:DeleteMessage\",\"sqs:GetQueueAttributes\"],\"Resource\":\"$QUEUE_ARN\"},
    {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:UpdateItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$JOBS_TABLE\"}
  ]
}" >/dev/null
WORKER_ROLE_ARN="$($AWS iam get-role --role-name "$WORKER_ROLE" --query Role.Arn --output text)"

# ── Package + deploy the Lambda ────────────────────────────────────────────
echo "▶ packaging Lambda"
( cd "$HERE/lambda" && rm -f function.zip && zip -q function.zip index.mjs )
ZIP="fileb://$HERE/lambda/function.zip"
ENVVARS="Variables={TABLE_NAME=$TABLE,BUCKET_NAME=$BUCKET,JOBS_TABLE_NAME=$JOBS_TABLE}"

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

# ── Package + deploy the return-worker Lambda (spec 025) ───────────────────
echo "▶ packaging return-worker Lambda"
( cd "$HERE/lambda" && rm -f return-worker.zip && zip -q -j return-worker.zip return-worker.mjs )
WORKER_ZIP="fileb://$HERE/lambda/return-worker.zip"
WORKER_ENVVARS="Variables={JOBS_TABLE_NAME=$JOBS_TABLE,RENDER_API_BASE=$RENDER_API_BASE,INTERNAL_API_SECRET=$INTERNAL_API_SECRET}"

if $AWS lambda get-function --function-name "$WORKER_FUNC" >/dev/null 2>&1; then
  echo "▶ updating return-worker Lambda code + config"
  $AWS lambda update-function-code --function-name "$WORKER_FUNC" --zip-file "$WORKER_ZIP" >/dev/null
  $AWS lambda wait function-updated --function-name "$WORKER_FUNC"
  $AWS lambda update-function-configuration --function-name "$WORKER_FUNC" \
    --environment "$WORKER_ENVVARS" --timeout 150 --memory-size 512 >/dev/null
else
  echo "▶ creating return-worker Lambda $WORKER_FUNC"
  for i in 1 2 3 4 5; do
    if $AWS lambda create-function --function-name "$WORKER_FUNC" \
      --runtime nodejs20.x --handler return-worker.handler --role "$WORKER_ROLE_ARN" \
      --zip-file "$WORKER_ZIP" --timeout 150 --memory-size 512 \
      --environment "$WORKER_ENVVARS" >/dev/null 2>/tmp/worker_lambda_err; then
      break
    fi
    echo "  retry $i (role propagation)…"; sleep 8
  done
fi
$AWS lambda wait function-active-v2 --function-name "$WORKER_FUNC" 2>/dev/null || sleep 5
echo "✓ Lambda $WORKER_FUNC"

# ── SQS → return-worker Lambda event source mapping ─────────────────────────
EXISTING_MAPPING="$($AWS lambda list-event-source-mappings --function-name "$WORKER_FUNC" \
  --event-source-arn "$QUEUE_ARN" --query 'EventSourceMappings[0].UUID' --output text 2>/dev/null)"
if [ -n "$EXISTING_MAPPING" ] && [ "$EXISTING_MAPPING" != "None" ]; then
  echo "✓ event source mapping exists ($EXISTING_MAPPING)"
else
  echo "▶ creating SQS → Lambda event source mapping"
  $AWS lambda create-event-source-mapping --function-name "$WORKER_FUNC" \
    --event-source-arn "$QUEUE_ARN" --batch-size 1 >/dev/null
fi

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
echo " DynamoDB     : $TABLE, $JOBS_TABLE"
echo " S3           : $BUCKET"
echo " SQS          : $QUEUE (dlq $DLQ)"
echo " Lambda       : $FUNC, $WORKER_FUNC"
echo " Render API   : $RENDER_API_BASE"
echo " FUNCTION URL (set NEXT_PUBLIC_DATA_API_URL to this):"
echo "   $FURL"
echo "════════════════════════════════════════════════════════════════"
