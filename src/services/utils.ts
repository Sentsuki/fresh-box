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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return '刚刚更新';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}