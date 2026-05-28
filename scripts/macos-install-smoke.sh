#!/usr/bin/env bash
set -euo pipefail

artifact_path=""
auto_exit_ms="4000"
launch_timeout_sec="60"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact)
      artifact_path="${2:-}"
      shift 2
      ;;
    --auto-exit-ms)
      auto_exit_ms="${2:-}"
      shift 2
      ;;
    --launch-timeout-sec)
      launch_timeout_sec="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$artifact_path" ]]; then
  echo "--artifact is required." >&2
  exit 2
fi

if [[ ! -e "$artifact_path" ]]; then
  echo "Artifact was not found: $artifact_path" >&2
  exit 1
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/amerp-macos-smoke.XXXXXX")"
mount_dir="$temp_root/mount"
extract_dir="$temp_root/extract"
data_dir="$temp_root/data"
user_data_dir="$temp_root/user-data"
mounted_dmg=""

cleanup() {
  if [[ -n "$mounted_dmg" ]]; then
    hdiutil detach "$mounted_dmg" -quiet || true
  fi
  rm -rf "$temp_root"
}
trap cleanup EXIT

write_step() {
  printf '\n==> %s\n' "$1"
}

assert_path_exists() {
  local path="$1"
  local label="$2"
  if [[ ! -e "$path" ]]; then
    echo "$label was not found: $path" >&2
    exit 1
  fi
}

find_app_bundle() {
  local root="$1"
  find "$root" -maxdepth 3 -type d -name "*.app" | head -n 1
}

app_executable() {
  local app_path="$1"
  local plist="$app_path/Contents/Info.plist"
  assert_path_exists "$plist" "App Info.plist"
  local executable
  executable="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$plist")"
  local executable_path="$app_path/Contents/MacOS/$executable"
  assert_path_exists "$executable_path" "App executable"
  printf '%s\n' "$executable_path"
}

prepare_app() {
  local artifact="$1"
  local lower
  lower="$(printf '%s' "$artifact" | tr '[:upper:]' '[:lower:]')"

  mkdir -p "$mount_dir" "$extract_dir"
  if [[ "$lower" == *.dmg ]]; then
    write_step "Mounting macOS DMG"
    hdiutil attach "$artifact" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
    mounted_dmg="$mount_dir"
    find_app_bundle "$mount_dir"
    return
  fi

  if [[ "$lower" == *.zip ]]; then
    write_step "Extracting macOS ZIP"
    ditto -x -k "$artifact" "$extract_dir"
    find_app_bundle "$extract_dir"
    return
  fi

  if [[ "$lower" == *.app ]]; then
    printf '%s\n' "$artifact"
    return
  fi

  echo "Unsupported macOS artifact type: $artifact" >&2
  exit 1
}

wait_for_process() {
  local pid="$1"
  local timeout_sec="$2"
  local deadline=$((SECONDS + timeout_sec))
  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 "$pid" 2>/dev/null || true
      echo "AMERP smoke process did not exit within ${timeout_sec} seconds." >&2
      return 1
    fi
    sleep 1
  done
  wait "$pid"
}

assert_initialized_data_folder() {
  local root="$1"
  for relative in \
    "config" \
    "jobs" \
    "employees" \
    "time-clock" \
    "kanban" \
    "materials" \
    "nonconformances" \
    "audit" \
    "cache" \
    "locks"
  do
    assert_path_exists "$root/$relative" "Initialized data folder path '$relative'"
  done
  assert_path_exists "$root/config/preferences.json" "Preferences file"
  assert_path_exists "$root/config/ai-settings.json" "AI settings file"
}

app_path="$(prepare_app "$artifact_path")"
if [[ -z "$app_path" ]]; then
  echo "No .app bundle was found in artifact: $artifact_path" >&2
  exit 1
fi

executable_path="$(app_executable "$app_path")"

write_step "Launching macOS packaged app"
AMERP_DATA_FOLDER="$data_dir" \
AMERP_USER_DATA_FOLDER="$user_data_dir" \
AMERP_SMOKE_TEST_EXIT_AFTER_MS="$auto_exit_ms" \
"$executable_path" &
app_pid="$!"

wait_for_process "$app_pid" "$launch_timeout_sec"
assert_initialized_data_folder "$data_dir"

printf '\nmacOS packaged install smoke test passed.\n'
