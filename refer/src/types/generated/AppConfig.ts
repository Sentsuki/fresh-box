export interface AppConfig {
  auto_start_kernel: boolean
  auto_start_app: boolean
  auto_hide_to_tray_on_autostart: boolean
  tray_close_behavior: string
  prefer_ipv6: boolean
  allow_lan_access: boolean
  proxy_port: number
  api_port: number
  proxy_mode: string
  system_proxy_enabled: boolean
  tun_enabled: boolean
  tray_instance_id: string | null
  system_proxy_bypass: string
  tun_auto_route: boolean
  tun_strict_route: boolean
  tun_mtu: number
  tun_ipv4: string
  tun_ipv6: string
  tun_stack: string
  tun_enable_ipv6: boolean
  tun_route_exclude_address: string[] | null
  active_config_path: string | null
  installed_kernel_version: string | null
  singbox_dns_proxy: string
  singbox_dns_cn: string
  singbox_dns_resolver: string
  singbox_urltest_url: string
  singbox_default_proxy_outbound: string
  singbox_block_ads: boolean
  singbox_download_detour: string
  singbox_dns_hijack: boolean
  singbox_fake_dns_enabled: boolean
  singbox_fake_dns_ipv4_range: string
  singbox_fake_dns_ipv6_range: string
  singbox_fake_dns_filter_mode: string
  singbox_enable_app_groups: boolean
  tun_self_heal_enabled: boolean
  tun_self_heal_cooldown_secs: number
}
