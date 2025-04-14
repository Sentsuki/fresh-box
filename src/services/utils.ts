// 获取纯文件名（不包含路径和扩展名）
export function getCleanFileName(filePath: string): string {
    const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
    return fileNameWithExt.replace('.json', '');
  }
  
  // 保存订阅信息到本地存储
  export function saveSubscriptionsToStorage(subscriptions: Record<string, string>) {
    localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
  }
  
  // 从本地存储加载订阅信息
  export function loadSubscriptionsFromStorage(): Record<string, string> {
    const savedSubscriptions = localStorage.getItem('subscriptions');
    if (savedSubscriptions) {
      return JSON.parse(savedSubscriptions);
    }
    return {};
  }