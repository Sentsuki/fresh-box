import { invoke } from '@tauri-apps/api/core';

// 获取纯文件名（不包含路径和扩展名）
export function getCleanFileName(filePath: string): string {
    const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
    return fileNameWithExt.replace('.json', '');
}

// 订阅信息接口
export interface SubscriptionInfo {
    url: string;
    lastUpdated?: string;
}

// 保存订阅信息到文件
export async function saveSubscriptionsToStorage(subscriptions: Record<string, SubscriptionInfo>) {
    await invoke('save_subscriptions', { subscriptions: JSON.stringify(subscriptions) });
}

// 从文件加载订阅信息
export async function loadSubscriptionsFromStorage(): Promise<Record<string, SubscriptionInfo>> {
    const savedSubscriptions = await invoke<string>('load_subscriptions');
    if (savedSubscriptions) {
        const parsed = JSON.parse(savedSubscriptions);
        // 兼容旧格式（字符串URL）
        const result: Record<string, SubscriptionInfo> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                result[key] = { url: value };
            } else {
                result[key] = value as SubscriptionInfo;
            }
        }
        return result;
    }
    return {};
}

// 格式化时间显示
export function formatLastUpdated(lastUpdated?: string): string {
    if (!lastUpdated) return '从未更新';
    
    const date = new Date(lastUpdated);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}