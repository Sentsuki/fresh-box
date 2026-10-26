import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 拼接 class，并按 Tailwind 的语义去掉被覆盖的那些。
 *
 * 组件把调用方传进来的 `className` 放在最后：`<Badge className="px-3">`
 * 里的 `px-3` 会真正替换掉 Badge 默认的 `px-1.5`。只是简单拼接的话，两个
 * 同属性的 class 谁生效取决于它们在生成的样式表里的先后，和写的顺序无关。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
