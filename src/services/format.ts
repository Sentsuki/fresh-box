// Formatting helpers for the Advanced page's diagnostics tools — mirrors
// sing-box's own `networkquality.FormatBitrate` (decimal, bits/s — not the
// binary byte units `formatBytes` in `utils.ts` uses) and the `stun`
// package's `NATMapping`/`NATFiltering` `String()` methods, so the numbers
// read the same here as they do from `sing-box tools networkquality`/
// `sing-box api stun` on the command line.

/** Mirrors `common/networkquality.FormatBitrate` (sing-box core). */
export function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000_000) {
    return `${(bitsPerSecond / 1_000_000_000).toFixed(1)} Gbps`;
  }
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bitsPerSecond >= 1_000) {
    return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
  }
  return `${Math.round(bitsPerSecond)} bps`;
}

/** `0`=Low, `1`=Medium, `2`=High — mirrors `networkquality.Accuracy`. */
export function accuracyLabel(accuracy: number): string {
  switch (accuracy) {
    case 2:
      return "High";
    case 1:
      return "Medium";
    default:
      return "Low";
  }
}

export function accuracyVariant(
  accuracy: number,
): "success" | "warning" | "error" {
  switch (accuracy) {
    case 2:
      return "success";
    case 1:
      return "warning";
    default:
      return "error";
  }
}

/** Mirrors `common/stun.NATMapping.String()`. `1` is a reserved gap in the
 * upstream enum (never sent) — falls through to "Unknown" like every other
 * unrecognized value. */
export function natMappingLabel(value: number): string {
  switch (value) {
    case 2:
      return "Endpoint Independent";
    case 3:
      return "Address Dependent";
    case 4:
      return "Address and Port Dependent";
    default:
      return "Unknown";
  }
}

/** Mirrors `common/stun.NATFiltering.String()` — note this enum has no
 * reserved gap, unlike `NATMapping` above, so the numeric values differ. */
export function natFilteringLabel(value: number): string {
  switch (value) {
    case 1:
      return "Endpoint Independent";
    case 2:
      return "Address Dependent";
    case 3:
      return "Address and Port Dependent";
    default:
      return "Unknown";
  }
}

/** "Endpoint Independent" is the most permissive/best-for-P2P behavior;
 * anything more restrictive is progressively worse for hole punching. */
export function natBehaviorVariant(
  label: string,
): "success" | "warning" | "error" {
  switch (label) {
    case "Endpoint Independent":
      return "success";
    case "Address Dependent":
      return "warning";
    case "Address and Port Dependent":
      return "error";
    default:
      return "warning";
  }
}
