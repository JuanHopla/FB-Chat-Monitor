// ----- jQuery-like VERSION FOR :contains() SELECTOR -----
// This function is necessary for selectors using :contains()
document.querySelectorAll = (function(originalQuerySelectorAll) {
  return function(selector) {
    try {
      if (selector.includes(':contains(')) {
        const match = selector.match(/:contains\(["']?([^)"']+)["']?\)/);
        if (match) {
          const searchText = match[1];
          const simpleSelector = selector.replace(/:contains\(["']?([^)"']+)["']?\)/, '');
          const elements = originalQuerySelectorAll.call(this, simpleSelector);
          const result = Array.from(elements).filter(element => 
            element.textContent.includes(searchText)
          );
          return result;
        }
      }
      return originalQuerySelectorAll.call(this, selector);
    } catch (e) {
      console.error("Error in selector:", selector, e);
      return originalQuerySelectorAll.call(this, selector);
    }
  };
})(document.querySelectorAll);

