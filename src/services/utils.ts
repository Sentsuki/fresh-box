import { invoke } from '@tauri-apps/api/core';

// 获取纯文件名（不包含路径和扩展名）
export function getCleanFileName(filePath: string): string {
    const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
    return fileNameWithExt.replace('.json', '');
}

// 保存订阅信息到文件
export async function saveSubscriptionsToStorage(subscriptions: Record<string, string>) {
    await invoke('save_subscriptions', { subscriptions: JSON.stringify(subscriptions) });
}

// 从文件加载订阅信息
export async function loadSubscriptionsFromStorage(): Promise<Record<string, string>> {
    const savedSubscriptions = await invoke<string>('load_subscriptions');
    if (savedSubscriptions) {
        return JSON.parse(savedSubscriptions);
    }
    return {};
}