function displayBlockedCounts() {
  ['baidu', 'google', 'bing', 'global'].forEach(engine => {
    const countKey = `ad_hidden_count_${engine}`;
    chrome.storage.sync.get(countKey, (data) => {
      const countElement = document.getElementById(`${engine}Count`);
      if (countElement) {
        countElement.textContent = data[countKey] || 0;
      }
    });
  });
}


// Add event listeners for reset buttons
function setupResetButtons() {
  const resetButtons = document.querySelectorAll('.reset-count-btn');
  
  resetButtons.forEach(button => {
    button.addEventListener('click', function() {
      const engine = this.getAttribute('data-engine');
      resetBlockedCount(engine);
    });
  });
}


function resetBlockedCount(engine) {
  const countKey = 'ad_hidden_count_' + engine;
  
  const resetData = {};
  resetData[countKey] = 0;
  
  chrome.storage.sync.set(resetData, function() {
    const countElement = document.getElementById(engine + 'Count');
  
    if (countElement) {
      countElement.textContent = '0';
    }
  });
}



document.addEventListener("DOMContentLoaded", () => {
  // 获取所有必要的DOM元素
  const adList = document.getElementById("adList");
  const saveButton = document.getElementById("saveButton");
  const exportButton = document.getElementById("exportButton");
  const importButton = document.getElementById("importButton");
  const importFile = document.getElementById("importFile");
  const toggleButton = document.getElementById("toggleButton");
  const sidebarItems = document.querySelectorAll(".sidebar li");
  const contentSections = document.querySelectorAll(".content section");
  
  // 获取新增的搜索引擎控制元素
  const baiduEnabled = document.getElementById("baiduEnabled");
  const googleEnabled = document.getElementById("googleEnabled");
  const bingEnabled = document.getElementById("bingEnabled");
  const customFiltersEnabled = document.getElementById("customFiltersEnabled");
  const customAdWords = document.getElementById("customAdWords");
  const saveSearchSettings = document.getElementById("saveSearchSettings");

  // 在DOMContentLoaded事件中添加：
  function initRuleControls() {
    const updateBtn = document.getElementById('updateRules');
    const easyListSwitch = document.getElementById('enableEasyList');
    const easyPrivacySwitch = document.getElementById('enableEasyPrivacy');

  // 加载保存的状态
  chrome.storage.sync.get(
    ['enableEasyList', 'enableEasyPrivacy', 'lastUpdated', 'ruleCount'],
    (data) => {
      easyListSwitch.checked = data.enableEasyList !== false;
      easyPrivacySwitch.checked = data.enableEasyPrivacy || false;
      
      document.getElementById('ruleCount').textContent = data.ruleCount || 0;
      if (data.lastUpdated) {
        document.getElementById('lastUpdated').textContent = 
          new Date(data.lastUpdated).toLocaleString();
      }
    }
  );

  // 保存设置变化
  [easyListSwitch, easyPrivacySwitch].forEach(sw => {
    sw.addEventListener('change', () => {
      chrome.storage.sync.set({
        enableEasyList: easyListSwitch.checked,
        enableEasyPrivacy: easyPrivacySwitch.checked
      }, () => {
        chrome.runtime.sendMessage({ action: 'force-update' });
      });
    });
  });

  // 手动更新
  updateBtn.addEventListener('click', () => {
    updateBtn.disabled = true;
    updateBtn.textContent = '更新中...';
    
    chrome.runtime.sendMessage({ action: 'force-update' }, () => {
      setTimeout(() => {
        updateBtn.disabled = false;
        updateBtn.textContent = '更新完成';
      }, 2000);
    });
  });initRuleControls(); // 新增
}



  // 设置多语言文本
  document.querySelectorAll("[data-i18n]").forEach(element => {
    const messageKey = element.getAttribute("data-i18n");
    if (messageKey) {
      element.textContent = chrome.i18n.getMessage(messageKey);
    } else {
      console.warn("Missing data-i18n attribute on element:", element);
    }
  });

  const placeholderKey = adList.getAttribute("data-i18n-placeholder");
  if (placeholderKey) {
    adList.placeholder = chrome.i18n.getMessage(placeholderKey);
  } else {
    adList.placeholder = "Enter domains to block, one per line (e.g., ad1.com)";
  }

  // 加载开关状态
  chrome.storage.sync.get("isEnabled", (data) => {
    const isEnabled = data.isEnabled !== false;
    toggleButton.textContent = chrome.i18n.getMessage(isEnabled ? "toggleDisable" : "toggleEnable");
  });

  // 加载广告列表
  chrome.storage.sync.get("customAdList", (data) => {
    let rawList = data.customAdList;
    if (!rawList || rawList.length === 0) {
      rawList = [];
    }
    adList.value = rawList.map(url => {
      if (url.startsWith("@@||") && url.endsWith("^")) {
        return url.replace("@@||", "@@").replace("^", "");
      } else if (url.startsWith("/") && url.endsWith("/")) {
        return url;
      } else if (url.startsWith("||") && url.endsWith("^")) {
        return url.replace("||", "").replace("^", "");
      }
      return url;
    }).join("\n");
  });

  // 加载搜索引擎设置
  loadSearchEngineSettings();

  // 切换菜单
  sidebarItems.forEach(item => {
    item.addEventListener("click", () => {
      sidebarItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      contentSections.forEach(section => section.classList.remove("active"));
      const targetSection = document.getElementById(item.getAttribute("data-section"));
      if (targetSection) {
        targetSection.classList.add("active");
      }
    });
  });

//开关按钮逻辑
  toggleButton.addEventListener("click", () => {
    chrome.storage.sync.get("isEnabled", (data) => {
      const isEnabled = data.isEnabled !== false;
      const newState = !isEnabled;
      chrome.storage.sync.set({ isEnabled: newState }, () => {
        toggleButton.textContent = chrome.i18n.getMessage(newState ? "toggleDisable" : "toggleEnable");
        chrome.runtime.sendMessage({ action: "toggleStateChanged", isEnabled: newState });
        chrome.runtime.sendMessage({ action: "updateRules", isEnabled: newState });
      });
    });
  });

  // 保存广告列表
  saveButton.addEventListener("click", () => {
    const rawList = adList.value.split("\n").filter(line => line.trim() !== "");
    const formattedList = rawList.map(domain => {
      if (domain.startsWith("@@")) return `@@||${domain.slice(2)}^`;
      if (domain.startsWith("/") && domain.endsWith("/")) return domain;
      return `||${domain.trim()}^`;
    });
    chrome.storage.sync.set({ customAdList: formattedList }, () => {
      chrome.runtime.sendMessage({ action: "updateRules", isEnabled: true });
      alert("Saved!");
    });
  });

  // 导出规则
  exportButton.addEventListener("click", () => {
    const rawList = adList.value.split("\n").filter(line => line.trim() !== "");
    const blob = new Blob([rawList.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url: url, filename: "ad_block_list.txt", saveAs: true });
  });

  // 导入规则
  importButton.addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        adList.value = e.target.result;
        const rawList = adList.value.split("\n").filter(line => line.trim() !== "");
        const formattedList = rawList.map(domain => {
          if (domain.startsWith("@@")) return `@@||${domain.slice(2)}^`;
          if (domain.startsWith("/") && domain.endsWith("/")) return domain;
          return `||${domain.trim()}^`;
        });
        chrome.storage.sync.set({ customAdList: formattedList }, () => {
          chrome.runtime.sendMessage({ action: "updateRules", isEnabled: true });
          alert("Imported!");
        });
      };
      reader.readAsText(file);
    }
  });

  // 新增：搜索引擎设置保存
    saveSearchSettings.addEventListener("click", () => {
      saveSearchEngineSettings();
    });


