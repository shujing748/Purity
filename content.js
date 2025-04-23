console.log('内容脚本已加载，开始初始化元素隐藏功能');
console.log('扩展ID:', chrome.runtime.id);
console.log('当前URL:', window.location.href);

// 确保chrome.storage可用
chrome.storage.local.get('elementHideRules', result => {
  console.log('获取到的隐藏规则:', result.elementHideRules);
});
const ELEMENT_HIDERS = new Map();

// 默认广告选择器规则
const DEFAULT_AD_SELECTORS = [
  // 广告容器选择器（优先级最高）
  '.c-container',
  '.result-op',
  '.commercial-unit',
  '.ad-container',
  '.adBlock',
  '.ads-fr',
  '.ec_tuiguang_container',
  '.side-btns-wrap',
  '.side-btns-2w',
  
  // 通用广告类选择器
  '.ad',
  '.ads',
  '.advertisement',
  '.advert',
  '[class*="ad-"]',
  '[class*="_ad"]',
  '[class*="ads-"]',
  '[id*="ad-"]',
  '[id*="_ad"]',
  '[id*="ads-"]',
  
  // 数据属性选择器
  '[data-ad]',
  '[data-advertisement]',
  '[data-sf-provider]',
  '[data-tpl*="adv"]',
  '[cmatchid]',
  
  // iframe广告
  'iframe[src*="ad"]',
  'iframe[src*="ads"]',
  'iframe[src*="banner"]',
  
  // 特定广告平台选择器
  '.google-ad',
  '.facebook-ad',
  '.amazon-ad',
  '.adsbygoogle',
  '[data-ad-slot]',
  '[data-ad-client]',
  
  // 广告相关文本
  '[class*="banner"]',
  '[id*="banner"]',
  '[class*="sponsored"]',
  '[id*="sponsored"]',
  '.side-btns-2w-img img',
  '.side-btns-2w-resize',
  'img[src*="qrcode"]',
  'img[src*="banner"]'
];

// 广告关键词列表
const AD_KEYWORDS = [
  '广告',
  'AD',
  'Advertisement',
  'Sponsored',
  '推广',
  '品牌推广',
  '商业推广',
  '特约广告',
  '赞助'
];

async function applyElementHiding() {
  try {
    const { elementHideRules = [] } = await chrome.storage.local.get('elementHideRules');
    
    // 合并默认规则和用户规则
    const allRules = [
      ...DEFAULT_AD_SELECTORS.map(selector => ({ selector, isDefault: true })),
      ...elementHideRules.map(rule => ({ ...rule, isDefault: false }))
    ];

    let hiddenCount = 0;
    const styleRules = [];

    // 1. 首先处理选择器规则
    allRules.forEach(rule => {
      try {
        const elements = document.querySelectorAll(rule.selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            // 查找最近的广告容器
            const adContainer = el.closest('.c-container, .result-op, .commercial-unit, .ad-container, .adBlock, .side-btns-wrap') || el;
            
            if (!adContainer.dataset.purityHidden) {
              // 1.1 直接操作DOM隐藏
              hideElement(adContainer);
              
              // 1.2 生成CSS规则作为兜底
              const uniqueSelector = generateUniqueSelector(adContainer);
              styleRules.push(uniqueSelector);
              
              adContainer.dataset.purityHidden = 'true';
              hiddenCount++;
              
              console.log(`已应用${rule.isDefault ? '默认' : '用户'}规则: ${rule.selector} -> ${uniqueSelector}`);
            }
          });
        }
      } catch (e) {
        console.warn(`无法隐藏元素: ${rule.selector}`, e);
      }
    });

    // 2. 文本内容检测
    const textNodes = document.evaluate(
      '//text()[not(ancestor::script) and not(ancestor::style)]',
      document,
      null,
      XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < textNodes.snapshotLength; i++) {
      const node = textNodes.snapshotItem(i);
      const text = node.textContent.toLowerCase();
      
      if (AD_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()))) {
        const container = findAdContainer(node);
        if (container && !container.dataset.purityHidden) {
          // 2.1 直接操作DOM隐藏
          hideElement(container);
          
          // 2.2 生成CSS规则作为兜底
          const uniqueSelector = generateUniqueSelector(container);
          styleRules.push(uniqueSelector);
          
          container.dataset.purityHidden = 'true';
          hiddenCount++;
        }
      }
    }

    // 3. 注入CSS规则作为兜底
    if (styleRules.length > 0) {
      injectBackupStyles(styleRules);
    }

    if (hiddenCount > 0) {
      console.log(`本次共隐藏 ${hiddenCount} 个广告元素`);
    }
  } catch (error) {
    console.error('应用元素隐藏失败:', error);
  }
}

