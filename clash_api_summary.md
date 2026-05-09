# Clash API in sing-box Summary

This document summarizes the RESTful API provided by the Clash API emulation in `sing-box`, based on the source code analysis.

## Base Information
- **Default Port**: Configurable (via `external-controller`).
- **Authentication**: Bearer Token (configured via `secret`). WebSocket connections can also use a `token` query parameter.

---

## 1. General Endpoints

### `GET /`
- **Function**: Hello message or redirect.
- **Description**: Returns `{"hello": "clash"}`. If `external-ui` is enabled and the request is not JSON, it redirects to `/ui/`.

### `GET /version`
- **Function**: Get version information.
- **Description**: Returns the sing-box version and capabilities (e.g., `{"version": "sing-box 1.x.x", "premium": true, "meta": true}`).

### `GET /traffic`
- **Function**: Real-time traffic statistics.
- **Description**: Returns up/down traffic speed. Supports WebSocket for continuous streaming.

### `GET /logs`
- **Function**: Get system logs.
- **Description**: Streams logs. Supports a `level` query parameter (default `info`). Supports WebSocket.

---

## 2. Configs (`/configs`)

### `GET /configs`
- **Function**: Get current configurations.
- **Description**: Returns current mode, available modes, log level, etc.

### `PATCH /configs`
- **Function**: Update configurations.
- **Description**: Allows updating the active mode.

### `PUT /configs`
- **Function**: Reload configurations.
- **Description**: Placeholder in this implementation (returns No Content).

---

## 3. Proxies (`/proxies`)

### `GET /proxies`
- **Function**: Get all proxies and groups.
- **Description**: Returns a list of all available outbound proxies and proxy groups (including a synthesized `GLOBAL` group).

### `GET /proxies/{name}`
- **Function**: Get specific proxy information.
- **Description**: Returns details, history, and current selection for a specific proxy or group.

### `GET /proxies/{name}/delay`
- **Function**: Test proxy delay (URL Test).
- **Description**: Performs a latency test for the specified proxy against a URL.
- **Query Parameters**: `url` (target URL), `timeout` (timeout in milliseconds).

### `PUT /proxies/{name}`
- **Function**: Switch proxy in a group.
- **Description**: Changes the selected outbound for a selector group.
- **Body**: `{"name": "new_selected_proxy_tag"}`

---

## 4. Connections (`/connections`)

### `GET /connections`
- **Function**: Get active connections.
- **Description**: Returns a snapshot of all active connections or streams them via WebSocket.
- **Query Parameters**: `interval` (snapshot interval in ms for WS).

### `DELETE /connections`
- **Function**: Close all connections.
- **Description**: Closes all active connections and resets the network.

### `DELETE /connections/{id}`
- **Function**: Close a specific connection.
- **Description**: Closes a connection identified by its UUID.

---

## 5. Rules (`/rules`)

### `GET /rules`
- **Function**: Get all rules.
- **Description**: Returns the list of configured routing rules with their type, payload, and target outbound.

---

## 6. DNS (`/dns`)

### `GET /dns/query`
- **Function**: Query DNS.
- **Description**: Resolves a domain name using the internal DNS router.
- **Query Parameters**: `name` (domain), `type` (RR type, default `A`).

---

## 7. Cache (`/cache`)

### `POST /cache/fakeip/flush`
- **Function**: Flush Fake-IP cache.
- **Description**: Clears the Fake-IP mappings if enabled.

### `POST /cache/dns/flush`
- **Function**: Flush DNS cache.
- **Description**: Clears the internal DNS cache.

---

## 8. Meta API Extensions (Clash.Meta Compatible)

### `GET /memory`
- **Function**: Get memory usage.
- **Description**: Returns current memory usage. Supports WebSocket.

### `GET /group`
- **Function**: Get all proxy groups.
- **Description**: Specifically returns only the proxy groups.

### `GET /group/{name}`
- **Function**: Get specific group info.
- **Description**: Returns details for a specific group.

### `GET /group/{name}/delay`
- **Function**: Test delay for all proxies in a group.
- **Description**: Concurrently tests latency for all proxies in the specified group.

### `POST /upgrade/ui`
- **Function**: Upgrade External UI.
- **Description**: Triggers a download/upgrade of the external user interface.

### `PUT /gc`
- **Function**: Force Garbage Collection.
- **Description**: Frees OS memory (only active when debug logging is enabled).

---

## 9. Stubbed / Not Implemented Features
The following endpoints are defined in the router but are either empty stubs or commented out in the code:
- **Proxy Providers** (`/providers/proxies`): Endpoints exist but implementation is mostly stubbed.
- **Rule Providers** (`/providers/rules`): Endpoints exist but implementation is mostly stubbed.
- **Scripts** (`/script`): Endpoints return `not implemented` or do nothing.
- **Profile Tracing** (`/profile/tracing`): Returns `Not Found`.