// Call these functions when the page loads
displayBlockedCounts();
setupResetButtons();
initGlobalFilter(); // 新增


});

// options.js
document.getElementById('testRuleBtn').addEventListener('click', () => {
  const url = prompt('输入要测试的URL');
  chrome.runtime.sendMessage({
    action: 'debug-rule-match',
    url
  }, response => {
    alert(response.matched ? `已拦截: ${JSON.stringify(response.rules)}` : '未匹配任何规则');
  });
});
// 定期检查规则状态
setInterval(async () => {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  console.log('当前规则:', {
    total: rules.length,
    byDomain: Object.groupBy(rules, r => r.condition.urlFilter)
  });
}, 5000);

// 加载保存的搜索引擎设置
function loadSearchEngineSettings() {
  chrome.storage.sync.get([
    'baiduEnabled', 
    'googleEnabled', 
    'bingEnabled',
    'customFiltersEnabled',
    'customAdWords',
    'globalFilterEnabled'  // 新增全局过滤开关
  ], function(data) {
    // 获取相关DOM元素
    const baiduEnabled = document.getElementById('baiduEnabled');
    const googleEnabled = document.getElementById('googleEnabled');
    const bingEnabled = document.getElementById('bingEnabled');
    const customFiltersEnabled = document.getElementById('customFiltersEnabled');
    const customAdWords = document.getElementById('customAdWords');
    const globalFilterEnabled = document.getElementById('globalFilterEnabled');
    
    // 确保元素存在后设置值
    if (baiduEnabled) {
      baiduEnabled.checked = data.baiduEnabled !== undefined ? data.baiduEnabled : true;
    }
    
    if (googleEnabled) {
      googleEnabled.checked = data.googleEnabled !== undefined ? data.googleEnabled : true;
    }
    
    if (bingEnabled) {
      bingEnabled.checked = data.bingEnabled !== undefined ? data.bingEnabled : true;
    }
    
    if (customFiltersEnabled) {
      customFiltersEnabled.checked = data.customFiltersEnabled !== undefined ? 
        data.customFiltersEnabled : false;
    }
    
    if (customAdWords) {
      customAdWords.value = data.customAdWords || '';
    }

    // 设置全局过滤开关状态（默认true）
    if (globalFilterEnabled) {
      globalFilterEnabled.checked = data.globalFilterEnabled !== undefined ? 
        data.globalFilterEnabled : true;
    }
  });
}

