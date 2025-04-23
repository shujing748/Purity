export function convertRules(abpRules) {
  if (!abpRules || typeof abpRules !== 'string') {
    throw new Error('无效的规则文本');
  }

  const lines = abpRules.split('\n');
  const result = [];
  let id = 1000;

  const DEFAULT_RESOURCE_TYPES = ['script', 'image', 'stylesheet', 'sub_frame', 'xmlhttprequest'];

  for (const line of lines) {
    try {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('!') || trimmed.includes('##')) continue;

      let pattern = trimmed;
      let isException = false;

      if (pattern.startsWith('@@')) {
        isException = true;
        pattern = pattern.substring(2);
      }

      // 处理选项
      const optionsIndex = pattern.indexOf('$');
      let options = {};
      if (optionsIndex > -1) {
        const optionParts = pattern.substring(optionsIndex + 1).split(',');
        pattern = pattern.substring(0, optionsIndex);
        
        optionParts.forEach(opt => {
          const [key, value] = opt.split('=');
          if (key) options[key.trim()] = value ? value.trim() : true;
        });
      }

      // 跳过元素隐藏规则
      if (options.eh || options.el) continue;

      // 检查非ASCII字符
      if (/[^\x00-\x7F]/.test(pattern)) {
        console.warn(`跳过包含非ASCII字符的规则: ${pattern}`);
        continue;
      }

      const convertedFilter = convertUrlPattern(pattern);
      if (!convertedFilter) continue;

      // 创建规则
      const rule = {
        id: id++,
        priority: isException ? 1 : 2,
        action: { type: isException ? 'allow' : 'block' },
        condition: {
          urlFilter: convertedFilter,
          resourceTypes: getResourceTypes(options) || DEFAULT_RESOURCE_TYPES
        }
      };

      // 处理域名限制
      if (options.domain) {
        const domains = options.domain.split('|').filter(d => d);
        const included = domains.filter(d => !d.startsWith('~'));
        const excluded = domains.filter(d => d.startsWith('~')).map(d => d.substring(1));
        
        if (included.length > 0) {
          rule.condition.initiatorDomains = included;
        }
        if (excluded.length > 0) {
          rule.condition.excludedInitiatorDomains = excluded;
        }
      }

      result.push(rule);

    } catch (e) {
      console.warn('规则转换失败:', line, e);
    }
  }

  return result;
}



function convertUrlPattern(pattern) {
  // 处理空模式
  if (!pattern) return null;

  // 处理域名锚定规则 (||example.com^)
  if (pattern.startsWith('||') && pattern.endsWith('^')) {
    return pattern.slice(2, -1);
  }
  
  // 处理精确匹配规则 (|http://example.com|)
  if (pattern.startsWith('|') && pattern.endsWith('|')) {
    return pattern.slice(1, -1);
  }

  // 处理正则表达式规则 (/example\.com/)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    return pattern;
  }

  // 处理通配符规则
  if (pattern.includes('*') || pattern.includes('^')) {
    return pattern.replace(/\^/g, '*');
  }

  // 默认处理
  return `*${pattern}*`;
}

function getResourceTypes(options) {
  if (!options) return null;

  const types = [];
  
  if (options.script) types.push('script');
  if (options.image) types.push('image');
  if (options.stylesheet) types.push('stylesheet');
  if (options.subdocument || options.frame) types.push('sub_frame');
  if (options.xmlhttprequest) types.push('xmlhttprequest');
  if (options.media) types.push('media');
  if (options.font) types.push('font');
  if (options.websocket) types.push('websocket');
  if (options.other) types.push('other');

  return types.length > 0 ? types : null;
}