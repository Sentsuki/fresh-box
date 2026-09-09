import { describe, expect, it } from "vitest";
import type * as Host from "../gen/host";
import {
  DEFAULT_CONNECTION_VISIBLE_COLUMNS,
  createDefaultAppSettings,
  normalizeAppSettings,
} from "./app";

/**
 * `normalizeAppSettings` 是 host 域设置的唯一入口。
 *
 * 值得测的不是「默认值等于默认值」，而是它对**坏数据**的态度：Rust 侧存的是
 * `String`/`Vec<String>`（存储层不该知道有哪些列、有哪些标签页），所以「上个
 * 版本写下的列名」「被手改过的值」在类型上完全合法，只能在这里挡住。挡不住
 * 的话页面上就是一个 `undefined`。
 */

/** 一份形状完整、值可以随便坏的设置 —— 生成类型里每个区都是必填的。 */
function stored(overrides: {
  [K in keyof Host.AppSettings]?: Partial<Host.AppSettings[K]>;
}): Host.AppSettings {
  const base: Host.AppSettings = createDefaultAppSettings();
  const merged = { ...base };
  for (const key of Object.keys(overrides) as (keyof Host.AppSettings)[]) {
    merged[key] = { ...base[key], ...overrides[key] } as never;
  }
  return merged;
}

describe("normalizeAppSettings", () => {
  it("null / undefined 都退回一整份默认值", () => {
    expect(normalizeAppSettings(null)).toEqual(createDefaultAppSettings());
    expect(normalizeAppSettings(undefined)).toEqual(createDefaultAppSettings());
  });

  it("整个区缺失时补齐，不留 undefined", () => {
    // 类型上不可能，运行时可能：这条记录是旧版本写下的，序列化时还没有这个区。
    // 函数里满地的 `settings.app?.` 就是为它准备的，这里把它钉住。
    const settings = normalizeAppSettings({} as Host.AppSettings);
    for (const [section, value] of Object.entries(settings)) {
      expect(value, `section ${section}`).toBeTypeOf("object");
      for (const [key, field] of Object.entries(value)) {
        expect(field, `${section}.${key}`).not.toBeUndefined();
      }
    }
  });

  it("认识的值原样留下", () => {
    const settings = normalizeAppSettings(
      stored({
        app: { current_page: "logs" },
        settings: { theme_mode: "dark" },
        logs: { type_filter: "error" },
      }),
    );
    expect(settings.app.current_page).toBe("logs");
    expect(settings.settings.theme_mode).toBe("dark");
    expect(settings.logs.type_filter).toBe("error");
  });

  it("不认识的枚举值退回默认，而不是原样透传", () => {
    // 存的是上个版本的页名 / 手改坏的值。透传的话路由匹配不到任何页面，
    // 用户开机看到一片空白。
    const settings = normalizeAppSettings(
      stored({
        app: { current_page: "a-page-that-no-longer-exists" },
        settings: { theme_mode: "solarized" },
        connections: { current_tab: "nope", sort_key: "nope" },
      }),
    );
    const defaults = createDefaultAppSettings();
    expect(settings.app.current_page).toBe(defaults.app.current_page);
    expect(settings.settings.theme_mode).toBe("system");
    expect(settings.connections.current_tab).toBe(
      defaults.connections.current_tab,
    );
    expect(settings.connections.sort_key).toBe(defaults.connections.sort_key);
  });

  it("列表里的坏列名被剔掉，好的留下", () => {
    const settings = normalizeAppSettings(
      stored({
        connections: { visible_columns: ["host", "not-a-column", "upload"] },
      }),
    );
    expect(settings.connections.visible_columns).toEqual(["host", "upload"]);
  });

  it("「一列都不显示」和「没设置过」是两回事", () => {
    // 空数组是用户的选择，必须保留；字段整个缺失才回默认列表。两者在 JSON 里
    // 长得很像，靠 `hasOwnProperty` 分开。
    expect(
      normalizeAppSettings(stored({ connections: { visible_columns: [] } }))
        .connections.visible_columns,
    ).toEqual([]);
    expect(
      normalizeAppSettings({ connections: {} } as Host.AppSettings).connections
        .visible_columns,
    ).toEqual([...DEFAULT_CONNECTION_VISIBLE_COLUMNS]);
  });

  it("分组列为空串时归一成 null", () => {
    // Rust 侧存的是 `String`，「没有分组」是空串；前端用 null 表示。
    expect(
      normalizeAppSettings(stored({ connections: { grouped_column: "" } }))
        .connections.grouped_column,
    ).toBeNull();
    expect(
      normalizeAppSettings(stored({ connections: { grouped_column: "host" } }))
        .connections.grouped_column,
    ).toBe("host");
  });

  it("内存上限不是数字时用默认值", () => {
    const defaults = createDefaultAppSettings();
    expect(
      normalizeAppSettings(
        stored({ diagnostics: { oom_memory_limit_mb: undefined } }),
      ).diagnostics.oom_memory_limit_mb,
    ).toBe(defaults.diagnostics.oom_memory_limit_mb);
    expect(
      normalizeAppSettings(
        stored({ diagnostics: { oom_memory_limit_mb: 4096 } }),
      ).diagnostics.oom_memory_limit_mb,
    ).toBe(4096);
  });

  it("选中的订阅是 id，没有就是 null", () => {
    // 阶段 4 的回归点：这个字段一度同时存在于 `profiles` 区和一个独立的
    // settings 键里，前后端各写各的，谁都没有编译错误。
    expect(
      normalizeAppSettings(stored({})).profiles.selected_profile_id,
    ).toBeNull();
    expect(
      normalizeAppSettings(stored({ profiles: { selected_profile_id: "abc" } }))
        .profiles.selected_profile_id,
    ).toBe("abc");
  });
});