// 直接操作DOM隐藏元素
function hideElement(element) {
  // 1. 移除内联样式
  element.removeAttribute('style');
  
  // 2. 使用Object.defineProperty锁定style属性
  try {
    const elementStyle = element.style;
    const cssProps = [
      'display',
      'visibility',
      'opacity',
      'position',
      'pointer-events',
      'width',
      'height',
      'margin',
      'padding',
      'border',
      'min-height',
      'max-height',
      'z-index',
      'clip',
      'clip-path',
      'transform',
      'top',
      'left',
      'bottom',
      'right'
    ];

    // 锁定关键CSS属性
    cssProps.forEach(prop => {
      Object.defineProperty(elementStyle, prop, {
        configurable: false,
        get: () => prop === 'display' ? 'none' : '0',
        set: () => {} // 忽略所有设置尝试
      });
    });

    // 锁定setProperty方法
    const originalSetProperty = elementStyle.setProperty;
    Object.defineProperty(elementStyle, 'setProperty', {
      configurable: false,
      get: () => function(prop, value) {
        if (cssProps.includes(prop)) return; // 阻止修改关键属性
        originalSetProperty.call(elementStyle, prop, value);
      }
    });

    // 锁定cssText
    Object.defineProperty(elementStyle, 'cssText', {
      configurable: false,
      get: () => '',
      set: () => {} // 阻止通过cssText修改样式
    });
  } catch (e) {
    console.warn('无法锁定样式属性:', e);
  }

  // 3. 设置强制样式
  const importantStyles = {
    display: 'none',
    visibility: 'hidden',
    opacity: '0',
    position: 'absolute',
    'pointer-events': 'none',
    width: '0',
    height: '0',
    margin: '0',
    padding: '0',
    border: '0',
    'min-height': '0',
    'max-height': '0',
    'z-index': '-9999',
    clip: 'rect(0px, 0px, 0px, 0px)',
    'clip-path': 'polygon(0px 0px, 0px 0px, 0px 0px, 0px 0px)',
    transform: 'scale(0)',
    top: '-9999px',
    left: '-9999px'
  };

  Object.entries(importantStyles).forEach(([prop, value]) => {
    element.style.setProperty(prop, value, 'important');
  });

  // 4. 禁用交互和可访问性
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('hidden', '');
  element.setAttribute('data-purity-hidden', 'true');
  
  // 5. 清除内容
  if (element.tagName !== 'IMG' && element.tagName !== 'VIDEO') {
    element.textContent = '';
  }

  // 6. 移除所有事件监听器
  const clone = element.cloneNode(true);
  element.parentNode?.replaceChild(clone, element);
  
  // 7. 添加MutationObserver监听样式变化
  const styleObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && 
         (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
        // 重新应用隐藏样式
        element.removeAttribute('style');
        Object.entries(importantStyles).forEach(([prop, value]) => {
          element.style.setProperty(prop, value, 'important');
        });
      }
    });
  });

  styleObserver.observe(clone, {
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  return clone;
}

// 注入CSS规则作为兜底
function injectBackupStyles(selectors) {
  const style = document.createElement('style');
  style.textContent = `
    ${selectors.join(',\n')} {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      position: absolute !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      z-index: -9999 !important;
    }
  `;
  document.head.appendChild(style);
  return style;
}

// 生成唯一选择器
function generateUniqueSelector(element) {
  if (element.id) {
    return '#' + CSS.escape(element.id);
  }
  
  let selector = element.tagName.toLowerCase();
  if (element.className) {
    selector += '.' + Array.from(element.classList).map(c => CSS.escape(c)).join('.');
  }
  
  // 添加属性选择器以增加特异性
  if (element.hasAttribute('data-purity-hidden')) {
    selector += '[data-purity-hidden="true"]';
  }
  
  return selector;
}

// 查找广告容器
function findAdContainer(node) {
  const element = node.parentElement;
  if (!element) return null;
  
  // 定义可能的广告容器类名
  const containerClasses = [
    'c-container',
    'result-op',
    'commercial-unit',
    'ad-container',
    'adBlock',
    'side-btns-wrap',
    'side-btns-2w'
  ];
  
  // 向上查找最近的广告容器
  return element.closest(containerClasses.join(',')) || element;
}

// 优化 MutationObserver 配置
const observerConfig = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeOldValue: true,
  characterData: true,
  characterDataOldValue: true
};

