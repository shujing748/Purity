import { RuleManager } from './rule-manager.js';

const ruleManager = new RuleManager();
let updateProgress = {
  status: 'idle',
  progress: 0,
  current: 0,
  total: 0
};

// 添加临时禁用状态的存储
let temporarilyDisabledTabs = new Set();

// 初始化规则
async function initialize() {
  console.log('[Background] 初始化规则管理器');
  try {
    await chrome.storage.sync.set({
      isEnabled: true,
      enableEasyList: true,
      enableEasyPrivacy: false
    });
    console.log('[Background] 默认设置已初始化');
  } catch (error) {
    console.error('[Background] 初始化设置失败:', error);
  }
}

// 保持Service Worker活跃
function keepAlive() {
  setInterval(() => {
    chrome.runtime.sendMessage({ action: 'ping' }, () => {
      if (chrome.runtime.lastError) {
        console.log('[KeepAlive] 维持服务工作进程活跃');
      }
    });
  }, 25000); // 25秒发送一次心跳
}

// 新增：增强的错误处理器
async function handleRuleUpdate() {
  try {
    console.log('[Background] 开始规则更新');
    
    // 1. 执行规则更新
    const result = await ruleManager.updateRules();
    
    // 2. 检查实际生效的规则数量
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    
    // 3. 更新存储中的规则数量
    await chrome.storage.sync.set({
      dynamicRuleCount: dynamicRules.length
    });
    
    // 4. 如果有规则被跳过，添加警告信息
    if (result.count > dynamicRules.length) {
      const skippedCount = result.count - dynamicRules.length;
      console.warn(`[Background] ${skippedCount}条规则被跳过`);
      result.warning = `${skippedCount}条规则因格式问题被跳过`;
    }
    
    console.log('[Background] 规则更新完成', {
      dynamicRules: dynamicRules.length
    });
    
    return {
      ...result,
      dynamicRuleCount: dynamicRules.length
    };
    
  } catch (error) {
    // 4. 增强错误信息处理
    console.error('[Background] 更新错误原始信息:', error);
    
    let errorMsg = error.message;
    if (error.message.includes('non-ascii characters')) {
      errorMsg = '部分规则包含非ASCII字符已被自动跳过';
    } else if (error.message.includes('Dynamic rule count exceeded')) {
      errorMsg = '规则数量超过限制，已自动保留最高优先级规则';
    }
    
    // 5. 尝试获取当前规则状态
    try {
      const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
      console.log('[Background] 当前有效规则:', currentRules.length);
    } catch (e) {
      console.error('[Background] 获取当前规则失败:', e);
    }
    
    throw new Error(errorMsg);
  }
}

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (request.action) {
        case 'force-update':
          const result = await handleRuleUpdate();
          sendResponse(result);
          break;

        case 'getProgress':
          sendResponse(updateProgress);
          break;

        case 'updateProgress':
          updateProgress = {
            status: 'updating',
            progress: request.progress,
            current: request.current,
            total: request.total,
            lastUpdated: Date.now()
          };
          sendResponse({ success: true });
          break;

        case 'getCurrentRules':
          const rules = await chrome.declarativeNetRequest.getDynamicRules();
          sendResponse({
            count: rules.length,
            sample: rules.slice(0, 5)
          });
          break;

        case 'ping':
          sendResponse({ status: 'alive', timestamp: Date.now() });
          break;

        case 'temporarilyDisable':
          temporarilyDisabledTabs.add(request.tabId);
          // 在临时禁用状态下，移除该标签页的所有动态规则
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules())
              .filter(rule => rule.condition.tabIds?.includes(request.tabId))
              .map(rule => rule.id)
          });
          // 设置该标签页的插件状态为禁用
          await chrome.storage.sync.set({ [`isEnabled_${request.tabId}`]: false });
          sendResponse({ success: true });
          break;

        case 'isTemporarilyDisabled':
          sendResponse({ disabled: temporarilyDisabledTabs.has(request.tabId) });
          break;

        case 'getTabEnabledState':
          const { [`isEnabled_${request.tabId}`]: isEnabled } = await chrome.storage.sync.get([`isEnabled_${request.tabId}`]);
          sendResponse({ isEnabled: isEnabled !== false });
          break;

        default:
          sendResponse({ error: '未知操作' });
      }
    } catch (error) {
      console.error('[Background] 消息处理错误:', error);
      sendResponse({ error: error.message });
    }
  };

  handleAsync();
  return true; // 保持消息端口开放
});

// 监听标签页更新事件，在页面刷新时恢复插件状态
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    temporarilyDisabledTabs.delete(tabId);
    // 恢复该标签页的插件状态
    chrome.storage.sync.set({ [`isEnabled_${tabId}`]: true });
  }
});

// 定时更新规则
function setupAutoUpdate() {
  chrome.alarms.create('autoUpdate', {
    periodInMinutes: 720 // 每12小时更新一次
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autoUpdate') {
      console.log('[AutoUpdate] 定时规则更新开始');
      handleRuleUpdate();
    }
  });
}

// 安装处理
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] 扩展安装/更新');
  await initialize();
  setupAutoUpdate();
  keepAlive();
  
  // 初始化搜索引擎设置
  chrome.storage.sync.get(['searchEngineSettings'], function(result) {
    if (!result.searchEngineSettings) {
      const defaultSettings = {
        baidu: { enabled: true },
        google: { enabled: true },
        bing: { enabled: true }
      };
      chrome.storage.sync.set({ searchEngineSettings: defaultSettings });
    }
  });
  
  // 初始化广告计数
  chrome.storage.local.get(['searchEngineCounts'], function(result) {
    if (!result.searchEngineCounts) {
      const defaultCounts = {
        baidu: 0,
        google: 0,
        bing: 0
      };
      chrome.storage.local.set({ searchEngineCounts: defaultCounts });
    }
  });
});

// 启动时检查更新
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] 浏览器启动，检查规则更新');
  handleRuleUpdate();
});

chrome.declarativeNetRequest.getDynamicRules(async (rules) => {
  // 移除优先级低于2的规则（保留例外规则和高优先级规则）
  const idsToRemove = rules.filter(rule => rule.priority < 2).map(rule => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: idsToRemove });
  console.log(`已移除 ${idsToRemove.length} 条低优先级规则`);
});

// 监听来自content-search.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'updateSearchEngineCount') {
    const { engine, count } = request;
    
    chrome.storage.local.get(['searchEngineCounts'], function(result) {
      const counts = result.searchEngineCounts || {};
      counts[engine] = count;
      chrome.storage.local.set({ searchEngineCounts: counts });
    });
  }
});

console.log('[Background] 服务工作进程已启动');