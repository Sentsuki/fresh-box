1."Test All"（测试全部逻辑改动）
  把串行改为最多5个并行，节点失败不要中断报错，要完成所有节点的测速。前端要可以显示测速失败“timeout"
2.overview 的折线表改为Recharts这个库来实现
3.我给 connections 添加了离开页面停止的逻辑后，overview 页面的数据和 connections 的数据都是一卡一卡的，请找出原因并修复。如果logs页面也有同样的问题，也请修复
4.在settings 页面补上Process Management的功能(旧的实现参见 src.vue)
5 在settings 页面补上 const CLASH_API_BASE_URL: &str = "http://127.0.0.1:51385";
const CLASH_API_SECRET: &str = "~1]<R]:4db~4R)__EP4TN5dkLjob;9";
const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";  这几个选项的自定义功能，其中 CLASH_API_BASE_URL CLASH_API_SECRET 应该放在priority_config这个配置里，并且有自动随机端口和密码的功能
6.用 notification实现在windows 系统上推送通知的功能，通知内容仅限StatusBadge定义的状态，即singbox核心的运行状态，其他的通知不要推送