// 在 loadSearchEngineSettings 函数后添加：

function initGlobalFilter() {
  const globalSwitch = document.getElementById('globalFilterEnabled');
  
  chrome.storage.sync.get('globalFilterEnabled', (data) => {
    globalSwitch.checked = data.globalFilterEnabled !== false;
  });

  globalSwitch.addEventListener('change', () => {
    chrome.storage.sync.set({ 
      globalFilterEnabled: globalSwitch.checked 
    });
  });
}


// 保存搜索引擎设置
function saveSearchEngineSettings() {
  // 获取所有相关元素
  const baiduEnabled = document.getElementById('baiduEnabled');
  const googleEnabled = document.getElementById('googleEnabled');
  const bingEnabled = document.getElementById('bingEnabled');
  const customFiltersEnabled = document.getElementById('customFiltersEnabled');
  const customAdWords = document.getElementById('customAdWords');
  const globalFilterEnabled = document.getElementById('globalFilterEnabled');
  
  // 验证元素是否存在
  if (!baiduEnabled || !googleEnabled || !bingEnabled || 
      !customFiltersEnabled || !customAdWords || !globalFilterEnabled) {
    console.error("搜索设置元素缺失");
    return;
  }
  
  // 准备保存的设置对象
  const settings = {
    baiduEnabled: baiduEnabled.checked,
    googleEnabled: googleEnabled.checked,
    bingEnabled: bingEnabled.checked,
    customFiltersEnabled: customFiltersEnabled.checked,
    customAdWords: customAdWords.value,
    globalFilterEnabled: globalFilterEnabled.checked  // 新增全局过滤状态
  };
  
  // 保存设置并通知后台
  chrome.storage.sync.set(settings, function() {
    // 通知内容脚本更新过滤规则
    chrome.runtime.sendMessage({ 
      action: "updateSearchFilters", 
      searchSettings: settings 
    });
    
    // 显示保存成功提示
    const successMsg = chrome.i18n.getMessage("searchEngineSaveSuccess") || 
                      "设置已保存";
    alert(successMsg);
  });
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateUI") {
      console.log("---选项页收到数据：", message.data);
      displayBlockedCounts();
      sendResponse({ success: true });
  }
  return true; // 指示异步响应
});

// 在控制台测试多个广告域名
const testUrls = [
  'https://www.googletagservices.com/tag/js/gpt.js',
  'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
];

testUrls.forEach(url => {
  chrome.declarativeNetRequest.testMatchOutcome({
    url,
    type: 'script'
  }, result => {
    console.log(`${url}: ${result.matched ? '✅ 已拦截' : '❌ 未拦截'}`);
  });
});

// 初始化搜索引擎广告屏蔽功能
function initSearchEngineAdBlocking() {
  const searchEngines = ['baidu', 'google', 'bing'];
  
  // 从storage中获取设置
  chrome.storage.sync.get(['searchEngineSettings'], function(result) {
    const settings = result.searchEngineSettings || {};
    
    // 初始化每个搜索引擎的设置
    searchEngines.forEach(engine => {
      const enabled = settings[engine]?.enabled ?? true;
      document.getElementById(`${engine}Enabled`).checked = enabled;
      
      // 更新计数显示
      updateEngineCount(engine);
    });
  });
  
  // 添加事件监听器
  searchEngines.forEach(engine => {
    document.getElementById(`${engine}Enabled`).addEventListener('change', function(e) {
      const enabled = e.target.checked;
      updateSearchEngineSetting(engine, enabled);
    });
    
    // 重置计数按钮
    document.querySelector(`button[data-engine="${engine}"]`).addEventListener('click', function() {
      resetEngineCount(engine);
    });
  });
}

// 更新搜索引擎设置
function updateSearchEngineSetting(engine, enabled) {
  chrome.storage.sync.get(['searchEngineSettings'], function(result) {
    const settings = result.searchEngineSettings || {};
    settings[engine] = settings[engine] || {};
    settings[engine].enabled = enabled;
    
    chrome.storage.sync.set({ searchEngineSettings: settings });
  });
}

// 更新搜索引擎广告计数
function updateEngineCount(engine) {
  chrome.storage.local.get(['searchEngineCounts'], function(result) {
    const counts = result.searchEngineCounts || {};
    const count = counts[engine] || 0;
    document.getElementById(`${engine}Count`).textContent = count;
  });
}

// 重置搜索引擎广告计数
function resetEngineCount(engine) {
  chrome.storage.local.get(['searchEngineCounts'], function(result) {
    const counts = result.searchEngineCounts || {};
    counts[engine] = 0;
    
    chrome.storage.local.set({ searchEngineCounts: counts }, function() {
      updateEngineCount(engine);
    });
  });
}

// 在文档加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // ... existing code ...
  initSearchEngineAdBlocking();
});