// 使用防抖函数优化性能
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedApplyElementHiding = debounce(applyElementHiding, 250);

const observer = new MutationObserver((mutations) => {
  let needsRecheck = false;

  mutations.forEach(mutation => {
    // 1. 检查新增节点
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // 元素节点
          // 检查是否是广告元素
          if (isAdElement(node)) {
            hideElement(node);
            needsRecheck = true;
          }
          // 检查子元素
          node.querySelectorAll('*').forEach(child => {
            if (isAdElement(child)) {
              hideElement(child);
              needsRecheck = true;
            }
          });
        }
      });
    }
    
    // 2. 检查属性变化
    if (mutation.type === 'attributes') {
      const target = mutation.target;
      if (target.nodeType === 1) {
        // 检查style属性变化
        if (mutation.attributeName === 'style') {
          if (target.dataset.purityHidden) {
            hideElement(target);
          } else if (isAdElement(target)) {
            hideElement(target);
            needsRecheck = true;
          }
        }
        // 检查class变化
        if (mutation.attributeName === 'class') {
          if (isAdElement(target)) {
            hideElement(target);
            needsRecheck = true;
          }
        }
      }
    }
  });

  // 如果发现新的广告元素，重新检查整个文档
  if (needsRecheck) {
    debouncedApplyElementHiding();
  }
});

// 判断元素是否为广告
function isAdElement(element) {
  if (!element || !element.matches) return false;

  // 1. 检查选择器匹配
  if (DEFAULT_AD_SELECTORS.some(selector => element.matches(selector))) {
    return true;
  }

  // 2. 检查父级容器
  if (element.closest(DEFAULT_AD_SELECTORS.join(','))) {
    return true;
  }

  // 3. 检查文本内容
  const text = element.textContent.toLowerCase();
  if (AD_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()))) {
    return true;
  }

  // 4. 检查内联样式是否包含广告特征
  const style = element.getAttribute('style');
  if (style && /position:\s*fixed|z-index:\s*[0-9]{4,}|top:\s*0/.test(style)) {
    return true;
  }

  return false;
}

function init() {
  applyElementHiding();
  observer.observe(document.documentElement, observerConfig);
  
  // 定期检查新加载的广告
  setInterval(applyElementHiding, 2000);
}

// 在页面加载时检查标签页的启用状态
chrome.runtime.sendMessage({ 
  action: 'getTabEnabledState',
  tabId: chrome.runtime.id
}, function(response) {
  if (response.isEnabled) {
    // 只有在启用状态下才执行广告拦截
    initAdBlocking();
  } else {
    // 在禁用状态下，移除所有已隐藏的元素
    const hiddenElements = document.querySelectorAll('[style*="display: none"]');
    hiddenElements.forEach(element => {
      element.style.display = '';
    });
  }
});

if (document.readyState === 'complete') init();
else window.addEventListener('DOMContentLoaded', init);