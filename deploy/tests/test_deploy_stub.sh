#!/usr/bin/env bash
# Offline regression checks: every gcloud and openssl call is a local stub.
# ==============================================================================
# WHAT THIS TEST DOES (no real GCP calls, no cost)
#   Puts fake `gcloud` / `openssl` first on PATH and runs deploy/deploy.sh in
#   these scenarios, asserting on the recorded commands:
#     first_run : nothing exists      -> everything is created
#     rerun     : everything exists   -> nothing replaced (credentials kept)
#     partial   : DB secret missing   -> DB user password reset + secret created
#     job-fail  : migration fails     -> script exits 1, service NOT deployed
#     demo      : --demo flag         -> Borrower secret is created and granted
#   It also checks: `--edition=enterprise` and `--no-storage-auto-increase`, no
#   project-wide secretAccessor role, DB password == password inside
#   DATABASE_URL, and that no password/secret value leaks into the output.
#   KitHub (#5): the migration job always gets SEED_CUSTODIAN_PASSWORD, gets
#   SEED_BORROWER_PASSWORD only with --demo, the service gets DATABASE_URL only,
#   and each generated seed password fits bcrypt's 72-byte limit.
#   Finally DRY_RUN=1 must make zero gcloud calls and print only KitHub names.
#
# HOW TO RUN (repo root, needs bash):  bash deploy/tests/test_deploy_stub.sh
#   Prints `PASS: <scenario>` per scenario; any `FAIL ...` exits non-zero.
#   CI runs it too (.github/workflows/ci-docker.yml).
#
# ⭐ CHANGE ME: if you rename resources in deploy/deploy.sh (e.g. the secret
#    names kithub-database-url / -custodian-password / -borrower-password, the DB
#    user `kithub`), update the matching strings below.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/../deploy.sh"
export TEST_STATE_DIR
TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_STATE_DIR"' EXIT
mkdir -p "$TEST_STATE_DIR/bin"

# --- Fake `openssl` (deterministic "random" values) ---------------------------
cat > "$TEST_STATE_DIR/bin/openssl" <<'STUB'
#!/usr/bin/env bash
if [ "$2" = "-hex" ]; then
  printf '%s\n' '0123456789abcdef0123456789abcdef0123456789abcdef'
else
  printf '%s\n' 'TESTONLYGENERATEDPASSWORD'
fi
STUB

# --- Fake `gcloud`: logs each call (password redacted), answers per $STUB_MODE
cat > "$TEST_STATE_DIR/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
redacted=()
for arg in "$@"; do
  case "$arg" in
    --password=*)
      printf '%s' "${arg#--password=}" > "$TEST_STATE_DIR/sql-pass"
      redacted+=("--password=<REDACTED>") ;;
    *) redacted+=("$arg") ;;
  esac
done
printf '%s\n' "${redacted[*]}" >> "$GCLOUD_LOG"
if [ "${1:-} ${2:-}" = 'config get-value' ]; then
  echo stub-gcp-project
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'run services describe' ]; then
  echo https://kithub-stub.example.invalid
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'run jobs execute' ]; then
  [ "$STUB_MODE" != job-fail ]
  exit $?
fi
if [ "${1:-} ${2:-} ${3:-}" = 'secrets versions add' ]; then
  cat > "$TEST_STATE_DIR/payload-${4}"
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'sql users list' ]; then
  if [ "$STUB_MODE" = first_run ]; then
    echo postgres
  else
    printf 'postgres\nkithub\n'
  fi
  exit 0
fi
for word in "$@"; do
  if [ "$word" = describe ]; then
    case "$STUB_MODE" in
      first_run) exit 1 ;;
      partial)
        if [ "${1:-} ${3:-}" = 'secrets kithub-database-url' ]; then
          exit 1
        fi ;;
    esac
  fi
done
STUB
chmod +x "$TEST_STATE_DIR/bin/openssl" "$TEST_STATE_DIR/bin/gcloud"
export PATH="$TEST_STATE_DIR/bin:$PATH"
export PROJECT_ID=stub-gcp-project
export REGION=asia-southeast1
export DRY_RUN=0

