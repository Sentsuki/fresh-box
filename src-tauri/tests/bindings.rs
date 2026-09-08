// host 域绑定的生成入口说明。
//
// 生成动作在应用自己身上：`fresh-box.exe --export-bindings <path>`
// （`pnpm gen:host`）。**不是**在这里跑，原因是 `collect_commands!` 会把整个
// wry 运行时链进调用它的二进制，而集成测试的测试二进制这么一链，启动时就
// `STATUS_ENTRYPOINT_NOT_FOUND` —— 缺的不是 WebView2Loader（试过把它拷到
// 测试二进制旁边，没用）。应用自身带着能正常加载的那套依赖，所以让它顺带
// 导出最省事。
//
// 这条测试只做一件不需要链 wry 的事：确认生成物存在且不是空的。它挡的是
// 「clone 下来忘了跑 gen:host」以及「生成失败但没人注意到」。

use std::path::Path;

#[test]
fn generated_host_bindings_are_present() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .join("src")
        .join("gen")
        .join("host.ts");

    assert!(
        path.exists(),
        "{} is missing — run `pnpm gen:host`",
        path.display()
    );
    let content = std::fs::read_to_string(&path).expect("read generated bindings");
    assert!(
        content.contains("export const commands"),
        "generated bindings look truncated or wrong — re-run `pnpm gen:host`"
    );
}
