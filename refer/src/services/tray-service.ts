import { invokeWithAppContext } from './invoke-client'

export interface TrayRuntimeStatePayload {
  kernelRunning: boolean
  systemProxyEnabled: boolean
  tunEnabled: boolean
  activeSubscriptionName?: string | null
  locale: string
  windowVisible: boolean
  closeBehavior: 'hide' | 'lightweight'
}

function sanitizeStatePayload(payload: TrayRuntimeStatePayload): TrayRuntimeStatePayload {
  return {
    kernelRunning: payload.kernelRunning,
    systemProxyEnabled: payload.systemProxyEnabled,
    tunEnabled: payload.tunEnabled,
    activeSubscriptionName: payload.activeSubscriptionName?.trim() || null,
    locale: payload.locale?.trim() || 'en-US',
    windowVisible: payload.windowVisible,
    closeBehavior: payload.closeBehavior,
  }
}

export const trayService = {
  syncState(payload: TrayRuntimeStatePayload) {
    return invokeWithAppContext<void>(
      'tray_sync_state',
      { payload: sanitizeStatePayload(payload) },
      { skipDataRestore: true },
    )
  },

  setLastVisibleRoute(path: string) {
    return invokeWithAppContext<void>(
      'tray_set_last_visible_route',
      { path },
      { skipDataRestore: true },
    )
  },

  showMainWindow() {
    return invokeWithAppContext<void>('tray_show_main_window', undefined, {
      skipDataRestore: true,
    })
  },

  hideMainWindow() {
    return invokeWithAppContext<void>('tray_hide_main_window', undefined, {
      skipDataRestore: true,
    })
  },

  closeMainWindow() {
    return invokeWithAppContext<void>('tray_close_main_window', undefined, {
      skipDataRestore: true,
    })
  },

  consumePendingRestoreRoute() {
    return invokeWithAppContext<{ path: string } | null>(
      'tray_consume_pending_restore_route',
      undefined,
      { skipDataRestore: true },
    )
  },

  consumePendingProxyToggle() {
    return invokeWithAppContext<{ feature: 'systemProxy' | 'tun'; enabled: boolean } | null>(
      'tray_consume_pending_proxy_toggle',
      undefined,
      { skipDataRestore: true },
    )
  },

  requestExit() {
    return invokeWithAppContext<void>('tray_request_app_exit', undefined, {
      skipDataRestore: true,
    })
  },
}
