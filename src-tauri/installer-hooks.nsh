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
