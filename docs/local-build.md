# 本地构建（Windows）

正式发布走 `.github/workflows/main.yml`（推 `vX.Y.Z` tag 触发）。这篇讲的是**本地打一个能真正跑起来的安装包**——重点只有一件事：**必须签名**，否则装完没有核心。

## 先看结论：为什么本地构建必须签名

`installer-hooks.nsh` 的 `NSIS_HOOK_POSTINSTALL` 在装完后会调
`sing-box-daemon.exe service install` 注册服务，而 boxdd 的
`secureWindowsInstallation`（`sing-box-1.14.0/experimental/boxdd/security_windows.go`）要求：

1. `sing-box.exe`（主程序）和 `resources\daemon\sing-box-daemon.exe` **都带 Authenticode 签名**；
2. 两者的**签名证书必须完全相同**。

不满足就直接 FATAL，服务不会被注册，安装器仍然显示 "Completed"，但应用启动后报
**The sing-box-daemon service isn't installed**——也就是"没有核心"。

仓库里的 `src-tauri/tauri.conf.json` **不含** `certificateThumbprint`（CI 在构建时由
`.github/scripts/configure-release.mjs` 临时写入，不回写仓库），所以直接
`pnpm tauri build` 出来的是**无签名包，装上必然没核心**。

自签名证书是可以的：`authenticode_windows.go` 的
`validateUntrustedSelfSignedCertificate` 显式接受不受信任的自签名证书，只校验
subject == issuer、自签名有效、在有效期内。

## 环境准备

| 依赖 | 说明 |
| --- | --- |
| Node.js LTS + pnpm | `pnpm install` |
| Rust stable (MSVC) | `rustup default stable` |
| Windows SDK | 提供 `signtool.exe`，Tauri 签名要用；没有它签名步骤会失败 |
| NSIS / WiX | 不用手装，`tauri build` 首次运行自动下载到 `src-tauri/target/release/{nsis,wix}` |

buf、Tauri CLI 都是 devDependency，`pnpm install` 之后就有。

### 守护进程二进制

`src-tauri/resources/daemon/` 和 `daemon-bundle/` 都在 `.gitignore` 里，**新克隆的仓库没有这些文件**。里面需要有：

```
sing-box-daemon.exe   libcronet.dll
WinDivert64.sys       VBoxUSB.{cat,inf,sys}   VBoxUSBMon.sys
usbip2_filter.{cat,inf,sys}   usbip2_ude.{cat,inf,sys}
```

两种拿法：

- **省事**：从已有的 release 安装包 / 之前的 `daemon-bundle/` 里复制过来。
- **自己编**：需要一个**真正的 git checkout** 的上游 sing-box —— `build_boxdd`
  内部调 `build_shared.ReadTag()`，它 shell 出 `git describe --tags`，
  仓库里那份解压出来的 `sing-box-1.14.0/`（无 `.git`）**跑不了**：

  ```powershell
  git clone --depth 1 --branch v1.14.0 https://github.com/SagerNet/sing-box.git sing-box-src
  cd sing-box-src
  go run ./cmd/internal/build_boxdd -target windows/amd64 -output "..\daemon-bundle\sing-box-daemon.exe"
  ```

  这一步会顺带把 WinDivert / USB-IP 的驱动文件放到同目录（校验过摘要）。
  `libcronet.dll` 是单独的运行时依赖，按 `.github/CRONET_GO_VERSION` 里的 commit
  从 `sagernet/cronet-go` 的 `lib/windows_amd64/libcronet.dll` 取。

  驱动的 `.sys/.cat` 由厂商预签，**不要重签**；Tauri 也只签 `.exe`/`.dll`。

最后把整份拷到 `src-tauri/resources/daemon/`。

## 一次性：准备代码签名证书

自签名一张就够（10 年有效期，免得过期后 boxdd 校验失败）：

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=fresh-box" `
  -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(10)
$cert.Thumbprint
```

已经有的话直接查：

```powershell
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=fresh-box' } |
  Select-Object Thumbprint, NotAfter, HasPrivateKey
