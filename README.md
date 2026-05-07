# A simple sing-box client for Windows

## Notes
- Tun requires administrator privileges
- This project is not affiliated with the official Sing-box team

## Local build
- Install Tauri with [DOC](https://v2.tauri.app/)
- Download [sing-box core for windows](https://github.com/SagerNet/sing-box) and put it in `src-tauri/bin`
- `pnpm install`
- `pnpm tauri dev` or `pnpm tauri build`
- `cargo clippy --fix` `pnpm lint` `pnpm format`

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](./LICENSE) file for details.
