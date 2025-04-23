import { convertRules } from './rule-converter.js';

const RULE_SOURCES = {
  easylist: 'https://easylist-downloads.adblockplus.org/easylist.txt',
  easyprivacy: 'https://easylist-downloads.adblockplus.org/easyprivacy.txt'
};

export class RuleManager {
  constructor() {
    // Chrome动态规则硬性限制
    this.DYNAMIC_RULE_LIMIT = 5000;
    this.DYNAMIC_ID_RANGE = { min: 1, max: 5000 };
    
    // 规则分配策略
    this.ADBLOCK_RATIO = 0.9; // 90%给广告拦截规则
    this.TRACKING_RATIO = 0.1; // 10%给隐私保护规则
    
    this.lastUsedId = this.DYNAMIC_ID_RANGE.min;
  }

  async updateRules() {
    const updateId = Date.now();
    console.log(`[${updateId}] 开始规则更新 (限额: ${this.DYNAMIC_RULE_LIMIT}条)`);

    try {
      // 1. 获取用户设置
      const { enableEasyList = true, enableEasyPrivacy = false } = 
        await chrome.storage.sync.get(['enableEasyList', 'enableEasyPrivacy']);

      // 2. 生成规则集
      const rules = await this._generateRuleSet(enableEasyList, enableEasyPrivacy, updateId);
      
      // 3. 清除旧规则
      await this._safeClearRules();

      // 4. 应用新规则
      await this._applyRules(rules);

      // 5. 保存状态（不存储具体数量避免暴露）
      await chrome.storage.sync.set({
        lastUpdated: Date.now(),
        ruleStatus: 'active'
      });

      console.log(`[${updateId}] 规则更新完成`);
      return { success: true };
    } catch (error) {
      console.error(`[${updateId}] 更新失败:`, error);
      throw new Error("规则更新失败，请重试");
    }
  }

  async _generateRuleSet(enableEasyList, enableEasyPrivacy, updateId) {
    const rules = [];
    this.lastUsedId = 1; // 重置ID计数器
  
    // 按优先级排序规则（数值越大优先级越高）
    const allRules = [];
    if (enableEasyList) {
      const text = await this._fetchWithRetry('easylist');
      allRules.push(...convertRules(text).sort((a, b) => b.priority - a.priority));
    }
    if (enableEasyPrivacy) {
      const text = await this._fetchWithRetry('easyprivacy');
      allRules.push(...convertRules(text).sort((a, b) => b.priority - a.priority));
    }
  
    // 只取前5000条最高优先级规则
    return allRules.slice(0, this.DYNAMIC_RULE_LIMIT);
  }
  _processRules(rules, limit, type, updateId) {
    // 按优先级降序排序
    const sorted = rules.sort((a, b) => b.priority - a.priority);
    
    // 选择高优先级规则
    const selected = sorted.slice(0, limit);
    
    // 分配唯一ID
    return selected.map(rule => {
      if (this.lastUsedId > this.DYNAMIC_ID_RANGE.max) {
        console.warn(`[${updateId}] ID耗尽，已跳过部分${type}规则`);
        return null;
      }
      
      return {
        ...rule,
        id: this.lastUsedId++
      };
    }).filter(Boolean); // 过滤掉可能存在的null
  }

  async _safeClearRules() {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      if (existingRules.length === 0) return;

      // 分块清除避免超时
      const chunkSize = 1000;
      for (let i = 0; i < existingRules.length; i += chunkSize) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingRules
            .slice(i, i + chunkSize)
            .map(rule => rule.id)
        });
      }
    } catch (error) {
      console.error('清除规则失败:', error);
      throw new Error("系统维护中，请稍后重试");
    }
  }

  async _applyRules(rules) {
    try {
      // 分块应用规则（Chrome API限制）
      const chunkSize = 500;
      for (let i = 0; i < rules.length; i += chunkSize) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: rules.slice(i, i + chunkSize)
        });
      }
    } catch (error) {
      console.error('应用规则失败:', error);
      throw new Error("规则应用失败");
    }
  }

  async _fetchWithRetry(source, attempt = 1) {
    const url = RULE_SOURCES[source];
    console.log(`[${new Date().toISOString()}] 尝试加载规则文件: ${url}, 第 ${attempt} 次尝试`);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      console.log(`[${source}] HTTP 状态码: ${response.status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      console.log(`[${source}] 文件加载成功，前100字符: ${text.substring(0, 100)}...`);
      return text;
    } catch (error) {
      console.error(`[${source}] 加载失败: ${error.message}`);
      if (attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      return this._fetchWithRetry(source, attempt + 1);
    }
  }
 /*
  async _fetchWithRetry(source, attempt = 1) {
    try {
      const response = await fetch(RULE_SOURCES[source], {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      return this._fetchWithRetry(source, attempt + 1);
    }
  }
  */
}