```

> 注意：**主程序和 daemon 必须由同一张证书签**。这由一次 `tauri build` 自然保证；
> 但如果你事后单独替换了 `resources\daemon\sing-box-daemon.exe`（比如换成 CI 产物），
> 证书就对不上了，`service install` 会报
> `installed application and daemon have different signing certificates`。

## 构建

把 thumbprint 写进一个本地 config 覆盖文件（`src-tauri/sign.local.json`，已在 `.gitignore` 中）：

```json
{
  "bundle": {
    "createUpdaterArtifacts": false,
    "windows": {
      "digestAlgorithm": "sha256",
      "certificateThumbprint": "在这里填你的 thumbprint"
    }
  }
}
```

然后：

```powershell
pnpm install
pnpm gen          # 生成 src/gen/（protobuf 类型 + host bindings），未入库，必须先跑
pnpm tauri build --config src-tauri/sign.local.json
```

`--config` 是**增量合并**到 `tauri.conf.json` 上的，所以仓库文件保持干净，`git status` 不会有改动。

`createUpdaterArtifacts: false` 是因为 `tauri.conf.json` 默认开着 updater 产物，
而本地没有 `TAURI_SIGNING_PRIVATE_KEY`（那是 updater 用的 Ed25519 密钥，**跟代码签名证书无关**），
会在打包**之后**报 `A public key has been found, but no private key` 并以退出码 1 结束 ——
安装包其实已经打好了，但这一脚会把 `target/release/sing-box.exe` 上的签名擦掉，白白误导人。
本地测试用不到 in-app 更新，关掉最省事。

耗时参考：Rust release 编译约 3 分钟（增量重打包约 1 分钟）。

产物：

```
src-tauri\target\release\bundle\nsis\fresh-box_<版本>_x64-setup.exe   ← 装这个
src-tauri\target\release\bundle\msi\fresh-box_<版本>_x64_en-US.msi
```

**必须用 NSIS 的 setup.exe**：注册服务的 `installerHooks` 挂在
`bundle.windows.nsis` 下，MSI 不会跑 `installer-hooks.nsh`，装完照样没有核心。

## 验签

别去看 `src-tauri\target\release\sing-box.exe`——打包结束后 Tauri 会把那份带
bundle-type 补丁的二进制还原，**它显示 NotSigned 是正常的**。要验就验安装包里的实际载荷：

```powershell
$out = "$env:TEMP\fresh-box-verify"
msiexec /a "src-tauri\target\release\bundle\msi\fresh-box_1.14.0_x64_en-US.msi" /qn TARGETDIR="$out"
Get-ChildItem $out -Recurse -Include sing-box.exe, sing-box-daemon.exe | ForEach-Object {
  $s = Get-AuthenticodeSignature $_.FullName
  "{0}  {1}  {2}" -f $_.Name, $s.Status, $s.SignerCertificate.Thumbprint
}
```

期望：两个文件的 thumbprint **相同**，状态 `UnknownError`。

`UnknownError` = 根证书不受信任，自签名必然如此，**不是错误**——boxdd 接受（见上文）。
同理，构建日志里 signtool 那句
`A certificate chain processed, but terminated in a root certificate which is not trusted`
也是自签名的正常输出，紧跟着的 `Successfully signed:` 才是结果。

## 安装与确认

直接双击 `fresh-box_<版本>_x64-setup.exe`，**保持默认安装目录**（`C:\Program Files\fresh-box`）。
`installMode: perMachine` + Program Files 是 boxdd 安装目录 ACL 校验的前提，装到用户可写的目录会被拒绝。

覆盖安装无需先卸载：`NSIS_HOOK_PREINSTALL` 会先停服务并 kill 掉残留的
`sing-box-daemon.exe`（否则被占用的 dll 覆盖不了，报 "Access is denied"），
`NSIS_HOOK_POSTINSTALL` 再用新二进制重新注册。

装完确认：

```powershell
Get-Service sing-box-daemon
Get-AuthenticodeSignature 'C:\Program Files\fresh-box\sing-box.exe',
  'C:\Program Files\fresh-box\resources\daemon\sing-box-daemon.exe' |
  Select-Object Status, @{n='Thumb';e={$_.SignerCertificate.Thumbprint}}, Path
```

服务 Running + 两个 thumbprint 一致，就对了。

安装器的详细日志（含 boxdd 自己的输出）在安装界面点 "Show details" 能看到，
出问题先看那里的 `sing-box-daemon service install exit code:`。

## 排错速查

| 现象 | 原因 / 处理 |
| --- | --- |
| 装完应用报 "The sing-box-daemon service isn't installed"；安装日志里 `FATAL ... verify Authenticode signature: No signature was present in the subject` | 无签名构建。按上文配 `certificateThumbprint` 重新打包 |
| `installed application and daemon have different signing certificates` | 主程序和 daemon 不是同一张证书签的，多半是事后单独替换了某一个二进制。整体重打一次 |
| `A public key has been found, but no private key` | updater 签名密钥缺失。本地构建加 `"createUpdaterArtifacts": false`，或设 `TAURI_SIGNING_PRIVATE_KEY` |
| `target\release\sing-box.exe` 查出来 NotSigned | 正常，见「验签」。以安装包/安装后的文件为准 |
| signtool 报 `terminated in a root certificate which is not trusted` | 自签名的正常输出，不影响 |
| 找不到 `signtool.exe` | 装 Windows SDK |
| 覆盖安装时 "Access is denied" | 还有进程占着 `resources\daemon\*.dll`。手动 `taskkill /F /IM sing-box-daemon.exe /T` 后重试 |
| 用 MSI 装完没有核心 | MSI 不跑 NSIS hooks，改用 setup.exe |
| `pnpm build` / 类型检查报找不到 `src/gen/...` | 忘了 `pnpm gen` |

## 和 CI 的差异

| | 本地 | CI（tag 触发） |
| --- | --- | --- |
| 版本号 | `tauri.conf.json` 里写死 | 由 tag 决定，`configure-release.mjs` 临时写入 |
| daemon 二进制 | 自己准备（见上） | `build-daemon` job 从上游 tag 现编 |
| 代码签名证书 | 本机自签名 | `WINDOWS_CERTIFICATES_P12` secret |
| updater `.sig` / `latest.json` | 关掉 | `TAURI_SIGNING_PRIVATE_KEY` 签，tauri-action 生成 |
