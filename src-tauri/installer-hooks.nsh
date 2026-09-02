; Custom NSIS hooks for fresh-box — see tauri.conf.json's
; `bundle.windows.nsis.installerHooks`.
;
; Registers/unregisters the sing-box-daemon Windows service as part of the
; app's own install/uninstall, instead of leaving it to a separate step in
; Settings. The installer already runs elevated (installMode = perMachine,
; required for `$INSTDIR` to satisfy boxdd's install-directory ACL check —
; see `daemon::install` on the Rust side), so no extra UAC prompt is
; needed here; `nsExec::ExecToLog` also surfaces boxdd's own output in the
; installer's details view if something goes wrong.
;
; This isn't the only way in: Settings still exposes its own Install/
; Uninstall button (`daemon::install::install_service`/`uninstall_service`)
; as a manual fallback/repair path for anyone who skips this, upgrades the
; daemon binary in place, or hits an installer that predates this hook.

!macro NSIS_HOOK_PREINSTALL
  ; Runs before any files are copied. On an in-place upgrade, `$INSTDIR`
  ; already points at the *previous* install, and its sing-box-daemon
  ; Windows service (plus any per-session worker relay processes fresh-box
  ; itself spawned — see `daemon::worker` on the Rust side) may still be
  ; running, with `resources\daemon\*.dll` (libcronet.dll, wintun.dll, ...)
  ; mapped into those processes. Windows refuses to overwrite a DLL that's
  ; currently loaded by a running process, which is exactly the "Access is
  ; denied" error users hit partway through an overwrite install. Stop
  ; everything holding those files open first so the copy can succeed;
  ; NSIS_HOOK_POSTINSTALL below reinstalls/restarts the service against the
  ; freshly-copied exe.
  IfFileExists "$INSTDIR\resources\daemon\sing-box-daemon.exe" 0 skip_daemon_stop
    DetailPrint "Stopping sing-box-daemon service..."
    nsExec::ExecToLog '"$INSTDIR\resources\daemon\sing-box-daemon.exe" service stop'
    Pop $0
    DetailPrint "sing-box-daemon service stop exit code: $0"
  skip_daemon_stop:

  ; `service stop` only stops the service's own process (`service run`).
  ; Worker relay processes are separate children of the *app*, not the
  ; service, and won't go down with it — make sure nothing left from
  ; resources\daemon is still holding files open before the copy phase
  ; starts. Best-effort: ignore the exit code (nothing to kill is fine).
  nsExec::ExecToLog 'taskkill /F /IM sing-box-daemon.exe /T'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Installing sing-box-daemon service..."
  nsExec::ExecToLog '"$INSTDIR\resources\daemon\sing-box-daemon.exe" service install --working-directory "C:\ProgramData\sing-box-daemon"'
  Pop $0
  DetailPrint "sing-box-daemon service install exit code: $0"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Runs before files are deleted, so the daemon exe is still there to run.
  DetailPrint "Uninstalling sing-box-daemon service..."
  nsExec::ExecToLog '"$INSTDIR\resources\daemon\sing-box-daemon.exe" service uninstall'
  Pop $0
  DetailPrint "sing-box-daemon service uninstall exit code: $0"

  ; `service uninstall` only deregisters the service — it doesn't remove
  ; its own working directory (see `serviceUninstall` in
  ; cmd_service_windows.go upstream), so that's left behind unless we
  ; clean it up ourselves. This is daemon-internal state, not user data,
  ; so removing it unconditionally is safe.
  RMDir /r "C:\ProgramData\sing-box-daemon"

  ; Deliberately NOT touching %LOCALAPPDATA%\fresh-box here — that's where
  ; the user's own subscriptions/settings live (see
  ; `config::paths::get_app_data_root` on the Rust side), and wiping
  ; personal data on a plain uninstall isn't standard Windows app
  ; behavior. Revisit if a "remove my data too" opt-in is wanted later.
!macroend
