document.addEventListener('DOMContentLoaded', function() {
  // DOM元素
  const toggleSwitch = document.getElementById('toggleSwitch');
  const enableEasyList = document.getElementById('enableEasyList');
  const enableEasyPrivacy = document.getElementById('enableEasyPrivacy');
  const ruleCountElement = document.getElementById('ruleCount');
  const staticRuleCountElement = document.getElementById('staticRuleCount');
  const lastUpdatedElement = document.getElementById('lastUpdated');
  const updateBtn = document.getElementById('updateRules');
  const emergencyResetBtn = document.getElementById('emergencyReset');
  const refreshPageBtn = document.getElementById('refreshPage');

  // 创建进度条
  const progressContainer = document.createElement('div');
  progressContainer.style.height = '4px';
  progressContainer.style.backgroundColor = '#f0f0f0';
  progressContainer.style.borderRadius = '2px';
  progressContainer.style.marginTop = '8px';
  progressContainer.style.overflow = 'hidden';

  const progressBar = document.createElement('div');
  progressBar.style.height = '100%';
  progressBar.style.backgroundColor = '#5d9c59';
  progressBar.style.width = '0%';
  progressBar.style.transition = 'width 0.3s ease';
  
  progressContainer.appendChild(progressBar);
  updateBtn.parentNode.insertBefore(progressContainer, updateBtn.nextSibling);

  // 状态变量
  let isUpdating = false;
  let updateTimeout = null;

  // 加载设置
  async function loadSettings() {
    try {
      const { 
        isEnabled, 
        enableEasyList: elEnabled, 
        enableEasyPrivacy: epEnabled, 
        dynamicRuleCount,
        lastUpdated 
      } = await chrome.storage.sync.get([
        'isEnabled', 
        'enableEasyList', 
        'enableEasyPrivacy', 
        'dynamicRuleCount',
        'lastUpdated'
      ]);

      toggleSwitch.checked = isEnabled !== false;
      enableEasyList.checked = elEnabled !== false;
      enableEasyPrivacy.checked = epEnabled || false;
      
      // 更新规则数量显示
      const ruleCountText = document.getElementById('ruleCount');
      if (ruleCountText) {
        ruleCountText.textContent = dynamicRuleCount || '0';
      }
      
      if (lastUpdated) {
        lastUpdatedElement.textContent = new Date(lastUpdated).toLocaleString();
      } else {
        lastUpdatedElement.textContent = '从未更新';
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 更新进度监控
  async function trackProgress() {
    if (!isUpdating) return;

    try {
      const { progress, current, total } = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'getProgress' }, resolve);
      });

      progressBar.style.width = `${progress}%`;
      updateBtn.textContent = `更新中 ${current}/${total}`;

      if (progress < 100) {
        setTimeout(trackProgress, 500);
      } else {
        updateComplete();
      }
    } catch (error) {
      console.error('进度检查失败:', error);
      updateComplete();
    }
  }

  // 更新完成处理
  function updateComplete() {
    clearTimeout(updateTimeout);
    isUpdating = false;
    updateBtn.disabled = false;
    updateBtn.textContent = '立即更新规则';
    progressBar.style.width = '0%';
    loadSettings();
  }

  // 事件监听器
  toggleSwitch.addEventListener('change', async function() {
    await chrome.storage.sync.set({ isEnabled: this.checked });
    chrome.runtime.sendMessage({ 
      action: 'updateRules', 
      isEnabled: this.checked 
    });
  });

  enableEasyList.addEventListener('change', async function() {
    await chrome.storage.sync.set({ enableEasyList: this.checked });
    loadSettings();
  });

  enableEasyPrivacy.addEventListener('change', async function() {
    await chrome.storage.sync.set({ enableEasyPrivacy: this.checked });
    loadSettings();
  });

  updateBtn.addEventListener('click', async function() {
    // 只显示基础状态
    const statusMessages = {
      updating: "更新中...",
      success: "更新完成",
      error: "更新失败",
      retrying: "自动修复中..."
    };
  
    updateBtn.disabled = true;
    updateBtn.textContent = statusMessages.updating;
  
    try {
      const response = await chrome.runtime.sendMessage({ action: 'force-update' });
      
      if (response.warning) {
        // 不显示具体跳过数量，只显示通用提示
        updateBtn.textContent = `${statusMessages.success} (已优化规则集)`;
      } else {
        updateBtn.textContent = statusMessages.success;
      }
    } catch (error) {
      updateBtn.textContent = statusMessages.error;
    } finally {
      setTimeout(() => {
        updateBtn.disabled = false;
        updateBtn.textContent = "立即更新规则";
      }, 2000);
    }
  });
  
  function updateComplete() {
    isUpdating = false;
    updateBtn.disabled = false;
    updateBtn.textContent = '立即更新规则';
    progressBar.style.width = '0%';
    loadSettings();
  }

  emergencyResetBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      // 先设置临时禁用状态
      chrome.runtime.sendMessage({ 
        action: 'temporarilyDisable',
        tabId: currentTab.id
      }, function() {
        // 然后刷新页面
        chrome.tabs.reload(currentTab.id);
      });
    });
  });

  refreshPageBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.reload(tabs[0].id);
    });
  });

  // 初始化
  loadSettings();

  // 监听规则更新完成事件
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'rulesUpdated') {
      loadSettings();
    }
  });
});