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

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/amerp-linux-smoke.XXXXXX")"
extract_dir="$temp_root/extract"
data_dir="$temp_root/data"
user_data_dir="$temp_root/user-data"

cleanup() {
  rm -rf "$temp_root"
}
trap cleanup EXIT

write_step() {
  printf '\n==> %s\n' "$1" >&2
}

assert_path_exists() {
  local path="$1"
  local label="$2"
  if [[ ! -e "$path" ]]; then
    echo "$label was not found: $path" >&2
    exit 1
  fi
}

find_linux_executable() {
  local root="$1"
  find "$root" -maxdepth 6 -type f \( -name "AMERP" -o -name "amerp" \) -perm -u+x | head -n 1
}

prepare_executable() {
  local artifact="$1"
  local lower
  lower="$(printf '%s' "$artifact" | tr '[:upper:]' '[:lower:]')"

  mkdir -p "$extract_dir"
  if [[ "$lower" == *.appimage ]]; then
    chmod +x "$artifact"
    printf '%s\n' "$artifact"
    return
  fi

  if [[ "$lower" == *.tar.gz || "$lower" == *.tgz ]]; then
    write_step "Extracting Linux tarball"
    tar -xzf "$artifact" -C "$extract_dir"
    find_linux_executable "$extract_dir"
    return
  fi

  if [[ "$lower" == *.deb ]]; then
    write_step "Extracting Linux DEB"
    dpkg-deb -x "$artifact" "$extract_dir"
    find_linux_executable "$extract_dir"
    return
  fi

  if [[ -d "$artifact" ]]; then
    find_linux_executable "$artifact"
    return
  fi

  echo "Unsupported Linux artifact type: $artifact" >&2
  exit 1
}

run_with_timeout() {
  local executable="$1"
  local timeout_sec="$2"
  shift 2
  if command -v timeout >/dev/null 2>&1; then
    timeout --kill-after=5s "${timeout_sec}s" "$executable" "$@"
  else
    "$executable" "$@" &
    local pid="$!"
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
  fi
}

launch_app() {
  local executable="$1"
  local -a command=(env
    "AMERP_DATA_FOLDER=$data_dir"
    "AMERP_USER_DATA_FOLDER=$user_data_dir"
    "AMERP_SMOKE_TEST_EXIT_AFTER_MS=$auto_exit_ms"
    "APPIMAGE_EXTRACT_AND_RUN=1"
    "NO_AT_BRIDGE=1"
    "$executable"
    "--no-sandbox")

  if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
    run_with_timeout xvfb-run "$launch_timeout_sec" -a "${command[@]}"
    return
  fi

  run_with_timeout "${command[0]}" "$launch_timeout_sec" "${command[@]:1}"
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

executable_path="$(prepare_executable "$artifact_path")"
if [[ -z "$executable_path" ]]; then
  echo "No Linux executable was found in artifact: $artifact_path" >&2
  exit 1
fi
assert_path_exists "$executable_path" "Linux app executable"

write_step "Launching Linux packaged app"
launch_app "$executable_path"
assert_initialized_data_folder "$data_dir"

printf '\nLinux packaged install smoke test passed.\n'