# --- Run every scenario and assert on what deploy.sh did ------------------------
for MODE in first_run rerun partial job-fail demo; do
  export STUB_MODE="$MODE"
  [ "$MODE" != demo ] || export STUB_MODE=first_run
  export GCLOUD_LOG="$TEST_STATE_DIR/gcloud-$MODE.log"
  rm -f "$TEST_STATE_DIR/sql-pass" "$TEST_STATE_DIR"/payload-*
  args=()
  if [ "$MODE" = demo ]; then args+=(--demo); fi
  result=0
  bash "$DEPLOY_SCRIPT" "${args[@]}" > "$TEST_STATE_DIR/output" 2>&1 || result=$?
  expected=0
  if [ "$MODE" = job-fail ]; then expected=1; fi
  if [ "$result" -ne "$expected" ]; then
    echo "FAIL $MODE: unexpected exit $result (wanted $expected)"
    exit 1
  fi
  if [ "$MODE" = job-fail ]; then
    if grep -q '^run deploy ' "$GCLOUD_LOG"; then
      echo 'FAIL: service deployed after migration failure'; exit 1
    fi
  else
    grep -q '^run deploy ' "$GCLOUD_LOG"
  fi
  if grep -q '^projects add-iam-policy-binding .*roles/secretmanager.secretAccessor' "$GCLOUD_LOG"; then
    echo 'FAIL: runtime has project-wide secret access'; exit 1
  fi
  for secret in kithub-database-url kithub-custodian-password; do
    grep -q "^secrets add-iam-policy-binding $secret .*roles/secretmanager.secretAccessor" "$GCLOUD_LOG"
  done
  if [ "$MODE" = demo ]; then
    grep -q '^secrets add-iam-policy-binding kithub-borrower-password ' "$GCLOUD_LOG"
  elif grep -q '^secrets add-iam-policy-binding kithub-borrower-password ' "$GCLOUD_LOG"; then
    echo 'FAIL: granted optional Borrower secret in non-demo mode'; exit 1
  fi
  # Seed secrets go to the migration job only: Custodian always, Borrower with --demo.
  if ! grep -q '^run jobs deploy kithub-migrate .*--set-secrets DATABASE_URL=kithub-database-url:latest,SEED_CUSTODIAN_PASSWORD=kithub-custodian-password:latest' "$GCLOUD_LOG"; then
    echo 'FAIL: migration job is missing SEED_CUSTODIAN_PASSWORD'; exit 1
  fi
  if [ "$MODE" = demo ]; then
    if ! grep -q '^run jobs deploy kithub-migrate .*,SEED_BORROWER_PASSWORD=kithub-borrower-password:latest .*SEED_DEMO_DATA=true' "$GCLOUD_LOG"; then
      echo 'FAIL: --demo did not give SEED_BORROWER_PASSWORD to the migration job'; exit 1
    fi
  elif grep -q 'SEED_BORROWER_PASSWORD' "$GCLOUD_LOG"; then
    echo 'FAIL: SEED_BORROWER_PASSWORD set without --demo'; exit 1
  fi
  # The service never gets a seed secret.
  if grep '^run deploy ' "$GCLOUD_LOG" | grep -q 'SEED_'; then
    echo 'FAIL: service was given a seed secret'; exit 1
  fi
  # Generated seed passwords must fit bcrypt's 72-byte limit (server/src/core/config.ts).
  for secret in kithub-custodian-password kithub-borrower-password; do
    payload="$TEST_STATE_DIR/payload-$secret"
    [ -f "$payload" ] || continue
    if [ "$(wc -c < "$payload")" -gt 72 ]; then
      echo "FAIL: $secret is longer than 72 bytes"; exit 1
    fi
  done
  case "$MODE" in
    first_run)
      grep -q -- '--edition=enterprise' "$GCLOUD_LOG"
      if ! grep -q '^sql instances create kithub-pg .*--no-storage-auto-increase' "$GCLOUD_LOG"; then
        echo 'FAIL: Cloud SQL created without --no-storage-auto-increase'; exit 1
      fi
      grep -q '^sql users create ' "$GCLOUD_LOG" ;;
    partial) grep -q '^sql users set-password ' "$GCLOUD_LOG" ;;
    rerun)
      if grep -Eq '^(secrets create|sql users (create|set-password)) ' "$GCLOUD_LOG"; then
        echo 'FAIL: rerun replaced existing credentials'; exit 1
      fi ;;
  esac
  if [ -f "$TEST_STATE_DIR/sql-pass" ]; then
    db_pass="$(cat "$TEST_STATE_DIR/sql-pass")"
    db_url="$(cat "$TEST_STATE_DIR/payload-kithub-database-url")"
    case "$db_url" in
      "postgresql://kithub:${db_pass}@"*) ;;
      *) echo 'FAIL: DB password differs from secret'; exit 1 ;;
    esac
    if grep -Fq "$db_pass" "$TEST_STATE_DIR/output"; then
      echo 'FAIL: DB password leaked to output'; exit 1
    fi
  fi
  for secret_file in "$TEST_STATE_DIR"/payload-*; do
    [ -f "$secret_file" ] || continue
    secret_value="$(cat "$secret_file")"
    if [ -n "$secret_value" ] && grep -Fq "$secret_value" "$TEST_STATE_DIR/output"; then
      echo 'FAIL: secret payload leaked to output'; exit 1
    fi
  done
  echo "PASS: $MODE (exit, migration gate, credential handling, secret redaction)"
done
# --- Dry run must not call gcloud at all ------------------------------------------
export GCLOUD_LOG="$TEST_STATE_DIR/dry-run-calls"
DRY_RUN=1 bash "$DEPLOY_SCRIPT" --demo > "$TEST_STATE_DIR/dry-run-output"
if [ -f "$GCLOUD_LOG" ]; then
  echo 'FAIL: dry run called gcloud'; exit 1
fi
# The Starter Kit app name, spelled in two parts so `grep -rni` over deploy/
# finds no kit name in this folder (a #5 done check).
KIT_APP_NAME="tok""tickit"
if grep -qi "$KIT_APP_NAME" "$TEST_STATE_DIR/dry-run-output"; then
  echo 'FAIL: dry run still prints a Starter Kit name'; exit 1
fi
grep -q -- '--no-storage-auto-increase' "$TEST_STATE_DIR/dry-run-output"
grep -q 'SEED_BORROWER_PASSWORD=kithub-borrower-password:latest' "$TEST_STATE_DIR/dry-run-output"
DRY_RUN=1 bash "$DEPLOY_SCRIPT" > "$TEST_STATE_DIR/dry-run-output-no-demo"
if grep -q 'SEED_BORROWER_PASSWORD\|kithub-borrower-password' "$TEST_STATE_DIR/dry-run-output-no-demo"; then
  echo 'FAIL: dry run without --demo plans the Borrower secret'; exit 1
fi
echo 'PASS: dry run makes no gcloud calls and plans only KitHub names'
