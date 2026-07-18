(function () {
  function normalizePath(path) {
    var value = String(path || "");
    value = value.replace(/[?#].*$/, "");
    value = value.replace(/\/+$/, "");
    return value || "/";
  }

  function parseCssPixels(value) {
    var parsed = parseFloat(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Ignore storage write failures.
    }
  }

  function removeLocalStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      // Ignore storage write failures.
    }
  }

  function prefersReducedMotion() {
    try {
      return Boolean(
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (err) {
      return false;
    }
  }

  function stripGeneratedTitleSuffix(value) {
    var text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }
    var parts = text.split(" ");
    var trimCount = 0;
    var sawDigit = false;
    var sawLongToken = false;
    for (var i = parts.length - 1; i >= 0; i -= 1) {
      var token = String(parts[i] || "").replace(/[^A-Za-z0-9]/g, "");
      if (!token || !/^[0-9A-Fa-f]{1,6}$/.test(token)) {
        break;
      }
      trimCount += 1;
      sawDigit = sawDigit || /\d/.test(token);
      sawLongToken = sawLongToken || token.length >= 4;
    }
    if (trimCount >= 2 && (sawDigit || sawLongToken) && trimCount < parts.length) {
      return parts.slice(0, parts.length - trimCount).join(" ").trim();
    }
    return text;
  }

  function cleanGeneratedTopicLabels() {
    var nodes = document.querySelectorAll(
      ".article-branch-section a, .article-branch-link-short, .sidebar-link, .sidebar-toggle"
    );
    Array.prototype.forEach.call(nodes, function (node) {
      var original = String(node.textContent || "").replace(/\s+/g, " ").trim();
      var cleaned = stripGeneratedTitleSuffix(original);
      if (cleaned && cleaned !== original && node.childElementCount === 0) {
        node.textContent = cleaned;
      }
      ["title", "aria-label", "data-sidebar-search"].forEach(function (attr) {
        if (!node.hasAttribute || !node.hasAttribute(attr)) {
          return;
        }
        var attrValue = node.getAttribute(attr);
        var cleanedAttr = stripGeneratedTitleSuffix(attrValue);
        if (cleanedAttr && cleanedAttr !== attrValue) {
          node.setAttribute(attr, cleanedAttr);
        }
      });
    });
  }

  function isContentPageScrollResetEligible() {
    var body = document.body;
    if (!body || body.classList.contains("page-home")) {
      return false;
    }
    if (String(window.location.hash || "").trim()) {
      return false;
    }
    if (getSearchHighlightQueryFromUrl()) {
      return false;
    }
    return body.classList.contains("page-article") || Boolean(document.querySelector(".article-body"));
  }

  function initContentPageScrollReset() {
    if (!isContentPageScrollResetEligible()) {
      return;
    }
    // Fresh navigations naturally start at the top; forcing it here can
    // interrupt readers after slow-loading assets or bfcache restores.
  }

  function affiliateMerchantFromUrl(rawUrl) {
    var hostname = "";
    try {
      hostname = String(new URL(String(rawUrl || ""), window.location.href).hostname || "").toLowerCase();
    } catch (err) {
      return "";
    }
    if (hostname.indexOf("amazon.") !== -1 || hostname === "amzn.to") {
      return "amazon";
    }
    if (hostname.indexOf("ebay.") !== -1) {
      return "ebay";
    }
    if (hostname.indexOf("etsy.") !== -1) {
      return "etsy";
    }
    if (hostname.indexOf("temu.") !== -1) {
      return "temu";
    }
    return "";
  }

  function affiliatePlacementForLink(link) {
    if (!link || typeof link.closest !== "function") {
      return "unknown";
    }
    if (link.getAttribute("data-affiliate-placement")) {
      return String(link.getAttribute("data-affiliate-placement"));
    }
    if (link.closest("[data-ebay-listing-card]")) {
      return "listing_card";
    }
    if (link.closest(".fr-book-card")) {
      return "book_card";
    }
    if (link.closest(".merchant-card, .affiliate-card, [data-ebay-item-id]")) {
      return "marketplace_card";
    }
    if (link.closest(".further-reading-section")) {
      return "further_reading";
    }
    return "page_link";
  }

  function initAffiliateClickTracking() {
    document.addEventListener("click", function(event) {
      var target = event.target;
      var link = target && typeof target.closest === "function" ? target.closest("a[href]") : null;
      if (!link) {
        return;
      }
      var merchant = String(link.getAttribute("data-affiliate-merchant") || affiliateMerchantFromUrl(link.href));
      if (!merchant) {
        return;
      }
      var destination = null;
      try {
        destination = new URL(String(link.href || ""), window.location.href);
      } catch (err) {
        destination = null;
      }
      var section = link.closest("[data-ebay-experiment]");
      var detail = {
        affiliate_merchant: merchant,
        affiliate_placement: affiliatePlacementForLink(link),
        destination_host: destination ? String(destination.hostname || "") : "",
        destination_path: destination ? String(destination.pathname || "").slice(0, 160) : "",
        link_text: String(link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        ebay_card_kind: String(link.getAttribute("data-ebay-card-kind") || ""),
        ebay_card_position: String(link.getAttribute("data-ebay-card-position") || ""),
        experiment: section ? String(section.getAttribute("data-ebay-experiment") || "") : "",
        experiment_variant: section ? String(section.getAttribute("data-ebay-experiment-variant") || "") : ""
      };
      document.dispatchEvent(new CustomEvent("phoenix:affiliate-click", { detail: detail }));
      if (typeof window.gtag !== "function") {
        return;
      }
      window.gtag("event", "affiliate_click", Object.assign({}, detail, {
        transport_type: "beacon"
      }));
    });
  }

  function getUiString(name, fallback) {
    var attrName = "data-ui-" + String(name || "").replace(/_/g, "-");
    var body = document.body;
    var root = document.documentElement;
    var value = "";
    if (body && typeof body.getAttribute === "function") {
      value = String(body.getAttribute(attrName) || "").trim();
    }
    if (!value && root && typeof root.getAttribute === "function") {
      value = String(root.getAttribute(attrName) || "").trim();
    }
    return value || String(fallback || "");
  }

  function formatUiString(templateName, fallback, replacements) {
    var template = getUiString(templateName, fallback);
    return String(template || "").replace(/\{([a-z_]+)\}/gi, function (match, token) {
      if (!replacements || !Object.prototype.hasOwnProperty.call(replacements, token)) {
        return match;
      }
      return String(replacements[token] || "");
    });
  }

  function getAnchorOffsetPixels() {
    var root = document.documentElement;
    if (!root || !window.getComputedStyle) {
      return 0;
    }
    return parseCssPixels(window.getComputedStyle(root).getPropertyValue("--anchor-offset"));
  }

  function syncAnchorOffset() {
    var root = document.documentElement;
    var header = document.querySelector(".site-header");
    if (!root) {
      return 0;
    }
    if (!header || !window.getComputedStyle) {
      root.style.setProperty("--anchor-offset", "1rem");
      return 16;
    }

    var headerStyle = window.getComputedStyle(header);
    var isOverlayHeader = headerStyle && (headerStyle.position === "sticky" || headerStyle.position === "fixed");
    var headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
    var offsetPx = isOverlayHeader ? (headerHeight + 14) : 16;
    if (!Number.isFinite(offsetPx) || offsetPx < 16) {
      offsetPx = 16;
    }
    root.style.setProperty("--anchor-offset", String(offsetPx) + "px");
    return offsetPx;
  }

  function initAnchorOffsetSync() {
    syncAnchorOffset();
    window.addEventListener("resize", syncAnchorOffset);
    window.addEventListener("orientationchange", syncAnchorOffset);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(function () {
        syncAnchorOffset();
      }).catch(function () {
        // Ignore font load observer failures.
      });
    }
  }

  function markActiveSidebarLink() {
    var currentPath = normalizePath(window.location.pathname);
    var links = document.querySelectorAll(".sidebar-link, .sidebar-item a");
    Array.prototype.forEach.call(links, function (link) {
      var href = link.getAttribute("href");
      if (!href) {
        return;
      }
      var resolvedPath = "";
      try {
        resolvedPath = normalizePath(new URL(href, window.location.origin).pathname);
      } catch (err) {
        resolvedPath = normalizePath(href);
      }
      if (resolvedPath === currentPath) {
        link.classList.add("is-current");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function setSidebarItemExpanded(item, expanded) {
    if (!item || !item.classList || !item.classList.contains("has-children")) {
      return;
    }
    var findSidebarDirectChild = function (className) {
      if (!item || !item.children) {
        return null;
      }
      for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
        var child = item.children[childIndex];
        if (child && child.classList && child.classList.contains(className)) {
          return child;
        }
      }
      return null;
    };
    var isLockedOpen = item.hasAttribute("data-sidebar-lock-open");
    var toggle = findSidebarDirectChild("sidebar-toggle");
    var link = findSidebarDirectChild("sidebar-link");
    var label = String((link && (link.getAttribute("title") || link.textContent)) || "section").trim();
    var isExpanded = isLockedOpen ? true : Boolean(expanded);
    item.classList.toggle("is-collapsed", !isExpanded);
    item.classList.toggle("is-expanded", isExpanded);
    if (toggle) {
      toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      toggle.textContent = isExpanded ? "-" : "+";
      toggle.setAttribute("title", isExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section"));
      toggle.setAttribute("aria-label", (isExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section")) + ": " + label);
    }
  }

  function getRootSidebarNavs() {
    var navs = document.querySelectorAll("[data-sidebar-nav]");
    return Array.prototype.filter.call(navs, function (nav) {
      return !nav.parentElement || !nav.parentElement.closest("[data-sidebar-nav]");
    });
  }

  function initSidebarCollapsingForNav(nav) {
    if (!nav) {
      return;
    }
    var sidebarRoot = nav.closest(".sidebar") || nav.parentElement || document;

    /* Auto-collapse sidebar L3+ when tree has >20 items */
    var allSidebarItems = nav.querySelectorAll(".sidebar-item[data-sidebar-level]");
    if (allSidebarItems.length > 20) {
      for (var si = 0; si < allSidebarItems.length; si++) {
        var lvl = parseInt(allSidebarItems[si].getAttribute("data-sidebar-level") || "1", 10);
        if (lvl >= 3 && allSidebarItems[si].classList.contains("is-expanded")) {
          setSidebarItemExpanded(allSidebarItems[si], false);
        }
      }
    }

    var items = nav.querySelectorAll(".sidebar-item.has-children");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var storageKey = "phoenix-sidebar-expanded-v2-" + siteScope;
    var persistedState = {};
    try {
      var rawPersisted = String(readLocalStorage(storageKey) || "").trim();
      if (rawPersisted) {
        var parsedPersisted = JSON.parse(rawPersisted);
        if (parsedPersisted && typeof parsedPersisted === "object") {
          persistedState = parsedPersisted;
        }
      }
    } catch (err) {
      persistedState = {};
    }

    var getItemStorageKey = function (item) {
      if (!item) {
        return "";
      }
      var link = null;
      if (item.children) {
        for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          var child = item.children[childIndex];
          if (child && child.classList && child.classList.contains("sidebar-link")) {
            link = child;
            break;
          }
        }
      }
      var href = String((link && link.getAttribute("href")) || "").trim();
      if (href) {
        try {
          return normalizePath(new URL(href, window.location.origin).pathname);
        } catch (err) {
          return normalizePath(href);
        }
      }
      var label = String((link && (link.getAttribute("title") || link.textContent)) || "").trim().toLowerCase();
      if (label) {
        return "label:" + label.replace(/\s+/g, " ");
      }
      return "";
    };

    var savePersistedState = function () {
      try {
        writeLocalStorage(storageKey, JSON.stringify(persistedState));
      } catch (err) {
        // Ignore serialization/storage failures.
      }
    };

    var setExpandedWithPersistence = function (item, expanded, persistChoice) {
      setSidebarItemExpanded(item, expanded);
      if (!persistChoice) {
        return;
      }
      if (item && item.hasAttribute && item.hasAttribute("data-sidebar-lock-open")) {
        return;
      }
      var key = getItemStorageKey(item);
      if (!key) {
        return;
      }
      persistedState[key] = expanded ? 1 : 0;
      savePersistedState();
    };

    var setAllExpandedWithPersistence = function (expanded, persistChoice) {
      Array.prototype.forEach.call(items, function (item) {
        setExpandedWithPersistence(item, expanded, persistChoice);
      });
      updateBulkActionState();
    };

    var controlsRoot = nav.parentElement || sidebarRoot;
    var bulkActionTopThreshold = 10;
    var actionsRoots = controlsRoot.querySelectorAll(".sidebar-tree-actions");
    var expandAllButtons = controlsRoot.querySelectorAll("[data-sidebar-expand-all]");
    var collapseAllButtons = controlsRoot.querySelectorAll("[data-sidebar-collapse-all]");
    var showTopBulkActions = nav.querySelectorAll(".sidebar-link").length > bulkActionTopThreshold;
    var actionableItems = Array.prototype.filter.call(items, function (item) {
      return !(item && item.hasAttribute && item.hasAttribute("data-sidebar-lock-open"));
    });
    var hasFlexibleExpansion = actionableItems.length > 0;
    var updateBulkActionButtons = function (buttons, isActive) {
      if (!buttons || !buttons.length) {
        return;
      }
      Array.prototype.forEach.call(buttons, function (button) {
        if (!button) {
          return;
        }
        button.classList.toggle("is-active", Boolean(isActive));
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    };
    var updateBulkActionState = function () {
      if (!hasFlexibleExpansion) {
        return;
      }
      var allExpanded = actionableItems.every(function (item) {
        return item && !item.classList.contains("is-collapsed");
      });
      var allCollapsed = actionableItems.every(function (item) {
        return item && item.classList.contains("is-collapsed");
      });
      updateBulkActionButtons(expandAllButtons, allExpanded);
      updateBulkActionButtons(collapseAllButtons, allCollapsed);
    };

    var getSidebarLevel = function (item) {
      var parsed = parseInt(String((item && item.getAttribute("data-sidebar-level")) || "1"), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    };

    var expandCurrentBranch = function (currentLink) {
      if (!currentLink) {
        return;
      }
      var currentItem = currentLink.closest(".sidebar-item");
      while (currentItem) {
        if (currentItem.classList.contains("has-children")) {
          setExpandedWithPersistence(currentItem, true, false);
        }
        var parentList = currentItem.parentElement;
        currentItem = parentList ? parentList.closest(".sidebar-item") : null;
      }
    };

    var scrollSidebarToCurrent = function (currentLink) {
      if (!currentLink || !currentLink.getBoundingClientRect) {
        return;
      }
      var scrollHost = currentLink.closest(".sidebar-scroll-region") || nav.closest(".sidebar");
      if (!scrollHost || !scrollHost.getBoundingClientRect) {
        return;
      }
      var hostRect = scrollHost.getBoundingClientRect();
      var linkRect = currentLink.getBoundingClientRect();
      var pad = Math.max(24, Math.round(scrollHost.clientHeight * 0.16));
      var upperBound = hostRect.top + pad;
      var lowerBound = hostRect.bottom - pad;
      if (linkRect.top >= upperBound && linkRect.bottom <= lowerBound) {
        return;
      }
      var delta = (linkRect.top - hostRect.top) - Math.round(scrollHost.clientHeight * 0.32);
      scrollHost.scrollTop = Math.max(0, scrollHost.scrollTop + delta);
      if (typeof currentLink.scrollIntoView === "function") {
        try {
          currentLink.scrollIntoView({ block: "center", inline: "nearest" });
        } catch (err) {
          // Ignore unsupported scrollIntoView options.
        }
      }
    };

    var expandLevelTwoWhenTopLevelSparse = function () {
      var topLevelVisible = nav.querySelectorAll('.sidebar-item[data-sidebar-level="1"]:not(.is-filtered-out)');
      if (topLevelVisible.length >= 3) {
        return;
      }
      Array.prototype.forEach.call(items, function (item) {
        if (getSidebarLevel(item) === 1) {
          setExpandedWithPersistence(item, true, false);
        }
      });
    };

    Array.prototype.forEach.call(items, function (item) {
      var key = getItemStorageKey(item);
      var storedToken = key ? persistedState[key] : null;
      var hasStoredState = storedToken === 0 || storedToken === 1 || storedToken === true || storedToken === false;
      var initialExpanded = item.hasAttribute("data-sidebar-lock-open")
        ? true
        : (hasStoredState ? (storedToken === 1 || storedToken === true) : !item.classList.contains("is-collapsed"));
      setSidebarItemExpanded(item, initialExpanded);
      var toggle = null;
      if (item.children) {
        for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          var child = item.children[childIndex];
          if (child && child.classList && child.classList.contains("sidebar-toggle")) {
            toggle = child;
            break;
          }
        }
      }
      if (!toggle) {
        return;
      }
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        var shouldExpand = item.classList.contains("is-collapsed");
        setExpandedWithPersistence(item, shouldExpand, true);
        updateBulkActionState();
      });
    });

    var currentLink = nav.querySelector(".sidebar-link.is-current");
    if (currentLink) {
      expandCurrentBranch(currentLink);
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(function () {
          scrollSidebarToCurrent(currentLink);
          window.setTimeout(function () {
            scrollSidebarToCurrent(currentLink);
          }, 120);
        });
      } else {
        scrollSidebarToCurrent(currentLink);
      }
    }

    Array.prototype.forEach.call(actionsRoots, function (actionsRoot) {
      var isTopActions = actionsRoot && actionsRoot.hasAttribute("data-sidebar-tree-actions-top");
      actionsRoot.hidden = !hasFlexibleExpansion || (isTopActions && !showTopBulkActions);
    });
    Array.prototype.forEach.call(expandAllButtons, function (button) {
      button.hidden = !hasFlexibleExpansion;
      button.disabled = !hasFlexibleExpansion;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        setAllExpandedWithPersistence(true, true);
      });
    });

    Array.prototype.forEach.call(collapseAllButtons, function (button) {
      button.hidden = !hasFlexibleExpansion;
      button.disabled = !hasFlexibleExpansion;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        setAllExpandedWithPersistence(false, true);
      });
    });
    updateBulkActionState();
  }

  function initSidebarCollapsing() {
    var navs = getRootSidebarNavs();
    if (!navs.length) {
      return;
    }
    Array.prototype.forEach.call(navs, function (nav) {
      initSidebarCollapsingForNav(nav);
    });
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getSearchTokens(value) {
    var normalized = normalizeSearchText(value);
    return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
  }

  function matchesNormalizedSearchQuery(normalizedQuery, normalizedHaystack, haystackTokens) {
    if (!normalizedQuery) {
      return true;
    }
    if (!normalizedHaystack) {
      return false;
    }
    if (normalizedHaystack.indexOf(normalizedQuery) !== -1) {
      return true;
    }

    var queryTokens = getSearchTokens(normalizedQuery);
    var targetTokens = haystackTokens && haystackTokens.length ? haystackTokens : getSearchTokens(normalizedHaystack);
    if (!queryTokens.length || !targetTokens.length) {
      return false;
    }

    return queryTokens.every(function (queryToken) {
      return targetTokens.some(function (haystackToken) {
        if (haystackToken === queryToken || haystackToken.indexOf(queryToken) === 0) {
          return true;
        }
        if (queryToken.length >= 4 && haystackToken.indexOf(queryToken) !== -1) {
          return true;
        }
        if (haystackToken.length >= 4 && queryToken.indexOf(haystackToken) === 0) {
          return true;
        }
        return false;
      });
    });
  }

  function matchesSearchQuery(query, haystack) {
    return matchesNormalizedSearchQuery(normalizeSearchText(query), normalizeSearchText(haystack), null);
  }

  var liveSearchRenderDelayMs = 180;
  var searchPageResultRenderLimit = 60;
  var searchPageBackToTopThreshold = 24;

  function createSearchRenderScheduler(renderNow, options) {
    var settings = options || {};
    var delayMs = Number(settings.delayMs || liveSearchRenderDelayMs) || liveSearchRenderDelayMs;
    var pendingTimer = 0;
    var cancel = function () {
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        pendingTimer = 0;
      }
    };
    return {
      schedule: function (renderOptions) {
        cancel();
        if (settings.shouldRenderImmediately && settings.shouldRenderImmediately(renderOptions)) {
          renderNow(renderOptions || {});
          return;
        }
        if (settings.onPending) {
          settings.onPending(renderOptions || {});
        }
        pendingTimer = window.setTimeout(function () {
          pendingTimer = 0;
          renderNow(settings.getDelayedOptions ? settings.getDelayedOptions(renderOptions || {}) : (renderOptions || {}));
        }, delayMs);
      },
      flush: function (renderOptions) {
        cancel();
        renderNow(renderOptions || {});
      },
      cancel: cancel
    };
  }

  function initSidebarFilterForNav(nav) {
    if (!nav) {
      return;
    }
    var sidebarRoot = nav.closest(".sidebar") || nav.parentElement || document;
    var input = sidebarRoot.querySelector("[data-sidebar-filter]");
    var status = sidebarRoot.querySelector("[data-sidebar-filter-status]");
    var clearButton = sidebarRoot.querySelector("[data-sidebar-filter-clear]");
    var resultsContainer = sidebarRoot.querySelector("[data-sidebar-filter-results]");
    var tabs = sidebarRoot.querySelector("[data-sidebar-search-tabs]");
    if (!input) {
      return;
    }
    var activeSearchMode = "all";
    var preparedPages = null;
    var preparedPagesIsFallback = false;
    var currentPageSections = null;
    var latestRanked = [];
    var hasThisPageSearch = !!document.querySelector(".article-body") && !(document.body && document.body.classList.contains("page-home"));
    var refreshAllPageResultsAfterIndexLoad = function (queryAtRequestTime) {
      if (activeSearchMode === "page") {
        return;
      }
      loadSiteSearchIndex().then(function () {
        preparedPages = null;
        preparedPagesIsFallback = false;
        if (String(input.value || "").trim() === String(queryAtRequestTime || "").trim()) {
          applyFilter();
        }
      }).catch(function () {
        // Keep using the local fallback records when the full index is unavailable.
      });
    };
    var syncSidebarSearchTabs = function () {
      if (!tabs) {
        return;
      }
      tabs.setAttribute("data-single-tab", hasThisPageSearch ? "false" : "true");
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-sidebar-search-tab]"), function (tab) {
        var mode = tab.getAttribute("data-sidebar-search-tab") === "page" ? "page" : "all";
        var isAvailable = mode !== "page" || hasThisPageSearch;
        var selected = mode === activeSearchMode && isAvailable;
        tab.hidden = !isAvailable;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
    };
    var syncSidebarSearchPlaceholder = function () {
      if (!input) {
        return;
      }
      input.setAttribute("placeholder", activeSearchMode === "page"
        ? (getUiString("search-this-page", "Search this page") + "...")
        : getUiString("search-site-placeholder", "Search title, summary, or page text..."));
    };
    var renderSidebarSearchResult = function (record, query, mode, hitCount) {
      var href = buildUrlWithSearchHighlight(record.url || "#", query);
      var title = mode === "page" ? (record.sectionTitle || getUiString("overview", "Overview")) : record.title;
      var kicker = mode === "page"
        ? [record.sectionNumber ? ("Section " + record.sectionNumber) : "", record.sectionTitle || ""].filter(Boolean).join(" - ")
        : (record.breadcrumb || getUiString("search-kind-page-location", "Page"));
      var snippetSource = mode === "page"
        ? [record.sectionTitle, record.text].filter(Boolean).join(" ")
        : [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
      var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
      var hitCountPill = mode !== "page" && numericHitCount > 0
        ? '<span class="sidebar-filter-result-hit-count">' + escapeHtml(numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits") + "</span>"
        : "";
      return ''
        + '<a class="sidebar-filter-result-item" href="' + escapeHtml(href) + '">'
        + '<span class="sidebar-filter-result-kicker">' + escapeHtml(kicker || getUiString("overview", "Overview")) + "</span>"
        + '<span class="sidebar-filter-result-title">' + escapeHtml(title || getUiString("overview", "Overview")) + "</span>"
        + hitCountPill
        + '<span class="sidebar-filter-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 140) + "</span>"
        + "</a>";
    };
    var renderResults = function (ranked, query) {
      if (!resultsContainer) {
        return;
      }
      if (!query) {
        resultsContainer.hidden = true;
        resultsContainer.innerHTML = "";
        return;
      }
      resultsContainer.hidden = false;
      if (!ranked.length) {
        var emptyResult = activeSearchMode === "page"
          ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
          : getUiString("no-search-results", "No pages match this search.");
        resultsContainer.innerHTML = '<p class="sidebar-filter-empty">' + escapeHtml(emptyResult) + "</p>";
        return;
      }
      resultsContainer.innerHTML = ranked.slice(0, 8).map(function (item) {
        return renderSidebarSearchResult(item.page, query, activeSearchMode, item.hitCount);
      }).join("");
    };
    var applyFilter = function () {
      if (activeSearchMode === "page" && !hasThisPageSearch) {
        activeSearchMode = "all";
      }
      syncSidebarSearchTabs();
      syncSidebarSearchPlaceholder();
      var query = String(input.value || "").trim();
      if (!query) {
        latestRanked = [];
        renderResults([], "");
        if (status) {
          status.setAttribute("data-state", "default");
          status.textContent = "";
        }
        if (clearButton) {
          clearButton.hidden = true;
        }
        return;
      }
      if (activeSearchMode !== "page" && (!preparedPages || (preparedPagesIsFallback && isSiteSearchIndexLoaded()))) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (activeSearchMode !== "page" && preparedPagesIsFallback) {
        refreshAllPageResultsAfterIndexLoad(query);
      }
      if (!preparedPages) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (!currentPageSections) {
        currentPageSections = getCurrentPageSearchSections();
      }
      var source = activeSearchMode === "page" ? currentPageSections : preparedPages;
      var ranked = rankSearchRecords(source, query, activeSearchMode);
      latestRanked = ranked;
      renderResults(ranked, query);
      if (status) {
        if (!ranked.length) {
          status.setAttribute("data-state", "empty");
          status.textContent = activeSearchMode === "page"
            ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
            : getUiString("no-search-results", "No pages match this search.");
        } else {
          status.setAttribute("data-state", "active");
          status.textContent = formatUiString("search-results-count-template", "{count} results", {
            count: String(ranked.length)
          });
        }
      }
      if (clearButton) {
        clearButton.hidden = false;
      }
    };
    var scheduledApplyFilter = createSearchRenderScheduler(applyFilter, {
      shouldRenderImmediately: function () {
        return !String(input.value || "").trim();
      },
      onPending: function () {
        if (status && String(input.value || "").trim()) {
          status.setAttribute("data-state", "active");
          status.textContent = "Searching...";
        }
      }
    });
    input.addEventListener("focus", function () {
      if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
        refreshAllPageResultsAfterIndexLoad(input.value);
      }
    });
    input.addEventListener("input", function () {
      scheduledApplyFilter.schedule();
    });
    input.addEventListener("keydown", function (event) {
      var key = String(event.key || "");
      if (key === "Enter" && String(input.value || "").trim()) {
        event.preventDefault();
        scheduledApplyFilter.flush();
        if (activeSearchMode === "page" && latestRanked.length) {
          window.location.href = buildUrlWithSearchHighlight(latestRanked[0].page.url || window.location.href, input.value);
        } else {
          navigateToSearchResultsPage(input.value);
        }
        return;
      }
      if (key === "Escape" && String(input.value || "").trim()) {
        input.value = "";
        scheduledApplyFilter.flush();
        input.focus();
      }
    });
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        input.value = "";
        scheduledApplyFilter.flush();
        input.focus();
      });
    }
    if (tabs) {
      tabs.addEventListener("click", function (event) {
        var tab = event.target && event.target.closest ? event.target.closest("[data-sidebar-search-tab]") : null;
        if (!tab || tab.hidden) {
          return;
        }
        activeSearchMode = tab.getAttribute("data-sidebar-search-tab") === "page" ? "page" : "all";
        if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
          refreshAllPageResultsAfterIndexLoad(input.value);
        }
        scheduledApplyFilter.flush();
        input.focus();
      });
    }
    applyFilter();
  }

  function initSidebarFilter() {
    var navs = getRootSidebarNavs();
    if (!navs.length) {
      return;
    }
    Array.prototype.forEach.call(navs, function (nav) {
      initSidebarFilterForNav(nav);
    });
  }

  function initMobileSidebarMode() {
    var root = document.documentElement;
    var sidebar = document.querySelector("[data-mobile-sidebar-panel]");
    var openButtons = document.querySelectorAll("[data-mobile-sidebar-open]");
    var closeButtons = document.querySelectorAll("[data-mobile-sidebar-close]");
    if (!root || !sidebar || !openButtons.length) {
      return;
    }

    var sidebarMode = String(root.getAttribute("data-mobile-sidebar") || "static").toLowerCase();
    if (sidebarMode !== "collapsible") {
      return;
    }

    var defaultState = String(root.getAttribute("data-mobile-sidebar-default") || "closed").toLowerCase();
    var isOpen = defaultState === "open";
    var presentationMode = "contents";
    var titleNodes = sidebar.querySelectorAll(".mobile-sidebar-title, .sidebar-section-title");
    var presentationCloseButtons = sidebar.querySelectorAll("[data-mobile-sidebar-close], [data-sidebar-hide='right']");

    var getPresentationTitle = function (mode) {
      if (mode === "search") {
        return getUiString("search-panel-title", getUiString("search", "Search"));
      }
      return getUiString("website-contents", getUiString("contents", "Contents"));
    };

    var getTriggerLabel = function (mode) {
      if (mode === "search") {
        return getUiString("search", "Search");
      }
      return getUiString("contents", "Contents");
    };

    var getOpenLabel = function (mode) {
      if (mode === "search") {
        return getUiString("open-search", "Open search");
      }
      return getUiString("open-contents", "Open contents");
    };

    var getCloseLabel = function (mode) {
      if (mode === "search") {
        return getUiString("close-search", "Close search");
      }
      return getUiString("close-contents", "Close contents");
    };

    var applyPresentation = function (mode) {
      presentationMode = mode === "search" ? "search" : "contents";
      sidebar.setAttribute("data-mobile-sidebar-view", presentationMode);
      Array.prototype.forEach.call(titleNodes, function (node) {
        node.textContent = getPresentationTitle(presentationMode);
      });
      Array.prototype.forEach.call(presentationCloseButtons, function (button) {
        button.setAttribute("aria-label", getCloseLabel(presentationMode));
      });
    };

    Array.prototype.forEach.call(openButtons, function (button) {
      if (!button.hasAttribute("data-mobile-sidebar-label")) {
        button.setAttribute(
          "data-mobile-sidebar-label",
          String(button.textContent || "").trim() || getUiString("contents", "Contents")
        );
      }
    });

    var applyState = function (nextOpen) {
      isOpen = Boolean(nextOpen);
      if (!isOpen) {
        applyPresentation("contents");
      }
      document.body.classList.toggle("mobile-sidebar-open", isOpen);
      Array.prototype.forEach.call(openButtons, function (button) {
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.setAttribute("aria-label", isOpen ? getCloseLabel(presentationMode) : getOpenLabel(presentationMode));
        button.textContent = isOpen
          ? getTriggerLabel(presentationMode)
          : (button.getAttribute("data-mobile-sidebar-label") || getUiString("contents", "Contents"));
      });
    };

    Array.prototype.forEach.call(openButtons, function (button) {
      button.addEventListener("click", function () {
        if (!isOpen) {
          applyPresentation("contents");
        }
        applyState(!isOpen);
      });
    });

    Array.prototype.forEach.call(closeButtons, function (button) {
      button.addEventListener("click", function () {
        applyState(false);
      });
    });

    Array.prototype.forEach.call(sidebar.querySelectorAll(".sidebar-link"), function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia && window.matchMedia("(max-width: 980px)").matches) {
          applyState(false);
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (String(event.key || "") === "Escape") {
        applyState(false);
      }
    });

    document.body.__phoenixMobileSidebar = {
      isOpen: function () {
        return isOpen;
      },
      setOpen: function (nextOpen) {
        applyState(nextOpen);
      },
      setPresentation: function (mode) {
        applyPresentation(mode);
        if (isOpen) {
          applyState(true);
        }
      }
    };

    applyPresentation("contents");
    applyState(isOpen);
  }

  function initMobileQuickNav() {
    var quickSearchButtons = document.querySelectorAll("[data-quick-search]:not([data-site-search-open])");
    if (!quickSearchButtons.length) {
      return;
    }

    var focusSearchInput = function () {
      var sidebarFilter = document.querySelector("[data-sidebar-filter]");
      if (sidebarFilter && typeof sidebarFilter.focus === "function") {
        sidebarFilter.focus();
        if (typeof sidebarFilter.select === "function") {
          sidebarFilter.select();
        }
        return;
      }
      var homeFilter = document.querySelector("[data-home-filter]");
      if (homeFilter && typeof homeFilter.focus === "function") {
        homeFilter.focus();
      }
    };

    Array.prototype.forEach.call(quickSearchButtons, function (button) {
      button.addEventListener("click", function () {
        var sidebarController = document.body.__phoenixMobileSidebar || null;
        var openButton = document.querySelector("[data-mobile-sidebar-open]");
        var isMobile = Boolean(window.matchMedia && window.matchMedia("(max-width: 980px)").matches);
        var shouldOpenSidebar = Boolean(
          openButton
          && isMobile
          && (
            sidebarController
              ? !sidebarController.isOpen()
              : String(openButton.getAttribute("aria-expanded") || "false") !== "true"
          )
        );
        if (sidebarController && isMobile) {
          sidebarController.setPresentation("search");
        }
        if (shouldOpenSidebar) {
          if (sidebarController) {
            sidebarController.setOpen(true);
          } else {
            openButton.click();
          }
          window.setTimeout(focusSearchInput, 160);
          return;
        }
        focusSearchInput();
      });
    });
  }

  function getSiteBaseUrl() {
    var body = document.body;
    var root = document.documentElement;
    var rawBase = "";
    if (body && typeof body.getAttribute === "function") {
      rawBase = String(body.getAttribute("data-site-baseurl") || "").trim();
    }
    if (!rawBase && root && typeof root.getAttribute === "function") {
      rawBase = String(root.getAttribute("data-site-baseurl") || "").trim();
    }
    if (!rawBase || rawBase === "/") {
      return "";
    }
    if (rawBase.charAt(0) !== "/") {
      rawBase = "/" + rawBase;
    }
    return rawBase.replace(/\/+$/, "");
  }

  var siteSearchIndexPromise = null;

  function getUiBundleVersion() {
    var body = document.body;
    var root = document.documentElement;
    var version = "";
    if (body && typeof body.getAttribute === "function") {
      version = String(body.getAttribute("data-ui-bundle-version") || "").trim();
    }
    if (!version && root && typeof root.getAttribute === "function") {
      version = String(root.getAttribute("data-ui-bundle-version") || "").trim();
    }
    return version || "1";
  }

  function isSiteSearchIndexLoaded() {
    return Boolean(window.PhoenixSiteSearchIndex);
  }

  function loadSiteSearchIndex() {
    if (window.PhoenixSiteSearchIndex) {
      return Promise.resolve(window.PhoenixSiteSearchIndex);
    }
    if (siteSearchIndexPromise) {
      return siteSearchIndexPromise;
    }
    siteSearchIndexPromise = new Promise(function (resolve, reject) {
      var existingScript = document.querySelector('script[data-site-search-index-loader="true"]');
      if (existingScript) {
        existingScript.parentNode.removeChild(existingScript);
      }
      var script = document.createElement("script");
      script.async = true;
      script.setAttribute("data-site-search-index-loader", "true");
      script.src = getSiteBaseUrl() + "/assets/js/search-index.js?v=" + encodeURIComponent(getUiBundleVersion());
      script.onload = function () {
        if (window.PhoenixSiteSearchIndex) {
          resolve(window.PhoenixSiteSearchIndex);
          return;
        }
        siteSearchIndexPromise = null;
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("PhoenixSiteSearchIndex failed to populate."));
      };
      script.onerror = function () {
        siteSearchIndexPromise = null;
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("Unable to load search index."));
      };
      document.head.appendChild(script);
    });
    return siteSearchIndexPromise;
  }

  function resolveSiteSearchUrl(rawUrl) {
    var url = String(rawUrl || "").trim();
    if (!url) {
      return "#";
    }
    if (/^(?:https?:)?\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) {
      return url;
    }
    if (url.charAt(0) !== "/") {
      return url;
    }
    var baseUrl = getSiteBaseUrl();
    if (baseUrl && url !== baseUrl && url.indexOf(baseUrl + "/") !== 0) {
      return baseUrl + url;
    }
    return url;
  }

  function getSearchResultsPageUrl(query) {
    var baseUrl = getSiteBaseUrl();
    var path = (baseUrl || "") + "/search/";
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return path;
    }
    return path + "?q=" + encodeURIComponent(trimmedQuery);
  }

  function getSearchHighlightQueryFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return String(params.get("search_highlight") || "").trim();
    } catch (err) {
      return "";
    }
  }

  function buildUrlWithSearchHighlight(rawUrl, query) {
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return rawUrl || "#";
    }
    try {
      var parsed = new URL(String(rawUrl || "#"), window.location.href);
      parsed.searchParams.set("search_highlight", trimmedQuery);
      if (parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
      return parsed.href;
    } catch (err) {
      var joiner = String(rawUrl || "").indexOf("?") === -1 ? "?" : "&";
      return String(rawUrl || "#") + joiner + "search_highlight=" + encodeURIComponent(trimmedQuery);
    }
  }

  function navigateToSearchResultsPage(query) {
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return false;
    }
    window.location.href = getSearchResultsPageUrl(trimmedQuery);
    return true;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function collapseSearchText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function trimSearchText(value, maxChars) {
    var text = collapseSearchText(value);
    var limit = Math.max(20, Number(maxChars || 180));
    if (text.length <= limit) {
      return text;
    }
    return text.slice(0, limit - 1).replace(/\s+\S*$/, "") + "...";
  }

  function findFirstSearchMatch(text, query) {
    var normalizedText = String(text || "").toLowerCase();
    var tokens = getSearchTokens(query);
    var best = null;
    Array.prototype.forEach.call(tokens, function (token) {
      if (!token || token.length < 2) {
        return;
      }
      var index = normalizedText.indexOf(token);
      if (index !== -1 && (!best || index < best.index)) {
        best = { index: index, length: token.length };
      }
    });
    return best;
  }

  function buildHighlightedSnippet(text, query, maxChars) {
    var source = collapseSearchText(text);
    if (!source) {
      return "";
    }
    var match = findFirstSearchMatch(source, query);
    var limit = Math.max(80, Number(maxChars || 220));
    var snippet = source;
    var offset = 0;
    if (match) {
      var start = Math.max(0, match.index - 72);
      var end = Math.min(source.length, match.index + 150);
      snippet = source.slice(start, end).trim();
      offset = match.index - start;
      if (start > 0) {
        snippet = "... " + snippet;
        offset += 4;
      }
      if (end < source.length) {
        snippet += " ...";
      }
    }
    snippet = trimSearchText(snippet, limit);
    if (!match || offset < 0 || offset >= snippet.length) {
      return escapeHtml(snippet);
    }
    var matchedText = snippet.slice(offset, offset + match.length);
    return escapeHtml(snippet.slice(0, offset))
      + '<mark class="site-search-highlight">' + escapeHtml(matchedText) + "</mark>"
      + escapeHtml(snippet.slice(offset + match.length));
  }

  function getSearchMatchKind(record, query) {
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery || !record) {
      return getUiString("search-kind-relevant-snippet", "Relevant snippet");
    }
    var fields = [
      ["title", getUiString("search-kind-page-title", "Page title")],
      ["description", getUiString("search-kind-page-summary", "Summary of page")],
      ["breadcrumb", getUiString("search-kind-page-location", "Page location")],
      ["sectionTitle", getUiString("search-kind-section-title", "Section title")],
      ["text", getUiString("search-kind-relevant-snippet", "Relevant snippet")]
    ];
    for (var i = 0; i < fields.length; i += 1) {
      if (normalizeSearchText(record[fields[i][0]] || "").indexOf(normalizedQuery) !== -1) {
        return fields[i][1];
      }
    }
    return getUiString("search-kind-relevant-snippet", "Relevant snippet");
  }

  function getSiteSearchIndexPages() {
    var payload = window.PhoenixSiteSearchIndex || null;
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.pages)) {
      return payload.pages;
    }
    return [];
  }

  function collectSiteSearchFallbackPages() {
    var pages = [];
    var seen = Object.create(null);
    var links = document.querySelectorAll("a.sidebar-link, a.topics-menu-link, .topic-card a[href]");
    Array.prototype.forEach.call(links, function (link) {
      var href = String(link.getAttribute("href") || "").trim();
      if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) {
        return;
      }
      var title = collapseSearchText(link.getAttribute("title") || link.textContent || "");
      if (!title) {
        return;
      }
      var normalizedUrl = href;
      try {
        var parsed = new URL(href, window.location.href);
        normalizedUrl = parsed.origin === window.location.origin
          ? (parsed.pathname + parsed.search + parsed.hash)
          : parsed.href;
      } catch (err) {
        normalizedUrl = href;
      }
      var key = normalizePath(normalizedUrl);
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var card = link.closest ? link.closest(".topic-card") : null;
      var descriptionNode = card ? card.querySelector(".topic-card-summary, .home-cluster-node-summary") : null;
      pages.push({
        title: title,
        url: normalizedUrl,
        description: collapseSearchText(descriptionNode ? descriptionNode.textContent : ""),
        breadcrumb: "",
        text: collapseSearchText((card && card.getAttribute("data-card-search")) || title)
      });
    });
    return pages;
  }

  function prepareSiteSearchPages(sourcePages) {
    sourcePages = sourcePages || getSiteSearchIndexPages();
    if (!sourcePages.length) {
      sourcePages = collectSiteSearchFallbackPages();
    }
    var seen = Object.create(null);
    var prepared = [];
    Array.prototype.forEach.call(sourcePages, function (page, index) {
      if (!page || typeof page !== "object") {
        return;
      }
      var title = collapseSearchText(page.title || page.display_title || page.nav_title || "");
      var url = resolveSiteSearchUrl(page.url || page.permalink || "");
      if (!title || !url || url === "#") {
        return;
      }
      var key = normalizePath(url);
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var description = trimSearchText(page.description || page.summary || page.hero_summary || "", 260);
      var breadcrumb = collapseSearchText(page.breadcrumb || page.section || page.parent_title || "");
      var text = collapseSearchText(page.text || page.search_text || page.body || "");
      var searchBlob = collapseSearchText([title, breadcrumb, description, text].join(" "));
      var normalizedSearchBlob = normalizeSearchText(searchBlob);
      prepared.push({
        title: title,
        url: url,
        description: description,
        breadcrumb: breadcrumb,
        text: text,
        level: Number(page.level || 0) || 0,
        _index: index,
        _searchBlob: searchBlob,
        _searchBlobNormalized: normalizedSearchBlob,
        _searchTokens: normalizedSearchBlob ? normalizedSearchBlob.split(/\s+/).filter(Boolean) : [],
        _searchTitle: normalizeSearchText(title),
        _searchDescription: normalizeSearchText(description),
        _searchBreadcrumb: normalizeSearchText(breadcrumb),
        _searchText: normalizeSearchText(text)
      });
    });
    return prepared;
  }

  function scoreSiteSearchPage(page, query) {
    if (!page) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return Math.max(1, 20 - Math.max(0, Number(page.level || 0))) - (page._index || 0) / 1000;
    }
    if (!matchesNormalizedSearchQuery(normalizedQuery, page._searchBlobNormalized || normalizeSearchText(page._searchBlob || ""), page._searchTokens)) {
      return 0;
    }
    var title = page._searchTitle || normalizeSearchText(page.title);
    var description = page._searchDescription || normalizeSearchText(page.description);
    var breadcrumb = page._searchBreadcrumb || normalizeSearchText(page.breadcrumb);
    var body = page._searchText || normalizeSearchText(page.text);
    var score = 1;
    if (title === normalizedQuery) {
      score += 100;
    } else if (title.indexOf(normalizedQuery) !== -1) {
      score += 70;
    }
    if (description.indexOf(normalizedQuery) !== -1) {
      score += 28;
    }
    if (breadcrumb.indexOf(normalizedQuery) !== -1) {
      score += 18;
    }
    if (body.indexOf(normalizedQuery) !== -1) {
      score += 10;
    }
    Array.prototype.forEach.call(getSearchTokens(normalizedQuery), function (token) {
      if (!token) {
        return;
      }
      if (title.indexOf(token) !== -1) {
        score += 12;
      }
      if (description.indexOf(token) !== -1) {
        score += 5;
      }
      if (breadcrumb.indexOf(token) !== -1) {
        score += 4;
      }
      if (body.indexOf(token) !== -1) {
        score += 1;
      }
    });
    score += Math.max(0, 8 - Math.max(0, Number(page.level || 0)));
    score -= (page._index || 0) / 10000;
    return score;
  }

  function countSearchPageHits(page, query) {
    if (!page) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return 0;
    }
    var normalizedBlob = page._searchBlobNormalized || normalizeSearchText(page._searchBlob || "");
    if (!normalizedBlob) {
      return 0;
    }
    var tokens = getSearchTokens(normalizedQuery);
    if (!tokens.length) {
      return 0;
    }
    if (tokens.length > 1 && normalizedBlob.indexOf(normalizedQuery) !== -1) {
      var phraseCount = 0;
      var searchFrom = 0;
      var phraseIndex = normalizedBlob.indexOf(normalizedQuery, searchFrom);
      while (phraseIndex !== -1) {
        phraseCount += 1;
        searchFrom = phraseIndex + normalizedQuery.length;
        phraseIndex = normalizedBlob.indexOf(normalizedQuery, searchFrom);
      }
      return phraseCount;
    }
    var searchTokens = page._searchTokens && page._searchTokens.length
      ? page._searchTokens
      : normalizedBlob.split(/\s+/).filter(Boolean);
    var seenQueryTokens = Object.create(null);
    var total = 0;
    Array.prototype.forEach.call(tokens, function (queryToken) {
      if (!queryToken || seenQueryTokens[queryToken]) {
        return;
      }
      seenQueryTokens[queryToken] = true;
      Array.prototype.forEach.call(searchTokens, function (searchToken) {
        if (searchToken === queryToken) {
          total += 1;
        }
      });
    });
    return total;
  }

  function getSearchHitCountBoost(hitCount) {
    var cappedHitCount = Math.min(10, Math.max(0, Number(hitCount || 0) || 0));
    return cappedHitCount * 2;
  }

  function getSiteSearchExcerpt(page, query) {
    var fallback = page && (page.description || page.text || page.breadcrumb || "") || "";
    var text = collapseSearchText((page && (page.description || page.text)) || "");
    if (!text) {
      return trimSearchText(fallback, 190);
    }
    var tokens = getSearchTokens(query);
    var lower = text.toLowerCase();
    var matchIndex = -1;
    for (var i = 0; i < tokens.length; i += 1) {
      if (tokens[i].length < 2) {
        continue;
      }
      matchIndex = lower.indexOf(tokens[i]);
      if (matchIndex !== -1) {
        break;
      }
    }
    if (matchIndex === -1) {
      return trimSearchText(text, 190);
    }
    var start = Math.max(0, matchIndex - 72);
    var end = Math.min(text.length, matchIndex + 150);
    var snippet = text.slice(start, end).trim();
    if (start > 0) {
      snippet = "... " + snippet;
    }
    if (end < text.length) {
      snippet += " ...";
    }
    return trimSearchText(snippet, 220);
  }

  function getCurrentPageSearchSections() {
    var article = document.querySelector(".article-body");
    if (!article || !document.body || document.body.classList.contains("page-home")) {
      return [];
    }
    var nodes = Array.prototype.slice.call(article.querySelectorAll("h2, h3, h4, p, li, blockquote"));
    var current = null;
    var sections = [];
    var untitledCount = 0;
    var pushCurrent = function () {
      if (!current || !collapseSearchText(current.text)) {
        return;
      }
      current.text = collapseSearchText(current.text);
      current._searchBlob = collapseSearchText([current.sectionNumber, current.sectionTitle, current.text].join(" "));
      sections.push(current);
    };
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.closest && node.closest(".related-reports, .article-branch-nav, .further-reading-section, [data-page-search-exclude]")) {
        return;
      }
      var tagName = String(node.tagName || "").toLowerCase();
      var text = collapseSearchText(node.textContent || "");
      if (!text) {
        return;
      }
      if (/^h[2-4]$/.test(tagName)) {
        pushCurrent();
        var numberMatch = text.match(/^(\d+(?:\.\d+)*)[\).:-]?\s+(.+)$/);
        current = {
          sectionNumber: numberMatch ? numberMatch[1] : "",
          sectionTitle: numberMatch ? numberMatch[2] : text,
          text: "",
          url: node.id ? ("#" + encodeURIComponent(node.id)) : window.location.href,
          _index: sections.length
        };
        return;
      }
      if (!current) {
        untitledCount += 1;
        current = {
          sectionNumber: "",
          sectionTitle: document.title || getUiString("overview", "Overview"),
          text: "",
          url: window.location.href,
          _index: untitledCount
        };
      }
      current.text += " " + text;
    });
    pushCurrent();
    return sections;
  }

  function scoreCurrentPageSection(section, query) {
    if (!section || !matchesSearchQuery(query, section._searchBlob || "")) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    var title = normalizeSearchText(section.sectionTitle);
    var bodyText = normalizeSearchText(section.text);
    var score = 1;
    if (title.indexOf(normalizedQuery) !== -1) {
      score += 40;
    }
    if (bodyText.indexOf(normalizedQuery) !== -1) {
      score += 18;
    }
    Array.prototype.forEach.call(getSearchTokens(normalizedQuery), function (token) {
      if (title.indexOf(token) !== -1) {
        score += 8;
      }
      if (bodyText.indexOf(token) !== -1) {
        score += 2;
      }
    });
    score -= (section._index || 0) / 10000;
    return score;
  }

  function rankSearchRecords(source, query, mode) {
    var searchMode = mode === "page" ? "page" : "all";
    return (source || []).map(function (record) {
      var hitCount = searchMode === "page" ? 0 : countSearchPageHits(record, query);
      var score = searchMode === "page" ? scoreCurrentPageSection(record, query) : scoreSiteSearchPage(record, query);
      return {
        page: record,
        score: score > 0 ? score + getSearchHitCountBoost(hitCount) : score,
        hitCount: hitCount
      };
    }).filter(function (record) {
      return record.score > 0;
    }).sort(function (left, right) {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.hitCount !== left.hitCount) {
        return right.hitCount - left.hitCount;
      }
      return String(left.page && left.page.title || "").localeCompare(String(right.page && right.page.title || ""));
    });
  }

  function renderSiteSearchResultRecord(record, query, mode, hitCount) {
    var href = buildUrlWithSearchHighlight(record.url || "#", query);
    var title = mode === "page" ? (record.sectionTitle || getUiString("overview", "Overview")) : record.title;
    var kicker = mode === "page"
      ? [record.sectionNumber ? ("Section " + record.sectionNumber) : "", record.sectionTitle || ""].filter(Boolean).join(" - ")
      : (record.breadcrumb || getUiString("overview", "Overview"));
    var snippetSource = mode === "page"
      ? [record.sectionTitle, record.text].filter(Boolean).join(" ")
      : [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
    var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
    var hitLabel = numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits";
    var hitCountPill = numericHitCount > 0
      ? '<span class="site-search-result-hit-count">' + escapeHtml(hitLabel) + "</span>"
      : "";
    return ""
      + '<a class="site-search-result" href="' + escapeHtml(href) + '">'
      + '<span class="site-search-result-kicker">' + escapeHtml(kicker || getUiString("overview", "Overview")) + "</span>"
      + '<span class="site-search-result-title">' + escapeHtml(title || getUiString("overview", "Overview")) + "</span>"
      + '<span class="site-search-result-meta-row">'
      + '<span class="site-search-result-meta">' + escapeHtml(getSearchMatchKind(record, query)) + "</span>"
      + hitCountPill
      + "</span>"
      + '<span class="site-search-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 230) + "</span>"
      + "</a>";
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getSearchHighlightPattern(query) {
    var tokens = getSearchTokens(query).filter(function (token) {
      return token && token.length >= 2;
    });
    var seen = Object.create(null);
    tokens = tokens.filter(function (token) {
      if (seen[token]) {
        return false;
      }
      seen[token] = true;
      return true;
    }).sort(function (left, right) {
      return right.length - left.length;
    });
    if (!tokens.length) {
      return null;
    }
    return new RegExp("(" + tokens.map(escapeRegExp).join("|") + ")", "ig");
  }

  function isSearchHighlightTextNode(node, root) {
    if (!node || !node.nodeValue || !root) {
      return false;
    }
    var parent = node.parentElement;
    if (!parent || parent.closest("script, style, noscript, textarea, input, select, option, mark, .site-search-page-highlight")) {
      return false;
    }
    return root.contains(parent);
  }

  function highlightSearchTermOnPage() {
    var query = getSearchHighlightQueryFromUrl();
    if (!query) {
      return;
    }
    var pattern = getSearchHighlightPattern(query);
    if (!pattern) {
      return;
    }
    var root = document.querySelector(".main-content") || document.querySelector(".article-body");
    if (!root || !document.createTreeWalker) {
      return;
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        pattern.lastIndex = 0;
        return isSearchHighlightTextNode(node, root) && pattern.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    var current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    var firstMark = null;
    Array.prototype.forEach.call(nodes, function (node) {
      pattern.lastIndex = 0;
      var text = node.nodeValue;
      var fragment = document.createDocumentFragment();
      var lastIndex = 0;
      var match = pattern.exec(text);
      while (match) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        var mark = document.createElement("mark");
        mark.className = "site-search-highlight site-search-page-highlight";
        mark.textContent = match[0];
        fragment.appendChild(mark);
        if (!firstMark) {
          firstMark = mark;
        }
        lastIndex = match.index + match[0].length;
        match = pattern.exec(text);
      }
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      if (node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
    });
    if (!firstMark || typeof firstMark.scrollIntoView !== "function") {
      return;
    }
    var scrollToFirstMark = function () {
      try {
        syncAnchorOffset();
        firstMark.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      } catch (err) {
        firstMark.scrollIntoView();
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () {
        window.setTimeout(scrollToFirstMark, 80);
      });
    } else {
      window.setTimeout(scrollToFirstMark, 80);
    }
  }

  function initSiteSearch() {
    var triggers = document.querySelectorAll("[data-site-search-open]");
    var body = document.body;
    if (!triggers.length || !body) {
      return;
    }

    var overlay = null;
    var input = null;
    var status = null;
    var results = null;
    var tabs = null;
    var preparedPages = null;
    var preparedPagesIsFallback = false;
    var currentPageSections = null;
    var activeSearchMode = "all";
    var lastActiveElement = null;
    var hasThisPageSearch = !!document.querySelector(".article-body") && !(document.body && document.body.classList.contains("page-home"));
    var focusableSearchSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");

    var refreshModalResultsAfterIndexLoad = function (queryAtRequestTime) {
      loadSiteSearchIndex().then(function () {
        preparedPages = null;
        preparedPagesIsFallback = false;
        if (activeSearchMode !== "page" && (!input || String(input.value || "").trim() === String(queryAtRequestTime || "").trim())) {
          if (scheduledRenderResults) {
            scheduledRenderResults.flush();
          } else {
            renderResults();
          }
        }
      }).catch(function () {
        // Search remains usable with local fallback records if the full index cannot be fetched.
      });
    };

    var setTriggerState = function (expanded) {
      Array.prototype.forEach.call(triggers, function (trigger) {
        trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
      });
    };

    var syncSearchTabs = function () {
      if (!tabs) {
        return;
      }
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-site-search-tab]"), function (tab) {
        var selected = tab.getAttribute("data-site-search-tab") === activeSearchMode;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
    };

    var renderResults = function () {
      if (!input || !status || !results) {
        return;
      }
      var query = String(input.value || "").trim();
      if (activeSearchMode !== "page" && (!preparedPages || (preparedPagesIsFallback && isSiteSearchIndexLoaded()))) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (activeSearchMode !== "page" && preparedPagesIsFallback) {
        refreshModalResultsAfterIndexLoad(query);
      }
      if (!preparedPages) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (!currentPageSections) {
        currentPageSections = getCurrentPageSearchSections();
      }
      syncSearchTabs();
      if (!query) {
        var emptyHint = activeSearchMode === "page"
          ? getUiString("search-this-page-empty-hint", "Type to search this page.")
          : getUiString("search-empty-hint", "Type to search every page on this site.");
        status.textContent = "";
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyHint) + "</p>";
        return;
      }
      var source = activeSearchMode === "page" ? currentPageSections : preparedPages;
      var ranked = rankSearchRecords(source, query, activeSearchMode);

      if (!ranked.length) {
        var emptyResult = activeSearchMode === "page"
          ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
          : getUiString("no-search-results", "No pages match this search.");
        status.textContent = emptyResult;
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyResult) + "</p>";
        return;
      }

      status.textContent = formatUiString("search-results-count-template", "{count} results", {
        count: String(ranked.length)
      });
      results.innerHTML = ranked.slice(0, 24).map(function (record) {
        return renderSiteSearchResultRecord(record.page, query, activeSearchMode === "page" ? "page" : "all", record.hitCount);
      }).join("");
    };

    var scheduledRenderResults = createSearchRenderScheduler(renderResults, {
      shouldRenderImmediately: function () {
        return !input || !String(input.value || "").trim();
      },
      onPending: function () {
        if (status && String(input.value || "").trim()) {
          status.textContent = "Searching...";
        }
      }
    });

    var closeSearch = function () {
      if (!overlay || overlay.hidden) {
        return;
      }
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      body.classList.remove("site-search-open");
      setTriggerState(false);
      if (lastActiveElement && typeof lastActiveElement.focus === "function") {
        try {
          lastActiveElement.focus();
        } catch (err) {
          // Ignore focus restoration failures.
        }
      }
      lastActiveElement = null;
    };

    var getSearchDialogFocusable = function () {
      if (!overlay || overlay.hidden) {
        return [];
      }
      return Array.prototype.filter.call(overlay.querySelectorAll(focusableSearchSelector), function (node) {
        if (!node || typeof node.focus !== "function") {
          return false;
        }
        if (node.disabled || node.getAttribute("aria-hidden") === "true") {
          return false;
        }
        var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) {
          return false;
        }
        return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      });
    };

    var handleSearchDialogKeydown = function (event) {
      if (!overlay || overlay.hidden) {
        return;
      }
      var key = String(event.key || "");
      if (key === "Escape" || key === "Esc") {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (key !== "Tab") {
        return;
      }
      var focusable = getSearchDialogFocusable();
      if (!focusable.length) {
        event.preventDefault();
        if (input && typeof input.focus === "function") {
          input.focus();
        }
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = document.activeElement;
      if (event.shiftKey && (!active || active === first || !overlay.contains(active))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!active || active === last || !overlay.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    var ensureDialog = function () {
      if (overlay) {
        return;
      }
      overlay = document.createElement("div");
      overlay.className = "site-search-overlay";
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = ""
        + '<div class="site-search-backdrop" data-site-search-close></div>'
        + '<section class="site-search-dialog" role="dialog" aria-modal="true" aria-labelledby="site-search-title">'
        + '<div class="site-search-head">'
        + '<h2 class="site-search-title" id="site-search-title">' + escapeHtml(getUiString("search", "Search")) + "</h2>"
        + '<button class="site-search-close" type="button" data-site-search-close aria-label="' + escapeHtml(getUiString("close-search", "Close search")) + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>'
        + "</button>"
        + "</div>"
        + '<div class="site-search-tabs" role="tablist" aria-label="' + escapeHtml(getUiString("search", "Search")) + '" data-site-search-tabs>'
        + '<button class="site-search-tab is-active" type="button" role="tab" aria-selected="true" data-site-search-tab="all">' + escapeHtml(getUiString("search-all-pages", "Search all pages")) + "</button>"
        + (hasThisPageSearch ? '<button class="site-search-tab" type="button" role="tab" aria-selected="false" tabindex="-1" data-site-search-tab="page">' + escapeHtml(getUiString("search-this-page", "Search this page")) + "</button>" : "")
        + "</div>"
        + '<form class="site-search-form" role="search" data-site-search-form>'
        + '<label class="visually-hidden" for="site-search-input">' + escapeHtml(getUiString("search-all-pages", "Search all pages")) + "</label>"
        + '<input id="site-search-input" class="site-search-field" type="search" autocomplete="off" spellcheck="false" data-site-search-input placeholder="' + escapeHtml(getUiString("search-site-placeholder", "Search title, summary, or page text...")) + '">'
        + '<p class="site-search-status" data-site-search-status aria-live="polite"></p>'
        + "</form>"
        + '<div class="site-search-results" data-site-search-results></div>'
        + "</section>";
      document.body.appendChild(overlay);

      input = overlay.querySelector("[data-site-search-input]");
      status = overlay.querySelector("[data-site-search-status]");
      results = overlay.querySelector("[data-site-search-results]");
      tabs = overlay.querySelector("[data-site-search-tabs]");

      Array.prototype.forEach.call(overlay.querySelectorAll("[data-site-search-close]"), function (button) {
        button.addEventListener("click", closeSearch);
      });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeSearch();
        }
      });
      overlay.addEventListener("keydown", handleSearchDialogKeydown);
      document.addEventListener("keydown", handleSearchDialogKeydown, true);
      var form = overlay.querySelector("[data-site-search-form]");
      if (form) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          scheduledRenderResults.cancel();
          if (navigateToSearchResultsPage(input ? input.value : "")) {
            closeSearch();
          }
        });
      }
      if (input) {
        input.addEventListener("input", function () {
          scheduledRenderResults.schedule();
        });
        input.addEventListener("keydown", function (event) {
          if (String(event.key || "") === "Escape") {
            event.preventDefault();
            scheduledRenderResults.cancel();
            closeSearch();
          }
        });
      }
      if (tabs) {
        tabs.addEventListener("click", function (event) {
          var tab = event.target && event.target.closest ? event.target.closest("[data-site-search-tab]") : null;
          if (!tab) {
            return;
          }
          activeSearchMode = tab.getAttribute("data-site-search-tab") === "page" ? "page" : "all";
          if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
            refreshModalResultsAfterIndexLoad(input ? input.value : "");
          }
          scheduledRenderResults.flush();
          if (input && typeof input.focus === "function") {
            input.focus();
          }
        });
      }
      if (results) {
        results.addEventListener("click", function (event) {
          var resultLink = event.target && event.target.closest ? event.target.closest(".site-search-result") : null;
          if (resultLink) {
            closeSearch();
          }
        });
      }
    };

    var openSearch = function (event) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      ensureDialog();
      preparedPages = prepareSiteSearchPages();
      preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      if (!isSiteSearchIndexLoaded()) {
        refreshModalResultsAfterIndexLoad(input ? input.value : "");
      }
      lastActiveElement = document.activeElement;
      Array.prototype.forEach.call(document.querySelectorAll(".topics-menu"), function (menu) {
        if (menu && menu.open) {
          menu.open = false;
        }
      });
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      body.classList.add("site-search-open");
      setTriggerState(true);
      scheduledRenderResults.flush();
      window.setTimeout(function () {
        if (input && typeof input.focus === "function") {
          input.focus();
          if (typeof input.select === "function") {
            input.select();
          }
        }
      }, 40);
    };

    Array.prototype.forEach.call(triggers, function (trigger) {
      trigger.addEventListener("click", openSearch);
    });

    document.addEventListener("keydown", function (event) {
      var key = String(event.key || "").toLowerCase();
      if (key === "escape") {
        closeSearch();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        var active = document.activeElement;
        var tagName = String((active && active.tagName) || "").toLowerCase();
        if (tagName === "input" || tagName === "textarea" || (active && active.isContentEditable)) {
          return;
        }
        openSearch(event);
      }
    });
  }

  function initSearchResultsPage() {
    var root = document.querySelector("[data-search-page]");
    if (!root) {
      return;
    }
    var input = root.querySelector("[data-search-page-input]");
    var status = root.querySelector("[data-search-page-status]");
    var results = root.querySelector("[data-search-page-results]");
    var form = root.querySelector("[data-search-page-form]");
    var backToTopButton = root.querySelector("[data-search-page-back-to-top]");
    if (!input || !status || !results) {
      return;
    }
    var preparedPages = prepareSiteSearchPages();
    var preparedPagesIsFallback = !isSiteSearchIndexLoaded();
    var latestSearchPageQuery = "";
    var latestSearchPageRanked = [];
    var visibleSearchPageResultLimit = searchPageResultRenderLimit;

    var setUrlQuery = function (query) {
      if (!window.history || typeof window.history.replaceState !== "function") {
        return;
      }
      var nextUrl = getSearchResultsPageUrl(query);
      try {
        window.history.replaceState({}, "", nextUrl);
      } catch (err) {
        // Ignore history update failures.
      }
    };

    var renderSearchPageResultBatch = function (ranked, query) {
      var visibleLimit = Math.min(visibleSearchPageResultLimit, ranked.length);
      status.setAttribute("data-state", "active");
      status.textContent = ranked.length > visibleLimit
        ? "Showing first " + String(visibleLimit) + " of " + String(ranked.length) + "."
        : "Showing " + String(ranked.length) + " of " + String(ranked.length) + ".";
      results.innerHTML = ranked.slice(0, visibleLimit).map(function (record) {
        return renderSiteSearchResultRecord(record.page, query, "all", record.hitCount);
      }).join("") + (ranked.length > visibleLimit
        ? '<button class="site-search-more-button" type="button" data-search-page-show-more>Show more</button>'
        : "");
      if (backToTopButton) {
        backToTopButton.hidden = ranked.length <= searchPageBackToTopThreshold;
      }
    };

    var renderSearchPageResults = function (options) {
      var settings = options || {};
      var query = String(input.value || "").trim();
      if (settings.syncUrl) {
        setUrlQuery(query);
      }
      if (!query) {
        status.setAttribute("data-state", "default");
        status.textContent = getUiString("search-empty-hint", "Type to search every page on this site.");
        results.innerHTML = "";
        if (backToTopButton) {
          backToTopButton.hidden = true;
        }
        latestSearchPageQuery = "";
        latestSearchPageRanked = [];
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
        return;
      }

      if (query !== latestSearchPageQuery) {
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
      }
      var ranked = rankSearchRecords(preparedPages, query, "all");
      latestSearchPageQuery = query;
      latestSearchPageRanked = ranked;

      if (!ranked.length) {
        var emptyResult = getUiString("no-search-results", "No pages match this search.");
        status.setAttribute("data-state", "empty");
        status.textContent = emptyResult;
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyResult) + "</p>";
        if (backToTopButton) {
          backToTopButton.hidden = true;
        }
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
        return;
      }

      renderSearchPageResultBatch(ranked, query);
    };

    var scheduledSearchPageResults = createSearchRenderScheduler(renderSearchPageResults, {
      shouldRenderImmediately: function () {
        return !String(input.value || "").trim();
      },
      onPending: function (options) {
        var query = String(input.value || "").trim();
        if (options && options.syncUrl) {
          setUrlQuery(query);
        }
        if (query) {
          status.setAttribute("data-state", "active");
          status.textContent = "Searching...";
        }
      },
      getDelayedOptions: function () {
        return { syncUrl: false };
      }
    });

    try {
      var params = new URLSearchParams(window.location.search || "");
      input.value = String(params.get("q") || params.get("query") || "").trim();
    } catch (err) {
      input.value = "";
    }

    var loadFullSearchPageIndex = function () {
      if (!preparedPagesIsFallback) {
        return;
      }
      loadSiteSearchIndex().then(function () {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = false;
        scheduledSearchPageResults.schedule({ syncUrl: false });
      }).catch(function () {
        renderSearchPageResults({ syncUrl: false });
        status.setAttribute("data-state", "empty");
        status.textContent = String(status.textContent || "") + " Full search index could not be loaded; showing local results.";
      });
    };

    input.addEventListener("input", function () {
      scheduledSearchPageResults.schedule({ syncUrl: true });
    });
    results.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-search-page-show-more]") : null;
      if (!button || !results.contains(button) || !latestSearchPageRanked.length) {
        return;
      }
      visibleSearchPageResultLimit = Math.min(
        latestSearchPageRanked.length,
        visibleSearchPageResultLimit + searchPageResultRenderLimit
      );
      renderSearchPageResultBatch(latestSearchPageRanked, latestSearchPageQuery);
    });
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        scheduledSearchPageResults.flush({ syncUrl: true });
      });
    }
    if (String(input.value || "").trim() && preparedPagesIsFallback) {
      status.setAttribute("data-state", "active");
      status.textContent = "Loading search index...";
      results.innerHTML = '<p class="site-search-empty">Loading search index...</p>';
    } else {
      renderSearchPageResults({ syncUrl: false });
    }
    loadFullSearchPageIndex();
  }

  function initHeaderTopicsMenu() {
    var menus = document.querySelectorAll(".topics-menu");
    var body = document.body;
    if (!menus.length || !body) {
      return;
    }

    var mediaQuery = window.matchMedia ? window.matchMedia("(max-width: 980px)") : null;
    var isMobile = function () {
      return !!(mediaQuery && mediaQuery.matches);
    };

    var closeMenu = function (menu) {
      if (menu && menu.open) {
        menu.open = false;
      }
    };

    var syncBodyState = function () {
      var hasOpenMenu = Array.prototype.some.call(menus, function (menu) {
        return !!(menu && menu.open && isMobile());
      });
      body.classList.toggle("topics-menu-open", hasOpenMenu);
    };

    Array.prototype.forEach.call(menus, function (menu) {
      menu.addEventListener("toggle", function () {
        if (menu.open) {
          Array.prototype.forEach.call(menus, function (otherMenu) {
            if (otherMenu !== menu) {
              closeMenu(otherMenu);
            }
          });
        }
        syncBodyState();
      });

      var interactiveItems = menu.querySelectorAll(".topics-menu-panel a, .topics-menu-panel button");
      Array.prototype.forEach.call(interactiveItems, function (item) {
        item.addEventListener("click", function () {
          if (item.tagName && item.tagName.toLowerCase() === "button") {
            return;
          }
          closeMenu(menu);
          syncBodyState();
        });
      });
    });

    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (!target) {
        return;
      }
      var clickedInsideMenu = Array.prototype.some.call(menus, function (menu) {
        return !!(menu && typeof menu.contains === "function" && menu.contains(target));
      });
      if (!clickedInsideMenu) {
        Array.prototype.forEach.call(menus, closeMenu);
        syncBodyState();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (String(event && event.key || "") !== "Escape") {
        return;
      }
      var hadOpenMenu = false;
      Array.prototype.forEach.call(menus, function (menu) {
        if (menu && menu.open) {
          hadOpenMenu = true;
          closeMenu(menu);
        }
      });
      syncBodyState();
      if (hadOpenMenu) {
        var summary = document.querySelector(".topics-menu > summary");
        if (summary && typeof summary.focus === "function") {
          summary.focus();
        }
      }
    });

    if (mediaQuery) {
      var handleViewportChange = function () {
        if (!isMobile()) {
          body.classList.remove("topics-menu-open");
        } else {
          syncBodyState();
        }
      };
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleViewportChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleViewportChange);
      }
    }

    syncBodyState();
  }

  function initMobilePageTools() {
    var panel = document.querySelector("[data-mobile-page-tools]");
    var toc = document.querySelector("[data-mobile-page-toc]");
    var toggleButtons = document.querySelectorAll("[data-mobile-page-tools-toggle]");
    var closeButtons = document.querySelectorAll("[data-mobile-page-tools-close]");
    if (!panel || !toc) {
      return;
    }

    var mediaQuery = window.matchMedia ? window.matchMedia("(max-width: 980px)") : null;

    var syncState = function () {
      var hasToc = Boolean(toc.children.length);
      var isMobile = !mediaQuery || mediaQuery.matches;
      var isAvailable = hasToc && isMobile;
      panel.hidden = !isAvailable;
      if (!isAvailable) {
        panel.open = false;
      }
      Array.prototype.forEach.call(toggleButtons, function (button) {
        button.hidden = !isAvailable;
        button.setAttribute("aria-expanded", isAvailable && panel.open ? "true" : "false");
      });
    };

    Array.prototype.forEach.call(toggleButtons, function (button) {
      button.addEventListener("click", function () {
        syncState();
        if (panel.hidden) {
          return;
        }
        panel.open = !panel.open;
        button.setAttribute("aria-expanded", panel.open ? "true" : "false");
        if (panel.open && typeof panel.scrollIntoView === "function") {
          panel.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        }
      });
    });

    Array.prototype.forEach.call(closeButtons, function (button) {
      button.addEventListener("click", function () {
        panel.open = false;
        Array.prototype.forEach.call(toggleButtons, function (toggleButton) {
          toggleButton.setAttribute("aria-expanded", "false");
        });
      });
    });

    panel.addEventListener("toggle", function () {
      Array.prototype.forEach.call(toggleButtons, function (button) {
        button.setAttribute("aria-expanded", panel.open ? "true" : "false");
      });
    });

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncState);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(syncState);
      }
    }

    document.addEventListener("phoenix-page-toc-built", syncState);
    syncState();
  }

  function initSidebarDocking() {
    var body = document.body;
    var root = document.documentElement;
    if (!body || !root) {
      return;
    }

    var sidePresent = {
      left: Boolean(document.querySelector("[data-page-tools]")),
      right: Boolean(document.querySelector("[data-mobile-sidebar-panel]"))
    };
    if (!sidePresent.left && !sidePresent.right) {
      return;
    }

    var sides = ["left", "right"];
    var classBySide = {
      left: "left-sidebar-collapsed",
      right: "right-sidebar-collapsed"
    };
    var storageBySide = {
      left: "phoenix-sidebar-left-collapsed",
      right: "phoenix-sidebar-right-collapsed"
    };
    var toastTimers = {
      left: null,
      right: null
    };
    var toastMs = parseInt(root.getAttribute("data-appearance-toast-ms"), 10);
    if (!Number.isFinite(toastMs) || toastMs < 1000) {
      toastMs = 5000;
    }

    function readStorage(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        return null;
      }
    }

    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        // Ignore storage write failures.
      }
    }

    function hasStoredCollapsed(side) {
      return String(readStorage(storageBySide[side]) || "").trim() !== "";
    }

    function getDock(side) {
      return document.querySelector('[data-sidebar-dock="' + side + '"]');
    }

    function getDockToggle(side) {
      return document.querySelector('[data-sidebar-dock-toggle="' + side + '"]');
    }

    function getDockMenu(side) {
      return document.querySelector('[data-sidebar-dock-menu="' + side + '"]');
    }

    function getDockToast(side) {
      return document.querySelector('[data-sidebar-dock-toast="' + side + '"]');
    }

    function closeDockMenu(side) {
      var menu = getDockMenu(side);
      var toggle = getDockToggle(side);
      if (menu) {
        menu.hidden = true;
      }
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
    }

    function hideDockToast(side) {
      var toast = getDockToast(side);
      if (toast) {
        toast.hidden = true;
      }
      if (toastTimers[side]) {
        window.clearTimeout(toastTimers[side]);
        toastTimers[side] = null;
      }
    }

    function showDockToast(side) {
      var toast = getDockToast(side);
      if (!toast) {
        return;
      }
      hideDockToast(side);
      toast.hidden = false;
      toastTimers[side] = window.setTimeout(function () {
        toast.hidden = true;
        toastTimers[side] = null;
      }, toastMs);
    }

    function readCollapsed(side) {
      var token = String(readStorage(storageBySide[side]) || "").trim().toLowerCase();
      return token === "1" || token === "true" || token === "yes" || token === "on";
    }

    function getDefaultCollapsed(side) {
      if (!body.classList.contains("page-article")) {
        return false;
      }
      var isDesktop = !(window.matchMedia && window.matchMedia("(max-width: 980px)").matches);
      if (!isDesktop) {
        return false;
      }
      return false;
    }

    function setCollapsed(side, shouldCollapse, options) {
      var opts = options || {};
      var className = classBySide[side];
      if (!className) {
        return;
      }
      var collapsed = Boolean(shouldCollapse && sidePresent[side]);
      body.classList.toggle(className, collapsed);
      var dock = getDock(side);
      if (dock) {
        dock.hidden = !collapsed;
      }
      if (!collapsed) {
        closeDockMenu(side);
        hideDockToast(side);
      } else if (opts.showToast) {
        showDockToast(side);
      }

      if (opts.persist) {
        writeStorage(storageBySide[side], collapsed ? "1" : "0");
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-sidebar-hide]"), function (button) {
      var side = String(button.getAttribute("data-sidebar-hide") || "").trim().toLowerCase();
      if (!classBySide[side] || !sidePresent[side]) {
        button.hidden = true;
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-sidebar-restore]"), function (button) {
      var side = String(button.getAttribute("data-sidebar-restore") || "").trim().toLowerCase();
      if (!classBySide[side] || !sidePresent[side]) {
        button.hidden = true;
      }
    });

    document.addEventListener("click", function (event) {
      var hideButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-hide]") : null;
      if (hideButton) {
        var hideSide = String(hideButton.getAttribute("data-sidebar-hide") || "").trim().toLowerCase();
        if (classBySide[hideSide] && sidePresent[hideSide]) {
          event.preventDefault();
          event.stopPropagation();
          setCollapsed(hideSide, true, { persist: true, showToast: true });
        }
        return;
      }

      var restoreButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-restore]") : null;
      if (restoreButton) {
        var restoreSide = String(restoreButton.getAttribute("data-sidebar-restore") || "").trim().toLowerCase();
        if (classBySide[restoreSide] && sidePresent[restoreSide]) {
          event.preventDefault();
          event.stopPropagation();
          setCollapsed(restoreSide, false, { persist: true });
        }
        return;
      }

      var dockToggleButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-dock-toggle]") : null;
      if (dockToggleButton) {
        var dockSide = String(dockToggleButton.getAttribute("data-sidebar-dock-toggle") || "").trim().toLowerCase();
        if (classBySide[dockSide] && sidePresent[dockSide]) {
          event.preventDefault();
          event.stopPropagation();
          hideDockToast(dockSide);
          closeDockMenu(dockSide);
          setCollapsed(dockSide, false, { persist: true });
        }
        return;
      }
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest("[data-sidebar-dock]")) {
        return;
      }
      Array.prototype.forEach.call(sides, function (side) {
        closeDockMenu(side);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (String(event.key || "") !== "Escape") {
        return;
      }
      Array.prototype.forEach.call(sides, function (side) {
        closeDockMenu(side);
      });
    });

    Array.prototype.forEach.call(sides, function (side) {
      var collapsed = hasStoredCollapsed(side) ? readCollapsed(side) : getDefaultCollapsed(side);
      setCollapsed(side, collapsed, { persist: false, showToast: false });
    });
  }

  function initHomeResponsiveDisclosures() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var disclosures = document.querySelectorAll("[data-home-mobile-disclosure]");
    if (!disclosures.length) {
      return;
    }
    var hasUserInteracted = false;
    var markUserInteraction = function () {
      hasUserInteracted = true;
    };
    document.addEventListener("pointerdown", markUserInteraction, true);
    document.addEventListener("keydown", markUserInteraction, true);

    var requestCatalogMode = function () {
      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-home-mode-request", {
            detail: {
              mode: "catalog",
              automatic: true,
              persist: true,
              syncUrl: true
            }
          })
        );
      } catch (err) {
        // Ignore custom event dispatch failures.
      }
    };

    var getCollapseThreshold = function (node) {
      var parsed = parseInt(String(node && node.getAttribute("data-home-mobile-collapse-threshold") || ""), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
    };

    var shouldCollapseDisclosure = function (node) {
      var threshold = getCollapseThreshold(node);
      return window.innerWidth <= threshold;
    };

    var shouldForceOpenDisclosure = function (node) {
      if (!node) {
        return false;
      }
      var currentHash = String(window.location.hash || "").trim();
      if (currentHash && node.id && currentHash === "#" + node.id) {
        return true;
      }
      var searchInput = node.querySelector("[data-home-filter]");
      return !!(searchInput && String(searchInput.value || "").trim());
    };

    var syncDisclosureState = function (node, force) {
      if (!node) {
        return;
      }
      if (!force && node.__homeMobileDisclosureTouched) {
        return;
      }
      var shouldCollapse = shouldCollapseDisclosure(node);
      var shouldOpen = !shouldCollapse || shouldForceOpenDisclosure(node);
      node.__homeMobileDisclosureSyncing = true;
      if (shouldOpen) {
        node.setAttribute("open", "open");
      } else {
        node.removeAttribute("open");
      }
      node.__homeMobileDisclosureSyncing = false;
      node.__homeMobileDisclosureViewport = shouldCollapse ? "mobile" : "desktop";
    };

    var syncAllDisclosures = function (force) {
      Array.prototype.forEach.call(disclosures, function (node) {
        syncDisclosureState(node, force);
      });
    };

    Array.prototype.forEach.call(disclosures, function (node) {
      if (!node.__homeMobileDisclosureBound) {
        node.__homeMobileDisclosureBound = true;
        node.addEventListener("toggle", function (event) {
          if (node.__homeMobileDisclosureSyncing) {
            return;
          }
          var userInitiated = Boolean(event && event.isTrusted);
          if (userInitiated) {
            node.__homeMobileDisclosureTouched = true;
          }
          var searchInput = node.querySelector("[data-home-filter]");
          if (userInitiated && node.hasAttribute("open") && searchInput) {
            requestCatalogMode();
            window.setTimeout(function () {
              if (typeof searchInput.focus === "function") {
                searchInput.focus();
              }
            }, 0);
          }
        });
        var searchInput = node.querySelector("[data-home-filter]");
        if (searchInput) {
          var openDisclosure = function () {
            node.setAttribute("open", "open");
          };
          var focusCatalogSearch = function () {
            var hasSearchValue = String(searchInput.value || "").trim().length > 0;
            if (!hasSearchValue) {
              return;
            }
            openDisclosure();
            requestCatalogMode();
          };
          searchInput.addEventListener("focus", focusCatalogSearch);
          searchInput.addEventListener("input", focusCatalogSearch);
        }
      }
    });

    var lastMobileState = shouldCollapseDisclosure(disclosures[0]);
    syncAllDisclosures(false);

    var clearInitialHomeFilterFocus = function () {
      var activeElement = document.activeElement;
      var isHomeFilterFocused = Boolean(
        activeElement
        && typeof activeElement.matches === "function"
        && activeElement.matches("[data-home-filter]")
      );
      if (!isHomeFilterFocused) {
        return;
      }
      if (String(activeElement.value || "").trim() || String(window.location.hash || "").trim()) {
        return;
      }
      if (typeof activeElement.blur === "function") {
        activeElement.blur();
      }
      if (window.scrollY > 0 && typeof window.scrollTo === "function") {
        window.scrollTo(0, 0);
      }
    };
    window.setTimeout(clearInitialHomeFilterFocus, 0);
    window.setTimeout(clearInitialHomeFilterFocus, 180);

    window.addEventListener("hashchange", function () {
      Array.prototype.forEach.call(disclosures, function (node) {
        if (shouldForceOpenDisclosure(node)) {
          node.setAttribute("open", "open");
        }
      });
    });

    window.addEventListener("resize", function () {
      var currentMobileState = shouldCollapseDisclosure(disclosures[0]);
      if (currentMobileState === lastMobileState) {
        return;
      }
      lastMobileState = currentMobileState;
      syncAllDisclosures(false);
    });
  }

  function initHomeModeSwitcher() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var switcher = document.querySelector("[data-home-mode-switcher]");
    var panels = document.querySelectorAll("[data-home-mode-panel]");
    if (!switcher || !panels.length) {
      return;
    }

    var normalizeRawMode = function (value) {
      var token = String(value || "").trim().toLowerCase();
      return (token === "cluster" || token === "vertical" || token === "catalog") ? token : "";
    };

    var normalizePanelMode = function (value) {
      var token = String(value || "").trim().toLowerCase();
      return (token === "cluster" || token === "vertical" || token === "catalog") ? token : "";
    };

    var modeLabels = {
      cluster: "Tree view",
      vertical: "Topic view",
      catalog: "Catalog"
    };
    Array.prototype.forEach.call(panels, function (panel) {
      var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
      var panelLabel = String(panel.getAttribute("data-home-mode-label") || "").trim();
      if (panelMode && panelLabel) {
        modeLabels[panelMode] = panelLabel;
      }
    });

    var configuredMode = normalizeRawMode(switcher.getAttribute("data-home-initial-mode")) || "catalog";
    var selectedMode = normalizePanelMode(switcher.getAttribute("data-home-selected-mode")) || "catalog";
    var buttons = switcher.querySelectorAll("[data-home-mode-btn]");
    var cycleButton = switcher.querySelector("[data-home-mode-cycle]");
    var summaryCurrentNodes = switcher.querySelectorAll("[data-home-mode-summary-current], [data-home-mode-summary-current-visual]");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var legacyStorageKeys = [
      "phoenix-home-mode-v2-" + siteScope,
      "phoenix-home-mode-v1-" + siteScope
    ];
    var clusterMinWidth = parseInt(String(switcher.getAttribute("data-home-cluster-min-width") || "980"), 10);
    if (!Number.isFinite(clusterMinWidth) || clusterMinWidth < 320) {
      clusterMinWidth = 980;
    }
    var panelAvailability = {};
    Array.prototype.forEach.call(panels, function (panel) {
      var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
      if (panelMode) {
        panelAvailability[panelMode] = true;
      }
    });
    var rawModeSequence = String(switcher.getAttribute("data-home-mode-sequence") || "")
      .split(/\s+/)
      .map(normalizeRawMode)
      .filter(function (token, index, source) {
        return !!token && source.indexOf(token) === index && !!panelAvailability[token];
      });
    if (!rawModeSequence.length) {
      rawModeSequence = ["catalog"];
      if (panelAvailability.vertical) {
        rawModeSequence.push("vertical");
      }
      if (panelAvailability.cluster) {
        rawModeSequence.push("cluster");
      }
    }
    var homeModeUserInteracted = false;
    var markHomeModeInteraction = function () {
      homeModeUserInteracted = true;
    };
    document.addEventListener("pointerdown", markHomeModeInteraction, true);
    document.addEventListener("keydown", markHomeModeInteraction, true);

    function isClusterModeAvailable() {
      return !!panelAvailability.cluster && window.innerWidth >= clusterMinWidth;
    }

    function isCompactHomeModeViewport() {
      return window.innerWidth < clusterMinWidth;
    }

    function isCatalogOnlyHomeModeViewport() {
      return isCompactHomeModeViewport();
    }

    function isVerticalOnlyHomeModeViewport() {
      return !isCatalogOnlyHomeModeViewport();
    }

    function getViewportDefaultHomeMode() {
      if (isCatalogOnlyHomeModeViewport()) {
        if (panelAvailability.catalog) {
          return "catalog";
        }
        if (panelAvailability.vertical) {
          return "vertical";
        }
        return "catalog";
      }
      if (panelAvailability.vertical) {
        return "vertical";
      }
      if (panelAvailability.catalog) {
        return "catalog";
      }
      return "catalog";
    }

    function isModeAvailable(mode) {
      if (isCatalogOnlyHomeModeViewport()) {
        return mode === "catalog" ? !!panelAvailability.catalog : false;
      }
      if (isVerticalOnlyHomeModeViewport()) {
        return mode === "vertical" ? !!panelAvailability.vertical : false;
      }
      return mode === "catalog" ? !!panelAvailability.catalog : false;
    }

    var resolveEffectiveMode = function (rawMode) {
      var normalized = normalizeRawMode(rawMode);
      if (normalized === "catalog" && isModeAvailable("catalog")) {
        return "catalog";
      }
      if (normalized === "vertical" && isModeAvailable("vertical")) {
        return "vertical";
      }
      if (normalized === "cluster" && isModeAvailable("cluster")) {
        return "cluster";
      }
      return getViewportDefaultHomeMode();
    };

    var updateTopicJumpLinks = function (effectiveMode) {
      if (!effectiveMode) {
        return;
      }
      var jumpLinks = document.querySelectorAll("[data-home-topic-anchor]");
      Array.prototype.forEach.call(jumpLinks, function (link) {
        var anchorToken = String(link.getAttribute("data-home-topic-anchor") || "").trim();
        var clusterBase = String(link.getAttribute("data-home-cluster-base") || "").trim();
        if (effectiveMode === "cluster" && clusterBase) {
          link.setAttribute("href", "#home-cluster-map");
          link.setAttribute("data-home-cluster-jump", clusterBase);
          return;
        }
        if (link.hasAttribute("data-home-cluster-jump")) {
          link.removeAttribute("data-home-cluster-jump");
        }
        if (!anchorToken) {
          return;
        }
        link.setAttribute("href", "#topic-" + effectiveMode + "-" + anchorToken);
      });
    };

    var persistModeInUrl = function (rawMode) {
      if (!window.history || typeof window.history.replaceState !== "function") {
        return;
      }
      var hasUrlApi = typeof URL !== "undefined";
      if (!hasUrlApi) {
        return;
      }
      try {
        var url = new URL(window.location.href);
        var normalizedRaw = resolveEffectiveMode(rawMode);
        var viewportDefaultMode = getViewportDefaultHomeMode();
        if (!isModeAvailable(normalizedRaw) || !normalizedRaw || normalizedRaw === viewportDefaultMode) {
          url.searchParams.delete("home_mode");
        } else {
          url.searchParams.set("home_mode", normalizedRaw);
        }
        window.history.replaceState(null, "", url.toString());
      } catch (err) {
        // Ignore URL write failures.
      }
    };

    var updateSummaryCurrent = function (effectiveMode) {
      Array.prototype.forEach.call(summaryCurrentNodes, function (node) {
        node.textContent = modeLabels[effectiveMode] || "Catalog";
      });
    };

    var syncModeControls = function (effectiveMode) {
      var availableModes = rawModeSequence.filter(function (token) {
        return isModeAvailable(token);
      });
      var visibleCount = 0;
      Array.prototype.forEach.call(buttons, function (button) {
        var buttonMode = normalizeRawMode(button.getAttribute("data-home-mode-btn"));
        var isAvailable = isModeAvailable(buttonMode);
        button.hidden = !isAvailable;
        button.disabled = !isAvailable;
        if (isAvailable) {
          visibleCount += 1;
        }
        var isActiveButton = isAvailable && buttonMode === effectiveMode;
        button.classList.toggle("is-active", isActiveButton);
        button.setAttribute("aria-pressed", isActiveButton ? "true" : "false");
      });
      if (cycleButton) {
        var currentIndex = availableModes.indexOf(effectiveMode);
        if (currentIndex < 0) {
          currentIndex = 0;
        }
        var nextMode = availableModes[(currentIndex + 1) % Math.max(availableModes.length, 1)] || effectiveMode;
        var nextLabel = modeLabels[nextMode] || "Catalog";
        var currentLabel = modeLabels[effectiveMode] || "Catalog";
        var title = "Current view: " + currentLabel + ". Click to switch to " + nextLabel + ".";
        cycleButton.hidden = availableModes.length <= 1;
        cycleButton.disabled = availableModes.length <= 1;
        cycleButton.setAttribute("title", title);
        cycleButton.setAttribute("aria-label", title);
        cycleButton.setAttribute("data-home-next-mode", nextMode);
      }
      switcher.hidden = availableModes.length <= 1;
    };

    var activateMode = function (rawMode, options) {
      var normalizedRaw = normalizeRawMode(rawMode) || configuredMode || "catalog";
      var effectiveMode = resolveEffectiveMode(normalizedRaw);
      if (!effectiveMode) {
        effectiveMode = selectedMode;
      }
      normalizedRaw = effectiveMode;

      Array.prototype.forEach.call(panels, function (panel) {
        var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
        var isActive = panelMode === effectiveMode;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
        panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      switcher.setAttribute("data-home-mode-raw", normalizedRaw);
      switcher.setAttribute("data-home-mode-effective", effectiveMode);
      updateTopicJumpLinks(effectiveMode);
      updateSummaryCurrent(effectiveMode);
      syncModeControls(effectiveMode);

      var shouldSyncUrl = !options || options.syncUrl !== false;
      if (shouldSyncUrl) {
        persistModeInUrl(normalizedRaw);
      }

      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-home-mode-changed", {
            detail: {
              rawMode: normalizedRaw,
              effectiveMode: effectiveMode,
              clusterAvailable: isClusterModeAvailable(),
              verticalAvailable: isModeAvailable("vertical")
            }
          })
        );
      } catch (err) {
        // Ignore custom event dispatch failures.
      }
    };

    var queryMode = "";
    try {
      var params = new URLSearchParams(window.location.search || "");
      queryMode = normalizeRawMode(params.get("home_mode"));
    } catch (err) {
      queryMode = "";
    }
    legacyStorageKeys.forEach(function (key) {
      removeLocalStorage(key);
    });
    var startMode = queryMode || configuredMode || "catalog";

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        markHomeModeInteraction();
        var nextMode = normalizeRawMode(button.getAttribute("data-home-mode-btn")) || "catalog";
        activateMode(nextMode, { persist: true, syncUrl: true });
      });
    });
    if (cycleButton) {
      cycleButton.addEventListener("click", function () {
        markHomeModeInteraction();
        var nextMode = normalizeRawMode(cycleButton.getAttribute("data-home-next-mode")) || "catalog";
        activateMode(nextMode, { persist: true, syncUrl: true });
      });
    }

    document.addEventListener("phoenix-home-mode-request", function (event) {
      var detail = event && event.detail ? event.detail : {};
      var requestedMode = normalizeRawMode(detail.mode);
      if (!requestedMode) {
        return;
      }
      if (
        detail.automatic === true
        && requestedMode === "catalog"
        && configuredMode === "vertical"
        && isModeAvailable("vertical")
        && !queryMode
        && !homeModeUserInteracted
      ) {
        return;
      }
      activateMode(requestedMode, {
        persist: detail.persist !== false,
        syncUrl: detail.syncUrl !== false
      });
    });

    var lastClusterAvailability = isClusterModeAvailable();
    var lastCompactHomeModeViewport = isCompactHomeModeViewport();
    window.addEventListener("resize", function () {
      var nextClusterAvailability = isClusterModeAvailable();
      var nextCompactHomeModeViewport = isCompactHomeModeViewport();
      if (
        nextClusterAvailability === lastClusterAvailability
        && nextCompactHomeModeViewport === lastCompactHomeModeViewport
      ) {
        return;
      }
      lastClusterAvailability = nextClusterAvailability;
      lastCompactHomeModeViewport = nextCompactHomeModeViewport;
      var currentRawMode = normalizeRawMode(switcher.getAttribute("data-home-mode-raw")) || startMode;
      activateMode(currentRawMode, { persist: true, syncUrl: true });
    });

    activateMode(startMode, { persist: true, syncUrl: true });
  }

  function initHomeVerticalView() {
    var containers = document.querySelectorAll("[data-home-vertical-map]");
    if (!containers.length) {
      return;
    }

    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";

    Array.prototype.forEach.call(containers, function (container, containerIndex) {
      var tree = container.querySelector("[data-home-vertical-tree]");
      var dataNode = container.querySelector("[data-home-vertical-data]");
      if (!tree || !dataNode) {
        return;
      }

      var payload = {};
      try {
        payload = JSON.parse(String(dataNode.textContent || "{}"));
      } catch (err) {
        payload = {};
      }
      var nodes = Array.isArray(payload.nodes) ? payload.nodes.slice() : [];
      if (!nodes.length) {
        tree.hidden = true;
        return;
      }

      var nodeById = {};
      var childrenByParent = {};
      nodes.forEach(function (node) {
        if (!node || !node.id) {
          return;
        }
        nodeById[node.id] = node;
        var parentId = String(node.parent_id || "").trim();
        if (!childrenByParent[parentId]) {
          childrenByParent[parentId] = [];
        }
        childrenByParent[parentId].push(node);
      });

      function sortNodes(nodeList) {
        return nodeList.sort(function (a, b) {
          var slotA = parseInt(String((a && a.slot_index) || ""), 10);
          var slotB = parseInt(String((b && b.slot_index) || ""), 10);
          var hasSlotA = Number.isFinite(slotA);
          var hasSlotB = Number.isFinite(slotB);
          if (hasSlotA && hasSlotB && slotA !== slotB) {
            return slotA - slotB;
          }
          if (hasSlotA && !hasSlotB) {
            return -1;
          }
          if (!hasSlotA && hasSlotB) {
            return 1;
          }
          var labelA = String((a && (a.full_label || a.label)) || "").toLowerCase();
          var labelB = String((b && (b.full_label || b.label)) || "").toLowerCase();
          return labelA.localeCompare(labelB);
        });
      }

      Object.keys(childrenByParent).forEach(function (parentId) {
        sortNodes(childrenByParent[parentId]);
      });

      var topNodes = sortNodes(
        nodes.filter(function (node) {
          return String((node && node.semantic_level) || "").trim().toLowerCase() === "root";
        })
      );
      if (!topNodes.length) {
        topNodes = sortNodes(
          nodes.filter(function (node) {
            return String((node && node.semantic_level) || "").trim().toLowerCase() === "l1";
          })
        );
      }
      if (!topNodes.length) {
        topNodes = sortNodes(
          nodes.filter(function (node) {
            return !String((node && node.parent_id) || "").trim();
          })
        );
      }
      if (!topNodes.length) {
        tree.hidden = true;
        return;
      }

      var primaryTopNode = topNodes.length === 1 ? topNodes[0] : null;
      var primaryTopSemantic = String((primaryTopNode && primaryTopNode.semantic_level) || "").trim().toLowerCase();
      var l1Nodes = [];
      if (primaryTopNode && primaryTopSemantic === "root") {
        l1Nodes = getChildren(primaryTopNode).filter(function (node) {
          return !!node;
        });
      } else {
        l1Nodes = topNodes.filter(function (node) {
          return !!node;
        });
      }
      var singleL1Node = l1Nodes.length === 1 ? l1Nodes[0] : null;
      container.setAttribute("data-home-vertical-l1-count", String(l1Nodes.length));
      container.setAttribute("data-home-vertical-top-count", String(topNodes.length));
      if (singleL1Node && singleL1Node.id) {
        container.setAttribute("data-home-vertical-single-l1-id", String(singleL1Node.id));
      } else {
        container.removeAttribute("data-home-vertical-single-l1-id");
      }

      var storageKey = "phoenix-home-vertical-expanded-v1-" + siteScope + "-" + String(containerIndex);
      var state = container.__homeVerticalState || { expanded: {} };
      if (!state || typeof state !== "object") {
        state = { expanded: {} };
      }
      if (!state.expanded || typeof state.expanded !== "object") {
        state.expanded = {};
      }
      var shouldApplyDefaultExpansion = !container.__homeVerticalStateInitialized;
      var hasStoredState = false;
      if (!container.__homeVerticalStateInitialized) {
        try {
          var rawStored = String(readLocalStorage(storageKey) || "").trim();
          if (rawStored) {
            var parsedStored = JSON.parse(rawStored);
            if (parsedStored && typeof parsedStored === "object") {
              state.expanded = parsedStored;
              hasStoredState = true;
            }
          }
        } catch (err) {
          state.expanded = {};
        }
        container.__homeVerticalStateInitialized = true;
      }
      container.__homeVerticalState = state;

      function persistState() {
        try {
          writeLocalStorage(storageKey, JSON.stringify(state.expanded));
        } catch (err) {
          // Ignore serialization/storage failures.
        }
      }

      function scheduleVerticalRender() {
        if (container.__homeVerticalRenderTimer) {
          window.clearTimeout(container.__homeVerticalRenderTimer);
        }
        if (container.__homeVerticalRenderFrame && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(container.__homeVerticalRenderFrame);
        }
        container.__homeVerticalRenderFrame = 0;
        container.__homeVerticalRenderTimer = 0;
        var rerender = function () {
          container.__homeVerticalRenderTimer = 0;
          render();
        };
        if (typeof window.requestAnimationFrame === "function") {
          container.__homeVerticalRenderFrame = window.requestAnimationFrame(function () {
            container.__homeVerticalRenderFrame = 0;
            container.__homeVerticalRenderTimer = window.setTimeout(rerender, 0);
          });
        } else {
          container.__homeVerticalRenderTimer = window.setTimeout(rerender, 0);
        }
      }

      function applyVerticalToggleState(toggle, node, expanded) {
        if (!toggle || !node) {
          return;
        }
        var isNodeExpanded = !!expanded;
        var icon = toggle.querySelector(".home-vertical-toggle-icon");
        var text = toggle.querySelector(".home-vertical-toggle-text");
        if (icon) {
          icon.textContent = isNodeExpanded ? "-" : "+";
        }
        if (text) {
          text.textContent = isNodeExpanded ? "Hide subtopics" : "Show subtopics";
        }
        toggle.setAttribute(
          "aria-label",
          (isNodeExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section"))
            + ": "
            + String(node.full_label || node.label || "Untitled")
        );
        toggle.setAttribute("aria-expanded", isNodeExpanded ? "true" : "false");
      }

      function toggleVerticalExpansion(node, toggle, badge) {
        if (!node || !node.id || isLockedOpenNode(node)) {
          return;
        }
        var isNodeExpanded = !isExpanded(node);
        if (isNodeExpanded) {
          state.expanded[node.id] = 1;
        } else {
          delete state.expanded[node.id];
        }
        persistState();
        applyVerticalToggleState(toggle, node, isNodeExpanded);
        if (badge) {
          badge.setAttribute("aria-expanded", isNodeExpanded ? "true" : "false");
        }
        scheduleVerticalRender();
      }

      function getChildren(node) {
        if (!node || !node.id) {
          return [];
        }
        return childrenByParent[node.id] || [];
      }

      function hasChildren(node) {
        return getChildren(node).length > 0;
      }

      function isLockedOpenNode(node) {
        if (!node || !node.id || !hasChildren(node)) {
          return false;
        }
        var nodeId = String(node.id || "").trim();
        if (primaryTopNode && topNodes.length === 1 && nodeId === String(primaryTopNode.id || "").trim()) {
          return true;
        }
        return !!(singleL1Node && nodeId === String(singleL1Node.id || "").trim());
      }

      function isExpanded(node) {
        return !!(node && node.id && (isLockedOpenNode(node) || state.expanded[node.id]));
      }

      function getNodeLevelValue(node) {
        var parsedLevel = parseInt(String((node && node.level) || 0), 10);
        if (!Number.isFinite(parsedLevel) || parsedLevel < 0) {
          parsedLevel = getDepthValue(node);
        }
        return parsedLevel;
      }

      function getDepthValue(node) {
        var parsedDepth = parseInt(String((node && node.depth) || 0), 10);
        if (!Number.isFinite(parsedDepth) || parsedDepth < 0) {
          parsedDepth = 0;
        }
        return Math.min(parsedDepth + 1, 7);
      }

      function getLevelBadge(node) {
        var levelLabel = String((node && node.level_label) || "").trim();
        var parsedLevel = parseInt(String((node && node.level) || 0), 10);
        if (levelLabel) {
          return levelLabel;
        }
        if (!Number.isFinite(parsedLevel) || parsedLevel < 1) {
          parsedLevel = getDepthValue(node);
        }
        return "L" + String(parsedLevel);
      }

      function makeNode(tag, cls, text) {
        var el = document.createElement(tag || "div");
        if (cls) {
          el.className = cls;
        }
        if (text) {
          el.textContent = text;
        }
        return el;
      }

      function pluralizeWord(value, singular, plural) {
        var numeric = Math.max(0, parseInt(String(value || 0), 10) || 0);
        return String(numeric) + " " + (numeric === 1 ? singular : (plural || singular + "s"));
      }

      function getDisplayLabel(node) {
        return String((node && (node.display_label || node.label || node.full_label)) || "Untitled");
      }

      function getFullLabel(node) {
        return String((node && (node.full_label || node.display_label || node.label)) || "Untitled");
      }

      function normalizeCardTitleForCompare(value) {
        return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      }

      function getSecondaryCardTitle(node) {
        var catchyTitle = String((node && node.catchy_title) || "").replace(/\s+/g, " ").trim();
        var fullLabel = getFullLabel(node).replace(/\s+/g, " ").trim();
        var displayLabel = getDisplayLabel(node).replace(/\s+/g, " ").trim();
        if (catchyTitle && normalizeCardTitleForCompare(catchyTitle) !== normalizeCardTitleForCompare(displayLabel)) {
          return catchyTitle;
        }
        if (!fullLabel || normalizeCardTitleForCompare(fullLabel) === normalizeCardTitleForCompare(displayLabel)) {
          return "";
        }
        return fullLabel;
      }

      function getNodeImage(node) {
        return String((node && node.image) || "").trim();
      }

      function getNodeSummary(node) {
        var explicit = String((node && (node.summary || node.description)) || "").trim();
        if (explicit) {
          return explicit;
        }
        var childTotal = Math.max(0, parseInt(String((node && node.child_total) || 0), 10) || 0);
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        if (semantic === "l1" && childTotal > 0) {
          return "Open " + pluralizeWord(childTotal, "subtopic") + " from this section.";
        }
        if (semantic === "l2" && childTotal > 0) {
          return "This section opens into " + pluralizeWord(childTotal, "page") + ".";
        }
        return "";
      }

      function getVerticalSizeClass(node) {
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        var depth = getDepthValue(node);
        if (semantic === "root") {
          return "ct-node-root";
        }
        if (semantic === "l1") {
          return "ct-node-xl";
        }
        if (semantic === "l2" || depth === 3) {
          return "ct-node-lg";
        }
        if (depth === 4) {
          return "ct-node-md";
        }
        if (depth === 5) {
          return "ct-node-sm";
        }
        return "ct-node-xs";
      }

      function isLeafGridCandidate(nodeList, parentDepth) {
        if (!Array.isArray(nodeList) || nodeList.length < 2 || parentDepth < 2) {
          return false;
        }
        return nodeList.every(function (childNode) {
          return !hasChildren(childNode);
        });
      }

      function seedSingleRootCollapsedState() {
        if (topNodes.length !== 1 || !primaryTopNode || !primaryTopNode.id || !hasChildren(primaryTopNode)) {
          return;
        }

        state.expanded[primaryTopNode.id] = 1;

        if (!singleL1Node || !singleL1Node.id || !hasChildren(singleL1Node)) {
          return;
        }

        state.expanded[singleL1Node.id] = 1;
      }

      function ensureLeafGridOverlay(childrenWrap) {
        var overlay = childrenWrap.querySelector(".home-vertical-grid-overlay");
        if (overlay) {
          return overlay;
        }
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("class", "home-vertical-grid-overlay");
        overlay.setAttribute("aria-hidden", "true");
        childrenWrap.insertBefore(overlay, childrenWrap.firstChild || null);
        return overlay;
      }

      function refreshLeafGridOverlay(childrenWrap) {
        if (!childrenWrap || !childrenWrap.classList || !childrenWrap.classList.contains("home-vertical-children-leaf-grid")) {
          return;
        }

        var shouldUseOverlay = !window.matchMedia || !window.matchMedia("(max-width: 1119px)").matches;
        var overlay = childrenWrap.querySelector(".home-vertical-grid-overlay");
        if (!shouldUseOverlay) {
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          return;
        }

        overlay = ensureLeafGridOverlay(childrenWrap);
        while (overlay.firstChild) {
          overlay.removeChild(overlay.firstChild);
        }

        if (childrenWrap.hidden) {
          return;
        }

        var childWrappers = [];
        Array.prototype.forEach.call(childrenWrap.children, function (child) {
          if (child && child.classList && child.classList.contains("home-vertical-node")) {
            childWrappers.push(child);
          }
        });
        if (!childWrappers.length) {
          return;
        }

        var containerRect = childrenWrap.getBoundingClientRect();
        if (!containerRect.width || !containerRect.height) {
          return;
        }

        var connectorPoints = [];
        var railX = 2;
        childWrappers.forEach(function (child) {
          var row = child.querySelector(".home-vertical-node-row");
          var bubble = row ? row.querySelector(".home-vertical-bubble") : null;
          if (!bubble) {
            return;
          }
          var bubbleRect = bubble.getBoundingClientRect();
          var y = bubbleRect.top - containerRect.top + (bubbleRect.height * 0.5);
          var x = Math.max(railX + 18, bubbleRect.left - containerRect.left + 1);
          connectorPoints.push({ x: x, y: y });
        });

        if (!connectorPoints.length) {
          return;
        }

        overlay.setAttribute("viewBox", "0 0 " + Math.ceil(containerRect.width) + " " + Math.ceil(containerRect.height));
        overlay.setAttribute("width", String(Math.ceil(containerRect.width)));
        overlay.setAttribute("height", String(Math.ceil(containerRect.height)));

        var railBottom = connectorPoints.reduce(function (bottom, point) {
          return Math.max(bottom, point.y);
        }, 0);
        var rail = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rail.setAttribute("class", "home-vertical-grid-overlay-line home-vertical-grid-overlay-rail");
        rail.setAttribute("x1", String(railX));
        rail.setAttribute("y1", "0");
        rail.setAttribute("x2", String(railX));
        rail.setAttribute("y2", String(railBottom));
        overlay.appendChild(rail);

        connectorPoints.forEach(function (point) {
          var branch = document.createElementNS("http://www.w3.org/2000/svg", "line");
          branch.setAttribute("class", "home-vertical-grid-overlay-line");
          branch.setAttribute("x1", String(railX));
          branch.setAttribute("y1", String(point.y));
          branch.setAttribute("x2", String(point.x));
          branch.setAttribute("y2", String(point.y));
          overlay.appendChild(branch);
        });
      }

      function buildCard(node, branchToggle) {
        var depth = getDepthValue(node);
        var level = getNodeLevelValue(node);
        var sizeClass = getVerticalSizeClass(node);
        var lockedOpen = isLockedOpenNode(node);
        var card = document.createElement("div");
        card.className = "home-vertical-card home-vertical-bubble ct-node " + sizeClass;
        card.setAttribute("data-depth", String(depth));
        card.setAttribute("data-level", String(level));
        card.setAttribute("data-node-id", String((node && node.id) || ""));
        card.setAttribute("data-node-kind", String((node && node.kind) || ""));
        card.setAttribute("data-semantic-level", String((node && node.semantic_level) || "").trim().toLowerCase());

        var pageUrl = String((node && node.url) || "#");
        var fullLabel = getFullLabel(node);
        var readMoreLabel = getUiString("open-report", "Read more");
        var childNodes = getChildren(node);
        var link = makeNode("a", "ct-node-link home-vertical-primary-link");
        link.href = pageUrl;
        link.title = fullLabel;
        link.setAttribute("aria-label", "Open page: " + fullLabel);

        var imageSrc = getNodeImage(node);
        if (imageSrc && sizeClass !== "ct-node-xs") {
          var thumb = makeNode("div", "ct-node-thumb");
          var image = document.createElement("img");
          var semanticLevel = String((node && node.semantic_level) || "").trim().toLowerCase();
          var isPriorityThumb = semanticLevel === "root" || semanticLevel === "l1";
          image.src = imageSrc;
          image.alt = "";
          image.loading = isPriorityThumb ? "eager" : "lazy";
          image.decoding = isPriorityThumb ? "auto" : "async";
          if (isPriorityThumb) {
            image.fetchPriority = "high";
          }
          thumb.appendChild(image);
          link.appendChild(thumb);
        } else if (sizeClass !== "ct-node-xs") {
          link.appendChild(
            makeNode(
              "span",
              "ct-node-initial",
              String(getFullLabel(node) || "U").slice(0, 1).toUpperCase()
            )
          );
        }

        var content = makeNode("span", "ct-node-content");
        content.appendChild(makeNode("span", "ct-node-label", getDisplayLabel(node)));

        var secondaryTitle = getSecondaryCardTitle(node);
        if (secondaryTitle) {
          content.appendChild(makeNode("span", "ct-node-title-full", secondaryTitle));
        }

        var summary = getNodeSummary(node);
        if (summary) {
          content.appendChild(makeNode("span", "ct-node-summary", summary));
        }
        link.appendChild(content);
        card.appendChild(link);

        var count = Math.max(0, parseInt(String((node && node.count) || 0), 10) || 0);
        if (count > 1) {
          var badgeText = pluralizeWord(count, "page");
          var badge = childNodes.length && !lockedOpen
            ? makeNode("button", "ct-node-badge ct-node-badge-toggle", badgeText)
            : makeNode("span", "ct-node-badge", badgeText);
          badge.title = badgeText;
          badge.setAttribute("aria-label", badge.title);
          if (childNodes.length && !lockedOpen) {
            badge.type = "button";
            badge.setAttribute("data-home-vertical-badge-toggle", "");
            badge.setAttribute("aria-expanded", isExpanded(node) ? "true" : "false");
            badge.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              toggleVerticalExpansion(node, null, badge);
            });
          }
          card.appendChild(badge);
        }

        var actions = makeNode("div", "home-vertical-card-actions");
        if (branchToggle) {
          actions.appendChild(branchToggle);
        }
        var readMoreLink = makeNode("a", "topic-card-link home-vertical-read-more", readMoreLabel);
        readMoreLink.href = pageUrl;
        readMoreLink.title = fullLabel;
        readMoreLink.setAttribute("aria-label", readMoreLabel + " about " + fullLabel);
        actions.appendChild(readMoreLink);
        card.appendChild(actions);

        var childTotal = Math.max(0, parseInt(String((node && node.child_total) || 0), 10) || 0);
        if (childTotal >= 6) {
          card.classList.add("ct-node-heavy");
        } else if (childTotal >= 3) {
          card.classList.add("ct-node-medium");
        }

        if (pageUrl && pageUrl !== "#") {
          card.setAttribute("tabindex", "0");
          card.setAttribute("role", "link");
          card.setAttribute("aria-label", "Open page: " + fullLabel);
          card.addEventListener("click", function (event) {
            if (
              event.target
              && event.target.closest
              && event.target.closest("a, button, input, select, textarea, summary, label, [role='button'], [role='link']")
            ) {
              return;
            }
            window.location.assign(pageUrl);
          });
          card.addEventListener("keydown", function (event) {
            var key = String(event.key || "");
            if (key === "Enter" || key === " ") {
              event.preventDefault();
              window.location.assign(pageUrl);
            }
          });
        }

        return card;
      }

      function buildNode(node) {
        var depth = getDepthValue(node);
        var level = getNodeLevelValue(node);
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        var expanded = isExpanded(node);
        var lockedOpen = isLockedOpenNode(node);
        var wrapper = document.createElement("div");
        wrapper.className = "home-vertical-node";
        wrapper.setAttribute("data-depth", String(depth));
        wrapper.setAttribute("data-level", String(level));
        wrapper.setAttribute("data-node-id", String(node.id || ""));
        wrapper.setAttribute("data-semantic-level", semantic);
        wrapper.classList.add(expanded ? "is-expanded" : "is-collapsed");
        if (singleL1Node && String(node.id || "").trim() === String(singleL1Node.id || "").trim()) {
          wrapper.classList.add("is-single-l1");
          wrapper.setAttribute("data-home-vertical-single-l1", "true");
        }
        if (lockedOpen) {
          wrapper.classList.add("is-locked-open");
          wrapper.setAttribute("data-home-vertical-locked-open", "true");
        }
        if (depth === 1) {
          wrapper.id = "topic-vertical-" + slugify(String(node.basename || node.label || node.id || "topic"));
        }

        var row = document.createElement("div");
        row.className = "home-vertical-node-row";
        wrapper.appendChild(row);

        var childNodes = getChildren(node);
        var toggle = null;
        if (childNodes.length && !lockedOpen) {
          toggle = document.createElement("button");
          toggle.className = "home-vertical-toggle";
          toggle.type = "button";
          toggle.setAttribute("data-home-vertical-toggle", "");
          toggle.innerHTML = "";
          toggle.appendChild(makeNode("span", "home-vertical-toggle-icon", expanded ? "-" : "+"));
          toggle.appendChild(makeNode("span", "home-vertical-toggle-text", expanded ? "Hide subtopics" : "Show subtopics"));
          applyVerticalToggleState(toggle, node, expanded);
          toggle.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleVerticalExpansion(node, toggle, null);
          });
        }

        var spacer = document.createElement("span");
        spacer.className = "home-vertical-toggle-spacer";
        if (lockedOpen) {
          spacer.className += " home-vertical-toggle-spacer-locked";
        }
        spacer.setAttribute("aria-hidden", "true");
        row.appendChild(spacer);
        row.appendChild(buildCard(node, toggle));

        if (childNodes.length) {
          var childrenWrap = document.createElement("div");
          childrenWrap.className = "home-vertical-children";
          if (isLeafGridCandidate(childNodes, depth)) {
            childrenWrap.classList.add("home-vertical-children-leaf-grid");
            childrenWrap.setAttribute("data-leaf-grid-columns", childNodes.length >= 5 ? "3" : "2");
          }
          childrenWrap.id = "home-vertical-children-" + slugify(String(node.id || node.label || "branch"));
          childrenWrap.hidden = !expanded;
          childrenWrap.setAttribute("data-expanded", expanded ? "true" : "false");
          if (toggle) {
            toggle.setAttribute("aria-controls", childrenWrap.id);
          }
          childNodes.forEach(function (childNode) {
            childrenWrap.appendChild(buildNode(childNode));
          });
          wrapper.appendChild(childrenWrap);
        }

        return wrapper;
      }

      function render() {
        seedSingleRootCollapsedState();
        tree.innerHTML = "";
        var fragment = document.createDocumentFragment();
        topNodes.forEach(function (node) {
          fragment.appendChild(buildNode(node));
        });
        tree.appendChild(fragment);
        scheduleLeafGridOverlayRefresh();
      }

      function refreshAllLeafGridOverlays() {
        var grids = tree.querySelectorAll(".home-vertical-children.home-vertical-children-leaf-grid");
        Array.prototype.forEach.call(grids, function (grid) {
          refreshLeafGridOverlay(grid);
        });
      }

      function scheduleLeafGridOverlayRefresh() {
        if (container.__homeVerticalOverlayFrame) {
          cancelAnimationFrame(container.__homeVerticalOverlayFrame);
        }
        container.__homeVerticalOverlayFrame = requestAnimationFrame(function () {
          container.__homeVerticalOverlayFrame = 0;
          refreshAllLeafGridOverlays();
        });
      }

      if (shouldApplyDefaultExpansion && !hasStoredState) {
        topNodes.forEach(function (node) {
          if (hasChildren(node)) {
            state.expanded[node.id] = 1;
          }
        });
        seedSingleRootCollapsedState();
      }

      if (!container.__homeVerticalControlsBound) {
        var hasFlexibleExpansion = nodes.some(function (node) {
          return hasChildren(node) && !isLockedOpenNode(node);
        });
        var expandAllButton = container.querySelector("[data-home-vertical-expand-all]");
        if (expandAllButton) {
          expandAllButton.hidden = !hasFlexibleExpansion;
          expandAllButton.disabled = !hasFlexibleExpansion;
          expandAllButton.addEventListener("click", function () {
            nodes.forEach(function (node) {
              if (hasChildren(node) && !isLockedOpenNode(node)) {
                state.expanded[node.id] = 1;
              }
            });
            persistState();
            render();
          });
        }

        var collapseAllButton = container.querySelector("[data-home-vertical-collapse-all]");
        if (collapseAllButton) {
          collapseAllButton.hidden = !hasFlexibleExpansion;
          collapseAllButton.disabled = !hasFlexibleExpansion;
          collapseAllButton.addEventListener("click", function () {
            state.expanded = {};
            seedSingleRootCollapsedState();
            persistState();
            render();
          });
        }
        container.__homeVerticalControlsBound = true;
      }

      if (!container.__homeVerticalOverlayBound) {
        window.addEventListener("resize", scheduleLeafGridOverlayRefresh);
        if (window.ResizeObserver) {
          container.__homeVerticalOverlayObserver = new ResizeObserver(function () {
            scheduleLeafGridOverlayRefresh();
          });
          container.__homeVerticalOverlayObserver.observe(tree);
        }
        if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
          document.fonts.ready.then(function () {
            scheduleLeafGridOverlayRefresh();
          }).catch(function () {
            // Ignore font observer failures.
          });
        }
        container.__homeVerticalOverlayBound = true;
      }

      render();
    });
  }

  function initHomeFilter() {
    var input = document.querySelector("[data-home-filter]");
    var status = document.querySelector("[data-home-filter-status]");
    var clearButton = document.querySelector("[data-home-filter-clear]");
    var results = document.querySelector("[data-home-filter-results]");
    var allCards = document.querySelectorAll(".topic-card[data-card-search]");
    if (!input) {
      return;
    }
    var preparedHomePages = null;
    var preparedHomePagesIsFallback = false;
    var latestHomeFilterQuery = "";
    var latestHomeFilterRanked = [];
    var latestHomeFilterTotal = 0;
    var visibleHomeFilterResultLimit = searchPageResultRenderLimit;
    var allDisclosures = document.querySelectorAll("[data-home-disclosure]");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var disclosureStorageKey = "phoenix-home-disclosure-state-v1-" + siteScope;
    var disclosureState = {};
    try {
      var rawDisclosureState = String(readLocalStorage(disclosureStorageKey) || "").trim();
      if (rawDisclosureState) {
        var parsedDisclosureState = JSON.parse(rawDisclosureState);
        if (parsedDisclosureState && typeof parsedDisclosureState === "object") {
          disclosureState = parsedDisclosureState;
        }
      }
    } catch (err) {
      disclosureState = {};
    }

    var getDisclosureKey = function (node, index) {
      if (!node) {
        return "";
      }
      var explicitKey = String(node.getAttribute("data-home-disclosure-key") || "").trim();
      if (explicitKey) {
        return explicitKey;
      }
      var summary = node.querySelector("summary");
      var label = String((summary && summary.textContent) || "").trim().toLowerCase();
      if (label) {
        return "home-" + slugify(label);
      }
      return "home-disclosure-" + String(index || 0);
    };

    var persistDisclosureState = function (node, index) {
      var key = getDisclosureKey(node, index);
      if (!key) {
        return;
      }
      disclosureState[key] = node.hasAttribute("open") ? 1 : 0;
      try {
        writeLocalStorage(disclosureStorageKey, JSON.stringify(disclosureState));
      } catch (err) {
        // Ignore storage write failures.
      }
    };

    var setDisclosureOpen = function (node, shouldOpen) {
      if (!node) {
        return;
      }
      if (shouldOpen) {
        node.setAttribute("open", "open");
      } else {
        node.removeAttribute("open");
      }
    };

    var restoreDisclosureDefaults = function (targetDisclosures) {
      Array.prototype.forEach.call(targetDisclosures || allDisclosures, function (node, index) {
        if (node && node.hasAttribute("data-home-mobile-disclosure")) {
          return;
        }
        var disclosureKey = getDisclosureKey(node, index);
        var storedToken = disclosureKey ? disclosureState[disclosureKey] : null;
        var hasStoredState = storedToken === 0 || storedToken === 1 || storedToken === true || storedToken === false;
        var defaultOpen = String(node.getAttribute("data-default-open") || "").toLowerCase() === "true";
        setDisclosureOpen(node, hasStoredState ? (storedToken === 1 || storedToken === true) : defaultOpen);
      });
    };

    var getUniqueCount = function (nodeList) {
      var seen = Object.create(null);
      var fallbackCount = 0;
      Array.prototype.forEach.call(nodeList, function (card) {
        var baseKey = String(card.getAttribute("data-card-base") || "").trim();
        if (!baseKey) {
          fallbackCount += 1;
          return;
        }
        seen[baseKey] = true;
      });
      return Object.keys(seen).length + fallbackCount;
    };

    var getHomeCardRecord = function (card, index) {
      var link = card.querySelector(".topic-card-link[href], h3 a[href], .topic-card-media[href]");
      var titleNode = card.querySelector("h3 a, h3, .topic-card-link");
      var summaryNode = card.querySelector(".topic-card-summary");
      var kickerNode = card.querySelector(".topic-card-kicker");
      var href = link ? String(link.getAttribute("href") || "").trim() : "";
      var title = collapseSearchText(
        card.getAttribute("data-card-title")
        || (titleNode && titleNode.textContent)
        || (link && (link.getAttribute("title") || link.textContent))
        || ""
      );
      var description = collapseSearchText(summaryNode ? summaryNode.textContent : "");
      var breadcrumb = collapseSearchText(kickerNode ? kickerNode.textContent : "");
      var text = collapseSearchText(card.getAttribute("data-card-search") || card.textContent || "");
      return {
        title: title,
        url: href || "#",
        description: description,
        breadcrumb: breadcrumb,
        text: text,
        level: Number(card.getAttribute("data-level") || card.getAttribute("data-card-level") || 0) || 0,
        _index: index || 0,
        _searchBlob: collapseSearchText([title, breadcrumb, description, text].join(" "))
      };
    };

    var collectHomeSearchRecords = function (cards) {
      var seen = Object.create(null);
      var records = [];
      Array.prototype.forEach.call(cards, function (card, index) {
        var record = getHomeCardRecord(card, index);
        if (!record.title || !record.url || record.url === "#") {
          return;
        }
        var key = String(card.getAttribute("data-card-base") || record.url || record.title).trim();
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        records.push(record);
      });
      return records;
    };

    var getHomeSearchRecords = function (cards, cardRecords) {
      cardRecords = cardRecords || collectHomeSearchRecords(cards);
      if (cardRecords.length) {
        return cardRecords;
      }
      if (!preparedHomePages || (preparedHomePagesIsFallback && isSiteSearchIndexLoaded())) {
        preparedHomePages = prepareSiteSearchPages();
        preparedHomePagesIsFallback = !isSiteSearchIndexLoaded();
      }
      return preparedHomePages;
    };

    var renderHomeSearchResult = function (record, query, hitCount) {
      var snippetSource = [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
      var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
      var hitCountPill = numericHitCount > 0
        ? '<span class="site-search-result-hit-count">' + escapeHtml(numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits") + "</span>"
        : "";
      return ""
        + '<a class="site-search-result home-filter-result" href="' + escapeHtml(buildUrlWithSearchHighlight(record.url || "#", query)) + '">'
        + '<span class="site-search-result-kicker">' + escapeHtml(record.breadcrumb || getUiString("overview", "Overview")) + "</span>"
        + '<span class="site-search-result-title">' + escapeHtml(record.title || getUiString("overview", "Overview")) + "</span>"
        + '<span class="site-search-result-meta-row">'
        + '<span class="site-search-result-meta">' + escapeHtml(getSearchMatchKind(record, query)) + "</span>"
        + hitCountPill
        + "</span>"
        + '<span class="site-search-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 230) + "</span>"
        + "</a>";
    };

    var renderHomeFilterResultBatch = function (ranked, query, totalUniqueReports) {
      if (!results) {
        return;
      }
      var visibleLimit = Math.min(visibleHomeFilterResultLimit, ranked.length);
      results.hidden = false;
      results.innerHTML = ranked.slice(0, visibleLimit).map(function (item) {
        return renderHomeSearchResult(item.page, query, item.hitCount);
      }).join("") + (ranked.length > visibleLimit
        ? '<button class="site-search-more-button home-filter-more-button" type="button" data-home-filter-show-more>Show more</button>'
        : "");
      if (status) {
        status.setAttribute("data-state", "active");
        status.textContent = ranked.length > visibleLimit
          ? "Showing first " + String(visibleLimit) + " of " + String(ranked.length) + " matching pages for \"" + query + "\"."
          : "Showing " + String(ranked.length) + " of " + String(totalUniqueReports) + " pages for \"" + query + "\".";
      }
    };

    var collectFilterContext = function () {
      var contextCards = [];
      var addCard = function (card) {
        if (!card || contextCards.indexOf(card) !== -1) {
          return;
        }
        contextCards.push(card);
      };
      Array.prototype.forEach.call(allCards, addCard);

      return {
        cards: contextCards
      };
    };

    var applyFilter = function () {
      var query = String(input.value || "").trim().toLowerCase();
      var context = collectFilterContext();
      var cards = context.cards;
      var cardRecords = collectHomeSearchRecords(cards);
      var records = query ? getHomeSearchRecords(cards, cardRecords) : cardRecords;
      if (query !== latestHomeFilterQuery) {
        visibleHomeFilterResultLimit = searchPageResultRenderLimit;
      }
      if (query && !cardRecords.length && preparedHomePagesIsFallback) {
        loadSiteSearchIndex().then(function () {
          preparedHomePages = null;
          preparedHomePagesIsFallback = false;
          if (String(input.value || "").trim().toLowerCase() === query) {
            applyFilter();
          }
        }).catch(function () {
          // Keep the home search on local fallback records if the full index is unavailable.
        });
      }
      var ranked = query
        ? rankSearchRecords(records, query, "all")
        : [];
      var totalUniqueReports = records.length || getUniqueCount(cards);
      latestHomeFilterQuery = query;
      latestHomeFilterRanked = ranked;
      latestHomeFilterTotal = totalUniqueReports;

      Array.prototype.forEach.call(allCards, function (card) {
        card.classList.remove("is-filtered-out");
        card.classList.remove("is-search-match");
      });
      if (!query) {
        restoreDisclosureDefaults();
      }

      if (results) {
        if (!query) {
          results.hidden = true;
          results.innerHTML = "";
        } else if (!ranked.length) {
          results.hidden = false;
          results.innerHTML = '<p class="site-search-empty">' + escapeHtml("No pages match \"" + query + "\". Try a broader section or keyword.") + "</p>";
        } else {
          renderHomeFilterResultBatch(ranked, query, totalUniqueReports);
        }
      }

      if (status) {
        var visibleUnique = ranked.length;
        if (!query) {
          status.setAttribute("data-state", "default");
          status.textContent = "";
        } else if (!visibleUnique) {
          status.setAttribute("data-state", "empty");
          status.textContent = "No pages match \"" + query + "\". Try a broader section or keyword.";
        } else {
          status.setAttribute("data-state", "active");
          if (!results) {
            status.textContent = "Showing " + String(visibleUnique) + " of " + String(totalUniqueReports) + " pages for \"" + query + "\".";
          }
        }
      }

      if (clearButton) {
        clearButton.hidden = !query;
      }
    };
    var scheduledHomeFilter = createSearchRenderScheduler(applyFilter, {
      shouldRenderImmediately: function () {
        return !String(input.value || "").trim();
      },
      onPending: function () {
        if (status && String(input.value || "").trim()) {
          status.setAttribute("data-state", "active");
          status.textContent = "Searching...";
        }
      }
    });
    input.addEventListener("input", function () {
      scheduledHomeFilter.schedule();
    });
    input.addEventListener("keydown", function (event) {
      var key = String(event.key || "");
      if (key === "Enter" && String(input.value || "").trim()) {
        event.preventDefault();
        scheduledHomeFilter.cancel();
        navigateToSearchResultsPage(input.value);
        return;
      }
      if (key === "Escape" && String(input.value || "").trim()) {
        input.value = "";
        scheduledHomeFilter.flush();
      }
    });
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        input.value = "";
        scheduledHomeFilter.flush();
        input.focus();
      });
    }
    if (results) {
      results.addEventListener("click", function (event) {
        var button = event.target && event.target.closest ? event.target.closest("[data-home-filter-show-more]") : null;
        if (!button || !results.contains(button) || !latestHomeFilterRanked.length) {
          return;
        }
        visibleHomeFilterResultLimit = Math.min(
          latestHomeFilterRanked.length,
          visibleHomeFilterResultLimit + searchPageResultRenderLimit
        );
        renderHomeFilterResultBatch(latestHomeFilterRanked, latestHomeFilterQuery, latestHomeFilterTotal);
      });
    }
    Array.prototype.forEach.call(allDisclosures, function (node, index) {
      node.addEventListener("toggle", function () {
        if (String(input.value || "").trim()) {
          return;
        }
        persistDisclosureState(node, index);
      });
    });
    document.addEventListener("phoenix-home-mode-changed", function () {
      scheduledHomeFilter.flush();
    });
    applyFilter();
  }

  function initHomeCardNavigation() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var cards = document.querySelectorAll(".topic-card, .home-vertical-card");
    if (!cards.length) {
      return;
    }

    function isInteractiveTarget(node, card) {
      if (!node || !node.closest) {
        return false;
      }
      var interactive = node.closest("a, button, input, select, textarea, summary, label, [role='button'], [role='link']");
      return Boolean(interactive && interactive !== card);
    }

    Array.prototype.forEach.call(cards, function (card) {
      if (!card) {
        return;
      }
      var primaryLink = card.querySelector(
        ".home-vertical-primary-link, .topic-card-link, h3 a, .topic-card-media, .ct-node-link"
      );
      if (!primaryLink) {
        return;
      }
      var href = String(primaryLink.getAttribute("href") || "").trim();
      if (!href) {
        return;
      }

      if (!card.hasAttribute("tabindex")) {
        card.setAttribute("tabindex", "0");
      }
      card.setAttribute("role", "link");
      if (!card.getAttribute("aria-label")) {
        var label = String(
          primaryLink.getAttribute("aria-label")
          || primaryLink.getAttribute("title")
          || primaryLink.textContent
          || ""
        ).trim();
        if (label) {
          card.setAttribute("aria-label", label);
        }
      }

      var navigateToCard = function () {
        window.location.assign(href);
      };

      card.addEventListener("click", function (event) {
        if (isInteractiveTarget(event.target, card)) {
          return;
        }
        navigateToCard();
      });

      card.addEventListener("keydown", function (event) {
        if (isInteractiveTarget(event.target, card)) {
          return;
        }
        var key = String(event.key || "");
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          navigateToCard();
        }
      });
    });
  }

  function initHierarchyGraphs() {
    var homeGraphContainers = document.querySelectorAll("[data-hierarchy-graph]");
    var articleGraphContainers = document.querySelectorAll("[data-branch-graph]");
    if (!homeGraphContainers.length && !articleGraphContainers.length) {
      return;
    }

    var svgNs = "http://www.w3.org/2000/svg";

    function createSvgNode(tagName) {
      return document.createElementNS(svgNs, tagName);
    }

    function clearSvg(svg) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }
    }

    function normalizeLabelText(text) {
      return String(text || "")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
    }

    function truncateLabel(text, maxLength) {
      var value = normalizeLabelText(text);
      if (!value) {
        return "";
      }
      if (value.length <= maxLength) {
        return value;
      }
      return value.slice(0, Math.max(1, maxLength - 3)).trim() + "...";
    }

    function splitLabelLines(text, maxCharsPerLine, maxLines) {
      var value = normalizeLabelText(text);
      if (!value) {
        return [""];
      }
      var words = value.split(" ");
      if (words.length === 1) {
        return [truncateLabel(value, maxCharsPerLine)];
      }
      var lines = [];
      var current = "";
      for (var index = 0; index < words.length; index += 1) {
        var word = words[index];
        var proposed = current ? (current + " " + word) : word;
        if (proposed.length <= maxCharsPerLine || !current) {
          current = proposed;
        } else {
          lines.push(current);
          current = word;
        }
        if (lines.length === maxLines - 1) {
          if (index + 1 < words.length) {
            current = current + " " + words.slice(index + 1).join(" ");
          }
          break;
        }
      }
      if (current) {
        lines.push(current);
      }
      lines = lines.slice(0, Math.max(1, maxLines));
      if (lines.length === 2) {
        var stopwordPattern = /^(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|vs?)$/i;
        var firstWords = lines[0].split(" ").filter(Boolean);
        var secondWords = lines[1].split(" ").filter(Boolean);
        while (firstWords.length > 1) {
          var secondLineText = secondWords.join(" ");
          var weakSecondLine = secondWords.length <= 1 || secondLineText.length < 10;
          var weakFirstEnding = stopwordPattern.test(firstWords[firstWords.length - 1] || "");
          if (!weakSecondLine && !weakFirstEnding) {
            break;
          }
          var candidateSecondWords = [firstWords[firstWords.length - 1]].concat(secondWords);
          var candidateFirstWords = firstWords.slice(0, -1);
          var candidateFirst = candidateFirstWords.join(" ");
          var candidateSecond = candidateSecondWords.join(" ");
          if (!candidateFirst || candidateSecond.length > maxCharsPerLine) {
            break;
          }
          firstWords = candidateFirstWords;
          secondWords = candidateSecondWords;
        }
        lines = [firstWords.join(" "), secondWords.join(" ")].filter(Boolean);
      }
      return lines;
    }

    function getNodeLabelBudget(node) {
      var kind = String((node && node.kind) || "").trim().toLowerCase();
      if (kind === "root" || kind === "current") {
        return 26;
      }
      if (kind === "branch" || kind === "parent" || kind === "sibling") {
        return 22;
      }
      return 18;
    }

    function readNodeCount(node) {
      var explicit = parseInt(String((node && node.count) || 0), 10);
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
      }
      var rawLabel = String((node && node.label) || "").trim();
      var match = rawLabel.match(/^\+(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return 1;
    }

    function getNodeDimensions(node, isCompact) {
      var kind = String((node && node.kind) || "").trim().toLowerCase();
      if (kind === "current") {
        return { width: isCompact ? 224 : 264, height: 80 };
      }
      if (kind === "root") {
        return { width: isCompact ? 232 : 276, height: 84 };
      }
      if (kind.indexOf("cluster") !== -1) {
        return { width: isCompact ? 162 : 182, height: 70 };
      }
      if (kind === "parent") {
        return { width: isCompact ? 188 : 214, height: 72 };
      }
      if (kind === "branch" || kind === "sibling") {
        return { width: isCompact ? 186 : 210, height: 74 };
      }
      return { width: isCompact ? 164 : 184, height: 68 };
    }

    function buildSpreadPositions(count, minX, maxX, y) {
      var points = [];
      if (count <= 0) {
        return points;
      }
      if (count === 1) {
        points.push({ x: Math.round((minX + maxX) / 2), y: y });
        return points;
      }
      var step = (maxX - minX) / (count - 1);
      for (var i = 0; i < count; i += 1) {
        points.push({ x: Math.round(minX + (step * i)), y: y });
      }
      return points;
    }

    function appendEdge(svg, x1, y1, x2, y2, className, nodeId) {
      var path = createSvgNode("path");
      var controlX = Math.round((x1 + x2) / 2);
      var controlY = Math.round((y1 + y2) / 2);
      path.setAttribute("class", "branch-graph-edge hierarchy-graph-edge " + String(className || ""));
      path.setAttribute("d", "M " + x1 + " " + y1 + " Q " + controlX + " " + controlY + " " + x2 + " " + y2);
      if (nodeId) { path.setAttribute("data-edge-for", nodeId); }
      svg.appendChild(path);
    }

    function appendNode(svg, node, options) {
      var opts = options || {};
      var compact = Boolean(opts.compact);
      var dims = getNodeDimensions(node, compact);
      var width = dims.width;
      var height = dims.height;
      var group = createSvgNode("g");
      var kind = String(node.kind || "child").trim().toLowerCase();
      group.setAttribute(
        "class",
        "hierarchy-graph-node branch-graph-node branch-graph-node-" + kind + " hierarchy-graph-node-" + kind
      );
      group.setAttribute("transform", "translate(" + Math.round(node.x) + " " + Math.round(node.y) + ")");
      group.setAttribute("data-kind", kind);

      var card = createSvgNode("rect");
      card.setAttribute("class", "hierarchy-graph-card");
      card.setAttribute("x", String(-Math.round(width / 2)));
      card.setAttribute("y", String(-Math.round(height / 2)));
      card.setAttribute("width", String(width));
      card.setAttribute("height", String(height));
      card.setAttribute("rx", kind === "root" ? "18" : "16");
      card.setAttribute("ry", kind === "root" ? "18" : "16");
      group.appendChild(card);

      var accent = createSvgNode("rect");
      accent.setAttribute("class", "hierarchy-graph-accent");
      accent.setAttribute("x", String(-Math.round(width / 2)));
      accent.setAttribute("y", String(-Math.round(height / 2)));
      accent.setAttribute("width", "10");
      accent.setAttribute("height", String(height));
      accent.setAttribute("rx", "16");
      accent.setAttribute("ry", "16");
      group.appendChild(accent);

      var imageOffset = 0;
      if (node.image && width >= 184) {
        var thumb = createSvgNode("image");
        thumb.setAttribute("href", node.image);
        thumb.setAttribute("x", String(-Math.round(width / 2) + 16));
        thumb.setAttribute("y", String(-Math.round(height / 2) + 14));
        thumb.setAttribute("width", "34");
        thumb.setAttribute("height", "34");
        thumb.setAttribute("preserveAspectRatio", "xMidYMid slice");
        thumb.setAttribute("class", "hierarchy-graph-thumb");
        group.appendChild(thumb);
        imageOffset = 42;
      }

      var labelBudget = getNodeLabelBudget(node);
      var labelLines = splitLabelLines(String(node.label || node.full_label || ""), labelBudget, 2);
      var text = createSvgNode("text");
      text.setAttribute("class", "hierarchy-graph-label");
      text.setAttribute("x", String(-Math.round(width / 2) + 20 + imageOffset));
      text.setAttribute("y", labelLines.length > 1 ? "-6" : "0");
      text.setAttribute("text-anchor", "start");
      text.setAttribute("xml:space", "preserve");
      for (var lineIndex = 0; lineIndex < labelLines.length; lineIndex += 1) {
        var tspan = createSvgNode("tspan");
        tspan.setAttribute("x", String(-Math.round(width / 2) + 20 + imageOffset));
        tspan.setAttribute("dy", lineIndex === 0 ? "0" : "15");
        tspan.setAttribute("xml:space", "preserve");
        var lineText = truncateLabel(labelLines[lineIndex], labelBudget);
        if (lineIndex < labelLines.length - 1) {
          lineText += " ";
        }
        tspan.textContent = lineText;
        text.appendChild(tspan);
      }
      group.appendChild(text);

      var count = readNodeCount(node);
      if (count > 1 || kind.indexOf("cluster") !== -1) {
        var badgeWidth = Math.max(34, String(count).length * 9 + 20);
        var badgeRect = createSvgNode("rect");
        badgeRect.setAttribute("class", "hierarchy-graph-badge");
        badgeRect.setAttribute("x", String(Math.round(width / 2) - badgeWidth - 12));
        badgeRect.setAttribute("y", String(-Math.round(height / 2) + 12));
        badgeRect.setAttribute("width", String(badgeWidth));
        badgeRect.setAttribute("height", "22");
        badgeRect.setAttribute("rx", "11");
        badgeRect.setAttribute("ry", "11");
        group.appendChild(badgeRect);

        var badgeText = createSvgNode("text");
        badgeText.setAttribute("class", "hierarchy-graph-badge-text");
        badgeText.setAttribute("x", String(Math.round(width / 2) - badgeWidth / 2 - 12));
        badgeText.setAttribute("y", String(-Math.round(height / 2) + 27));
        badgeText.textContent = kind.indexOf("cluster") !== -1 ? ("+" + String(count)) : String(count);
        group.appendChild(badgeText);
      }

      var title = createSvgNode("title");
      title.textContent = String(node.full_label || node.label || "").trim() || "Node";
      group.appendChild(title);

      if (node.url) {
        var anchor = createSvgNode("a");
        anchor.setAttribute("href", node.url);
        anchor.setAttribute("data-node-id", String(node._edgeId || ""));
        anchor.setAttribute("class", "hierarchy-graph-anchor branch-graph-anchor");
        anchor.appendChild(group);
        svg.appendChild(anchor);
      } else {
        svg.appendChild(group);
      }
    }

    function renderArticleGraph(container) {
      var svg = container.querySelector("svg");
      if (!svg) {
        return;
      }

      var currentLabel = String(container.getAttribute("data-current-label") || "").trim();
      if (!currentLabel) {
        container.hidden = true;
        return;
      }

      var parentNode = null;
      var siblingNodes = [];
      var childNodes = [];
      Array.prototype.forEach.call(container.querySelectorAll("[data-graph-item]"), function (item) {
        var kind = String(item.getAttribute("data-kind") || "").trim().toLowerCase();
        var label = String(item.getAttribute("data-label") || "").trim();
        var url = String(item.getAttribute("data-url") || "").trim();
        var count = parseInt(String(item.getAttribute("data-count") || "1"), 10);
        if (!label) {
          return;
        }
        var graphNode = {
          kind: kind,
          label: label,
          full_label: label,
          url: url,
          count: Number.isFinite(count) ? count : 1
        };
        if (kind === "parent" && !parentNode) {
          parentNode = graphNode;
        } else if (kind === "sibling" || kind === "sibling-cluster") {
          siblingNodes.push(graphNode);
        } else if (kind === "child" || kind === "child-cluster") {
          childNodes.push(graphNode);
        }
      });

      if (!parentNode || (siblingNodes.length < 2 && childNodes.length < 2)) {
        container.hidden = true;
        return;
      }

      clearSvg(svg);
      var compact = Boolean(container.clientWidth && container.clientWidth < 700);
      var maxPerRow = compact ? 4 : 6;
      var siblingRows = Math.max(1, Math.ceil(siblingNodes.length / maxPerRow));
      var childRows = Math.max(1, Math.ceil(childNodes.length / maxPerRow));
      var width = compact ? 820 : 1080;
      var baseH = compact ? 340 : 300;
      var perRow = compact ? 100 : 90;
      var height = baseH + Math.max(0, siblingRows - 1) * perRow + Math.max(0, childRows - 1) * perRow;
      var centerX = Math.round(width / 2);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      var currentNode = {
        kind: "current",
        label: currentLabel,
        full_label: currentLabel,
        url: String(container.getAttribute("data-current-url") || "").trim(),
        count: 1,
        x: centerX,
        y: compact ? 164 : 176
      };
      parentNode.x = centerX;
      parentNode.y = compact ? 62 : 58;

      /* Multi-row spread: wraps nodes to rows of maxPerRow */
      function buildMultiRowPositions(nodes, minX, maxX, startY, rowGap) {
        var positions = [];
        var total = nodes.length;
        for (var r = 0; r < Math.ceil(total / maxPerRow); r++) {
          var rStart = r * maxPerRow;
          var rCount = Math.min(maxPerRow, total - rStart);
          var rowPositions = buildSpreadPositions(rCount, minX, maxX, startY + r * rowGap);
          for (var p = 0; p < rowPositions.length; p++) {
            positions.push(rowPositions[p]);
          }
        }
        return positions;
      }
      var edgeMinX = compact ? 110 : 120;
      var edgeMaxX = compact ? width - 110 : width - 120;
      var siblingY = compact ? 266 : 126;
      var childY = (compact ? 346 : 294) + Math.max(0, siblingRows - 1) * perRow;
      var siblingPositions = buildMultiRowPositions(siblingNodes, edgeMinX, edgeMaxX, siblingY, perRow);
      var childPositions = buildMultiRowPositions(childNodes, edgeMinX, edgeMaxX, childY, perRow);
      for (var siblingIndex = 0; siblingIndex < siblingNodes.length; siblingIndex += 1) {
        siblingNodes[siblingIndex].x = siblingPositions[siblingIndex].x;
        siblingNodes[siblingIndex].y = siblingPositions[siblingIndex].y;
        siblingNodes[siblingIndex]._edgeId = "node-" + siblingIndex;
      }
      for (var childIndex = 0; childIndex < childNodes.length; childIndex += 1) {
        childNodes[childIndex].x = childPositions[childIndex].x;
        childNodes[childIndex].y = childPositions[childIndex].y;
        childNodes[childIndex]._edgeId = "node-child-" + childIndex;
      }

      appendEdge(svg, parentNode.x, parentNode.y + 30, currentNode.x, currentNode.y - 38, "branch-graph-edge-parent");
      siblingNodes.forEach(function (node) {
        appendEdge(svg, currentNode.x, currentNode.y - 16, node.x, node.y - 30, "branch-graph-edge-sibling", "node-" + siblingNodes.indexOf(node));
      });
      childNodes.forEach(function (node) {
        appendEdge(svg, currentNode.x, currentNode.y + 28, node.x, node.y - 32, "branch-graph-edge-child", "node-child-" + childNodes.indexOf(node));
      });

      appendNode(svg, parentNode, { compact: compact });
      appendNode(svg, currentNode, { compact: compact });
      siblingNodes.forEach(function (node) {
        appendNode(svg, node, { compact: compact });
      });
      childNodes.forEach(function (node) {
        appendNode(svg, node, { compact: compact });
      });

      /* Edge hover: highlight connected edges on node hover */
      Array.prototype.forEach.call(svg.querySelectorAll(".branch-graph-anchor"), function (anchor) {
        var nodeId = anchor.getAttribute("data-node-id") || "";
        if (!nodeId) { return; }
        anchor.addEventListener("mouseenter", function () {
          var allEdges = svg.querySelectorAll(".branch-graph-edge");
          for (var ei = 0; ei < allEdges.length; ei++) {
            var edgeFor = allEdges[ei].getAttribute("data-edge-for") || "";
            if (edgeFor === nodeId) {
              allEdges[ei].classList.add("edge-highlighted");
              allEdges[ei].classList.remove("edge-dimmed");
            } else if (edgeFor) {
              allEdges[ei].classList.add("edge-dimmed");
              allEdges[ei].classList.remove("edge-highlighted");
            }
          }
        });
        anchor.addEventListener("mouseleave", function () {
          var allEdges = svg.querySelectorAll(".branch-graph-edge");
          for (var ei = 0; ei < allEdges.length; ei++) {
            allEdges[ei].classList.remove("edge-highlighted");
            allEdges[ei].classList.remove("edge-dimmed");
          }
        });
      });
    }

    function createHtmlNode(tagName, className, text) {
      var node = document.createElement(tagName);
      if (className) {
        node.className = className;
      }
      if (text !== undefined && text !== null) {
        node.textContent = String(text);
      }
      return node;
    }

    function applyHomeClusterNodeMeta(element, node) {
      if (!element || !node) {
        return;
      }
      var densityTier = String(node.density_tier || "").trim().toLowerCase();
      var titleBucket = String(node.title_length_bucket || "").trim().toLowerCase();
      if (densityTier) {
        element.setAttribute("data-density-tier", densityTier);
        element.classList.add("is-tier-" + densityTier);
      }
      if (titleBucket) {
        element.setAttribute("data-title-bucket", titleBucket);
        element.classList.add("is-title-" + titleBucket);
      }
      if (node.semantic_level) {
        element.setAttribute("data-semantic-level", String(node.semantic_level));
      }
      if (node.render_hint) {
        element.setAttribute("data-render-hint", String(node.render_hint));
      }
      if (node.preferred_cluster_strategy) {
        element.setAttribute("data-preferred-cluster-strategy", String(node.preferred_cluster_strategy));
      }
      if (node.preferred_subtree_layout) {
        element.setAttribute("data-preferred-subtree-layout", String(node.preferred_subtree_layout));
      }
      if (node.subtree_shape && typeof node.subtree_shape === "object") {
        var subtreeShape = node.subtree_shape;
        var subtreeTotal = parseInt(String(subtreeShape.total_nodes || 0), 10);
        var subtreeDepth = parseInt(String(subtreeShape.max_depth || 0), 10);
        var subtreeBreadth = parseInt(String(subtreeShape.max_breadth || 0), 10);
        var subtreeChildCount = parseInt(String(subtreeShape.child_count || 0), 10);
        if (Number.isFinite(subtreeTotal)) {
          element.setAttribute("data-subtree-total", String(subtreeTotal));
        }
        if (Number.isFinite(subtreeDepth)) {
          element.setAttribute("data-subtree-depth", String(subtreeDepth));
        }
        if (Number.isFinite(subtreeBreadth)) {
          element.setAttribute("data-subtree-breadth", String(subtreeBreadth));
        }
        if (Number.isFinite(subtreeChildCount)) {
          element.setAttribute("data-subtree-child-count", String(subtreeChildCount));
        }
      }
    }

    function getHomeClusterTierRank(tier) {
      var normalized = String(tier || "balanced").trim().toLowerCase();
      if (normalized === "sparse") {
        return 0;
      }
      if (normalized === "balanced") {
        return 1;
      }
      if (normalized === "dense") {
        return 2;
      }
      return 3;
    }

    function chunkHomeClusterItems(items, pageSize) {
      var source = Array.isArray(items) ? items.slice() : [];
      var size = Math.max(1, parseInt(String(pageSize || 1), 10) || 1);
      var pages = [];
      for (var index = 0; index < source.length; index += size) {
        pages.push(source.slice(index, index + size));
      }
      return pages;
    }

    function getHomeClusterPageSize(kind, width, tier) {
      var rank = getHomeClusterTierRank(tier);
      if (kind === "l1-overview") {
        if (rank <= 1) {
          return width >= 1220 ? 12 : (width >= 860 ? 8 : 4);
        }
        if (rank === 2) {
          return width >= 1220 ? 8 : (width >= 860 ? 6 : 3);
        }
        return 0;
      }
      if (kind === "l1-focus") {
        if (width >= 1220) {
          return 8;
        }
        if (width >= 860) {
          return 6;
        }
        return 4;
      }
      if (kind === "l2-overview") {
        if (rank <= 1) {
          if (width >= 1220) {
            return 3;
          }
          if (width >= 860) {
            return 2;
          }
          return 1;
        }
        if (rank === 2) {
          return width >= 860 ? 1 : 0;
        }
        return 0;
      }
      if (kind === "l2-focus") {
        if (width >= 1220) {
          return 12;
        }
        if (width >= 860) {
          return 8;
        }
        return 5;
      }
      if (kind === "l3-focus") {
        if (width >= 1220) {
          return 16;
        }
        if (width >= 860) {
          return 12;
        }
        return 8;
      }
      if (kind === "group-overview") {
        return width >= 860 ? 2 : 1;
      }
      return 1;
    }

    function renderHomeClusterMap(container, payload, nodes) {

      var board = container.querySelector("[data-home-cluster-board]");

      var focusTray = container.querySelector("[data-home-cluster-focus]");

      if (!board) {

        container.hidden = true;

        return;

      }



      var width = Math.max(

        Math.round((container.getBoundingClientRect && container.getBoundingClientRect().width) || 0),

        container.clientWidth || 0,

        (container.parentElement && Math.round((container.parentElement.getBoundingClientRect && container.parentElement.getBoundingClientRect().width) || 0)) || 0,

        320

      );
      var viewportWidth = Math.max(
        document.documentElement ? (document.documentElement.clientWidth || 0) : 0,
        window.innerWidth || 0,
        width
      );
      var isVertical = width < 720;

      var nodeById = {};

      var childrenByParent = {};

      var branchByBase = {};



      container.hidden = false;

      container.setAttribute("data-home-cluster-version", String(payload.home_cluster_version || 3));

      container.classList.add("home-cluster-tree-mode");



      nodes.forEach(function (node) {

        nodeById[node.id] = node;

        var parentId = String(node.parent_id || "").trim();

        if (parentId) {

          if (!childrenByParent[parentId]) {

            childrenByParent[parentId] = [];

          }

          childrenByParent[parentId].push(node);

        }

        if (String(node.semantic_level || "") === "l1" && node.basename) {

          branchByBase[String(node.basename)] = node.id;

        }

      });

      Object.keys(childrenByParent).forEach(function (parentId) {

        childrenByParent[parentId].sort(function (a, b) {

          var aSlot = parseInt(String(a.slot_index || 0), 10);

          var bSlot = parseInt(String(b.slot_index || 0), 10);

          if (Number.isFinite(aSlot) && Number.isFinite(bSlot) && aSlot !== bSlot) {

            return aSlot - bSlot;

          }

          return String(a.label || "").localeCompare(String(b.label || ""));

        });

      });

      var currentPath = normalizePath(window.location.pathname);
      var pathParts = currentPath.split("/").filter(Boolean);
      var siteScope = pathParts.length ? pathParts[0] : "root";
      var branchStorageKey = "phoenix-home-cluster-branch-v1-" + siteScope + "-" + currentPath.replace(/[^\w/-]+/g, "_");



      var rootNode = nodes.filter(function (node) {

        return parseInt(String(node.depth || 0), 10) === 0;

      })[0] || null;

      var allBranches = rootNode ? (childrenByParent[rootNode.id] || []) : [];

      if (!rootNode || !allBranches.length) {

        container.hidden = true;

        return;

      }



      /* --- Shape Analysis --- */

      var shape = payload.shape || {};

      var totalNodes = shape.total_nodes || nodes.length;

      var maxDepth = shape.max_depth || 0;

      var maxBreadth = shape.max_breadth || 0;

      var breadthByDepth = shape.breadth_by_depth || {};

      var rootBreadth = parseInt(String(breadthByDepth[0] || breadthByDepth["0"] || 0), 10);

      var l1Breadth = parseInt(String(breadthByDepth[1] || breadthByDepth["1"] || allBranches.length), 10);

      var l2Breadth = parseInt(String(breadthByDepth[2] || breadthByDepth["2"] || 0), 10);

      var l1Count = allBranches.length;

      var singleRootTree = !Number.isFinite(rootBreadth) || rootBreadth <= 1;
      var syntheticRoot = Boolean(shape && shape.synthetic_root);

      var shallowFanoutEligible = singleRootTree && maxDepth <= 1 && l1Count >= 2 && l1Count <= 12;
      var splitColumnFanoutEligible = singleRootTree && l1Count >= 2 && l1Count <= 8;
      var multiRootExplorerFanout = syntheticRoot && maxDepth <= 2 && l1Count >= 6 && l1Count <= 14 && maxBreadth <= 24 && totalNodes <= 80;

      var hierarchyFirstTree = singleRootTree && maxDepth >= 2 && l1Count <= 8 && maxBreadth <= 28 && totalNodes <= 180;
      var mobileBranchListEligible = singleRootTree && l1Count >= 2 && l1Count <= 8 && totalNodes <= 240;

      function getPreferredClusterStrategyHint(isMobile) {
        var mobileHint = String(payload.preferred_cluster_strategy_mobile || (rootNode && rootNode.preferred_cluster_strategy_mobile) || "").trim().toLowerCase();
        var desktopHint = String(payload.preferred_cluster_strategy || (rootNode && rootNode.preferred_cluster_strategy) || "").trim().toLowerCase();
        if (isMobile && (mobileHint === "fanout" || mobileHint === "cascade" || mobileHint === "tree" || mobileHint === "grid")) {
          return mobileHint;
        }
        if (desktopHint === "fanout" || desktopHint === "cascade" || desktopHint === "tree" || desktopHint === "grid") {
          return desktopHint;
        }
        return "";
      }



      /* --- Layout Strategy Selection --- */

      function autoSelectStrategy() {
        var usableWidth = width || viewportWidth || 1200;
        var isMobile = viewportWidth <= 720;
        var hintedStrategy = getPreferredClusterStrategyHint(isMobile);
        var cascadeLimit = isMobile ? 20 : 40;
        var cascadeBreadth = isMobile ? 5 : 8;
        var gridNodeLimit = isMobile ? 100 : 200;
        var gridL1Limit = isMobile ? 10 : 15;
        if (hintedStrategy) {
          if (hintedStrategy === "tree" && isMobile && (hierarchyFirstTree || mobileBranchListEligible)) {
            return "fanout";
          }
          if (hintedStrategy === "cascade" && isMobile && (hierarchyFirstTree || mobileBranchListEligible)) {
            return "fanout";
          }
          if (hintedStrategy === "tree" && !isMobile && splitColumnFanoutEligible) {
            return "fanout";
          }
          if (hintedStrategy === "tree" && multiRootExplorerFanout) {
            return "fanout";
          }
          if (hintedStrategy === "fanout" && usableWidth < 620 && l1Count > 8) {
            return "cascade";
          }
          return hintedStrategy;
        }
        if (shallowFanoutEligible) {
          return "fanout";
        }
        if (multiRootExplorerFanout) {
          return "fanout";
        }
        if (isMobile && mobileBranchListEligible) {
          return "fanout";
        }
        if (!isMobile && splitColumnFanoutEligible && usableWidth < 900) {
          return "fanout";
        }
        if (hierarchyFirstTree) {
          if (isMobile) {
            if (l1Count <= 6 && usableWidth >= 360) {
              return "fanout";
            }
            return "cascade";
          }
          return "fanout";
        }
        if (totalNodes <= cascadeLimit && maxBreadth <= cascadeBreadth) {
          return "cascade";
        }
        if (l1Count >= gridL1Limit || totalNodes >= gridNodeLimit) {
          return "grid";
        }
        return "tree";
      }

      function selectLayoutStrategy() {

        var override = String(container.getAttribute("data-ct-strategy-override") || "").trim().toLowerCase();

        if (override === "fanout" || override === "cascade" || override === "tree" || override === "grid") {

          return override;

        }

        return autoSelectStrategy();

      }

      var strategy = selectLayoutStrategy();

      var autoStrategy = autoSelectStrategy();

      function getStrategyLabel(token) {
        return {
          fanout: "Branch map",
          cascade: "Stacked view",
          tree: "Tree view",
          grid: "Tile grid"
        }[token] || "Cluster diagram";
      }

      function syncClusterLabels(activeStrategy) {
        var label = getStrategyLabel(activeStrategy);
        var band = container.closest("[data-home-hierarchy-band]");
        var titleNode = band ? band.querySelector("[data-home-cluster-title]") : null;
        if (titleNode) {
          titleNode.textContent = label;
        }
        var switcher = document.querySelector("[data-home-mode-switcher]");
        if (switcher && String(switcher.getAttribute("data-home-mode-effective") || "").trim().toLowerCase() === "cluster") {
          var summaryCurrentNodes = switcher.querySelectorAll("[data-home-mode-summary-current], [data-home-mode-summary-current-visual]");
          Array.prototype.forEach.call(summaryCurrentNodes, function (node) {
            node.textContent = label;
          });
        }
      }



      /* --- State for expand/collapse --- */
      var state = container.__homeClusterState || {
        expandedBranches: {},
        expandedL2: {},
        selectedBranchId: "",
        hoveredBranchId: "",
        manualSelection: false
      };
      if (!state || typeof state !== "object") {
        state = {
          expandedBranches: {},
          expandedL2: {},
          selectedBranchId: "",
          hoveredBranchId: "",
          manualSelection: false
        };
      }
      if (!state.expandedBranches || typeof state.expandedBranches !== "object") {
        state.expandedBranches = {};
      }
      if (!state.expandedL2 || typeof state.expandedL2 !== "object") {
        state.expandedL2 = {};
      }
      state.selectedBranchId = String(state.selectedBranchId || "").trim();
      state.hoveredBranchId = String(state.hoveredBranchId || "").trim();
      state.manualSelection = !!state.manualSelection;
      if (!container.__homeClusterState && !state.selectedBranchId) {
        var persistedBranchBase = String(readLocalStorage(branchStorageKey) || "").trim();
        if (persistedBranchBase) {
          var restoredBranch = allBranches.filter(function (branchNode) {
            return String(branchNode && branchNode.basename || "").trim() === persistedBranchBase;
          })[0] || null;
          if (restoredBranch && restoredBranch.id) {
            state.selectedBranchId = String(restoredBranch.id || "").trim();
            state.manualSelection = true;
          }
        }
      }
      if (state.selectedBranchId && !nodeById[state.selectedBranchId]) {
        state.selectedBranchId = "";
        state.manualSelection = false;
      }
      if (state.hoveredBranchId && !nodeById[state.hoveredBranchId]) {
        state.hoveredBranchId = "";
      }
      /* Auto-expand all branches for small sites on first render */
      if (!container.__homeClusterState && totalNodes <= 30) {
        allBranches.forEach(function (b) { state.expandedBranches[b.id] = true; });
      }
      if (state.selectedBranchId && !Object.prototype.hasOwnProperty.call(state.expandedBranches, state.selectedBranchId)) {
        state.expandedBranches[state.selectedBranchId] = true;
      }
      container.__homeClusterState = state;
      var shouldPreferFocusedBranch = !!state.manualSelection || totalNodes >= 18 || l1Count > 4;

      if (
        !container.__homeClusterStateInitialized
        && !state.selectedBranchId
        && !isVertical
        && shouldPreferFocusedBranch
        && strategy === "fanout"
        && allBranches.length
        && allBranches[0]
        && allBranches[0].id
      ) {
        state.selectedBranchId = String(allBranches[0].id || "").trim();
        state.manualSelection = true;
        state.expandedBranches[state.selectedBranchId] = true;
      }
      container.__homeClusterStateInitialized = true;

      function getTopLevelBranchId(nodeOrId) {
        var current = typeof nodeOrId === "string" ? nodeById[String(nodeOrId || "").trim()] : nodeOrId;
        var guard = 0;
        while (current && guard < 16) {
          var currentDepth = parseInt(String(current.depth || 0), 10) || 0;
          if (currentDepth === 1) {
            return String(current.id || "").trim();
          }
          var parentId = String(current.parent_id || "").trim();
          if (!parentId) {
            break;
          }
          current = nodeById[parentId];
          guard += 1;
        }
        return "";
      }

      function isNodeInSelectedBranch(nodeOrId) {
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        if (!selectedBranchId) {
          return false;
        }
        return getTopLevelBranchId(nodeOrId) === selectedBranchId;
      }

      function getEffectiveFocusBranchId() {
        var hoveredBranchId = String(state.hoveredBranchId || "").trim();
        if (hoveredBranchId && nodeById[hoveredBranchId]) {
          return hoveredBranchId;
        }
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        if (selectedBranchId && nodeById[selectedBranchId]) {
          return selectedBranchId;
        }
        return "";
      }

      function getSelectedBranchNode() {
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        return selectedBranchId && nodeById[selectedBranchId] ? nodeById[selectedBranchId] : null;
      }

      function isHoverPreviewActive() {
        var hoveredBranchId = String(state.hoveredBranchId || "").trim();
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        return !!hoveredBranchId && !!nodeById[hoveredBranchId] && hoveredBranchId !== selectedBranchId;
      }

      function getFocusMode() {
        if (isHoverPreviewActive()) {
          return "preview";
        }
        if (state.manualSelection && getSelectedBranchNode()) {
          return "pinned";
        }
        return "guided";
      }

      function syncBranchAttention() {
        var effectiveFocusBranchId = getEffectiveFocusBranchId();
        var hoverPreviewActive = isHoverPreviewActive();
        var branchNodes = board.querySelectorAll("[data-branch-id]");
        Array.prototype.forEach.call(branchNodes, function (branchEl) {
          var branchId = String(branchEl.getAttribute("data-branch-id") || "").trim();
          var isSelected = !!branchId && branchId === String(state.selectedBranchId || "").trim();
          var isFocused = !!branchId && branchId === effectiveFocusBranchId;
          var shouldDim = !!effectiveFocusBranchId && hoverPreviewActive && branchId !== effectiveFocusBranchId;
          branchEl.classList.toggle("ct-selected", isSelected);
          branchEl.classList.toggle("ct-highlighted", isFocused);
          branchEl.classList.toggle("ct-dimmed", shouldDim);
        });
      }

      function persistSelectedBranchBase(baseName) {
        writeLocalStorage(branchStorageKey, String(baseName || "").trim());
      }

      function cancelPendingHoverClear() {
        if (container.__homeClusterHoverClearTimer) {
          window.clearTimeout(container.__homeClusterHoverClearTimer);
          container.__homeClusterHoverClearTimer = 0;
        }
      }

      function setSelectedBranch(branchId, options) {
        var nextBranchId = String(branchId || "").trim();
        var opts = options || {};
        if (!nextBranchId || !nodeById[nextBranchId]) {
          return false;
        }
        var nextBranchNode = nodeById[nextBranchId] || {};
        state.selectedBranchId = nextBranchId;
        state.manualSelection = Object.prototype.hasOwnProperty.call(opts, "manual")
          ? !!opts.manual
          : state.manualSelection;
        if (opts.clearHover !== false) {
          state.hoveredBranchId = "";
        }
        if (opts.collapseSiblings !== false) {
          Object.keys(state.expandedBranches).forEach(function (expandedId) {
            if (getTopLevelBranchId(expandedId) !== nextBranchId) {
              delete state.expandedBranches[expandedId];
            }
          });
        }
        state.expandedBranches[nextBranchId] = true;
        if (opts.persist === true || (opts.persist !== false && opts.manual === true)) {
          persistSelectedBranchBase(nextBranchNode.basename || "");
        }
        container.__homeClusterState = state;
        return true;
      }

      function clearSelectedBranch() {
        state.manualSelection = false;
        state.hoveredBranchId = "";
        state.selectedBranchId = "";
        state.expandedBranches = {};
        if (totalNodes <= 30) {
          allBranches.forEach(function (branchNode) {
            if (branchNode && branchNode.id) {
              state.expandedBranches[branchNode.id] = true;
            }
          });
        }
        persistSelectedBranchBase("");
        container.__homeClusterState = state;
        renderHomeClusterMap(container, payload, nodes);
      }

      function setHoveredBranch(branchId) {
        var nextBranchId = String(branchId || "").trim();
        if (!nextBranchId || !nodeById[nextBranchId]) {
          return;
        }
        cancelPendingHoverClear();
        if (state.hoveredBranchId === nextBranchId) {
          return;
        }
        state.hoveredBranchId = nextBranchId;
        container.__homeClusterPendingPreviewBranchId = nextBranchId;
        container.__homeClusterState = state;
        syncBranchAttention();
        renderFocusTrayFromState();
      }

      function clearHoveredBranch(branchId, options) {
        var targetBranchId = String(branchId || "").trim();
        var opts = options || {};
        if (targetBranchId && state.hoveredBranchId !== targetBranchId) {
          return;
        }
        if (!state.hoveredBranchId) {
          return;
        }
        var clearAction = function () {
          container.__homeClusterHoverClearTimer = 0;
          state.hoveredBranchId = "";
          container.__homeClusterPendingPreviewBranchId = "";
          container.__homeClusterState = state;
          syncBranchAttention();
          renderFocusTrayFromState();
        };
        cancelPendingHoverClear();
        if (opts.immediate) {
          clearAction();
          return;
        }
        container.__homeClusterPendingPreviewBranchId = state.hoveredBranchId;
        container.__homeClusterHoverClearTimer = window.setTimeout(clearAction, 160);
      }



      /* --- Helper functions --- */

      function getDisplayLabel(node) {

        return String((node && (node.display_label || node.label || node.full_label)) || "Untitled");

      }

      function getFullLabel(node) {

        return String((node && (node.full_label || node.display_label || node.label)) || "Untitled");

      }

      function normalizeCardTitleForCompare(value) {

        return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

      }

      function getSecondaryCardTitle(node, displayLabel) {

        var catchyTitle = String((node && node.catchy_title) || "").replace(/\s+/g, " ").trim();
        var fullLabel = getFullLabel(node).replace(/\s+/g, " ").trim();
        var compactLabel = String(displayLabel || getDisplayLabel(node)).replace(/\s+/g, " ").trim();

        if (catchyTitle && normalizeCardTitleForCompare(catchyTitle) !== normalizeCardTitleForCompare(compactLabel)) {
          return catchyTitle;
        }

        if (!fullLabel || normalizeCardTitleForCompare(fullLabel) === normalizeCardTitleForCompare(compactLabel)) {
          return "";
        }

        return fullLabel;

      }

      function getNodeImage(node) {

        return String((node && node.image) || "").trim();

      }

      function getTierRank(tier) {

        var t = String(tier || "balanced").trim().toLowerCase();

        if (t === "sparse") return 0;

        if (t === "balanced") return 1;

        if (t === "dense") return 2;

        return 3;

      }



      /* --- Progressive node sizing --- */

      function mapNodeScaleToClass(scaleToken) {

        var scale = String(scaleToken || "").trim().toLowerCase();

        if (scale === "root") return "ct-node-root";
        if (scale === "xl") return "ct-node-xl";
        if (scale === "lg") return "ct-node-lg";
        if (scale === "md") return "ct-node-md";
        if (scale === "sm") return "ct-node-sm";
        if (scale === "xs") return "ct-node-xs";

        return "";

      }

      function getHintedNodeSizeClass(node, depth, strat) {

        if (!node || typeof node !== "object") {
          return "";
        }

        var hintedScale = String(
          ((width <= 720 ? node.node_size_mode_mobile : node.node_size_mode) || node.node_size_mode || "")
        ).trim().toLowerCase();

        var mapped = mapNodeScaleToClass(hintedScale);
        if (!mapped) {
          return "";
        }

        if (strat === "grid") {
          if (mapped === "ct-node-root") return "ct-node-root";
          if (mapped === "ct-node-xl" || mapped === "ct-node-lg") return "ct-node-md";
        } else if (strat === "cascade" && mapped === "ct-node-xl") {
          return "ct-node-lg";
        }

        return mapped;

      }

      function getNodeSizeClass(depth, strat, node) {

        var hintedClass = getHintedNodeSizeClass(node, depth, strat);
        if (hintedClass) return hintedClass;

        if (depth <= 0) return "ct-node-root";

        if (strat === "fanout") {

          if (depth === 1) {

            if ((width >= 1080 && l1Count <= 6) || (width >= 1280 && l1Count <= 8)) return "ct-node-xl";

            if (width >= 860) return "ct-node-lg";

            return "ct-node-md";

          }

          if (depth === 2) return width >= 1024 ? "ct-node-md" : "ct-node-sm";

          return "ct-node-sm";

        }

        if (strat === "cascade") {

          if (depth === 1) return "ct-node-lg";

          if (depth === 2) return "ct-node-md";

          if (depth === 3) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (strat === "grid") {

          if (depth === 1) return "ct-node-sm";

          return "ct-node-xs";

        }

        /* tree strategy: scale by totalNodes */

        if (totalNodes < 60) {

          if (depth === 1) return "ct-node-lg";

          if (depth === 2) return "ct-node-md";

          if (depth === 3) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (totalNodes < 120) {

          if (depth === 1 && width >= 1320 && l1Count <= 8) return "ct-node-xl";
          if (depth === 1) return "ct-node-md";

          if (depth === 2) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (depth === 1) {
          if (width >= 1460 && l1Count <= 8) return "ct-node-lg";
          if (width >= 1180) return "ct-node-md";
          return "ct-node-sm";
        }

        if (depth === 2) {
          if (width >= 1460) return "ct-node-md";
          return "ct-node-sm";
        }

        if (depth === 3) {
          if (width >= 1520 && totalNodes < 320) return "ct-node-sm";
          return "ct-node-xs";
        }

        return "ct-node-xs";

      }



      /* --- Inline child limits by density and strategy --- */

      function getInlineChildLimit(tier, depth, strat, parentNode) {

        var rank = getTierRank(tier);
        var inSelectedBranch = !shouldPreferFocusedBranch || isNodeInSelectedBranch(parentNode);

        if (shouldPreferFocusedBranch && !inSelectedBranch) {
          return 0;
        }

        if (strat === "grid") {

          return 0; /* grid mode shows children only on expand */

        }

        if (strat === "cascade") {

          if (rank <= 0) return 999;

          if (rank === 1) return 8;

          if (rank === 2) return 4;

          return 2;

        }

        /* tree */

        if (rank <= 0) return 999;

        if (rank === 1) return width >= 960 ? (inSelectedBranch ? 8 : 6) : (inSelectedBranch ? 6 : 4);

        if (rank === 2) return width >= 960 ? (inSelectedBranch ? 5 : 3) : (inSelectedBranch ? 3 : 2);

        return inSelectedBranch ? 2 : 0;

      }



      function getInlineL3Limit(tier, strat, parentNode) {

        if (strat === "grid") return 0;

        var rank = getTierRank(tier);
        var inSelectedBranch = !shouldPreferFocusedBranch || isNodeInSelectedBranch(parentNode);

        if (shouldPreferFocusedBranch && !inSelectedBranch) {
          return 0;
        }

        if (strat === "cascade") {

          if (rank <= 0) return inSelectedBranch ? 8 : 6;

          if (rank === 1) return inSelectedBranch ? 4 : 3;

          return 0;

        }

        if (rank <= 0) return inSelectedBranch ? 6 : 4;

        if (rank === 1) return inSelectedBranch ? 3 : 2;

        return 0;

      }



      /* --- DOM builders --- */

      function makeNode(tag, cls, text) {

        var el = document.createElement(tag || "div");

        if (cls) el.className = cls;

        if (text) el.textContent = text;

        return el;

      }

      function pluralizeWord(value, singular, plural) {
        var numeric = Math.max(0, parseInt(String(value || 0), 10) || 0);
        return String(numeric) + " " + (numeric === 1 ? singular : (plural || singular + "s"));
      }

      function getNodeLevelLabel(node) {
        var explicit = String(node.level_label || "").trim();
        if (explicit) return explicit;
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (semantic === "root") return "Overview";
        if (semantic === "l1") return "Topic";
        if (semantic === "l2") return "Section";
        if (semantic === "l3") return "Page";
        return "Page";
      }

      function getNodeMetaLine(node) {
        var count = Math.max(0, parseInt(String(node.count || 0), 10) || 0);
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        var semantic = String(node.semantic_level || "").trim().toLowerCase();

        if (semantic === "root") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " across " + pluralizeWord(childTotal, "section"))
            : pluralizeWord(count, "page");
        }
        if (semantic === "l1") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " in " + pluralizeWord(childTotal, "subtopic"))
            : pluralizeWord(count, "page");
        }
        if (semantic === "l2") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " with " + pluralizeWord(childTotal, "page"))
            : pluralizeWord(count, "page");
        }
        return count > 1 ? pluralizeWord(count, "page") : "";
      }

      function getNodeSummary(node) {
        var explicit = String(node.summary || node.description || "").trim();
        if (explicit) return explicit;
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        if (semantic === "root" && childTotal > 0) {
          return "Start here, then open " + pluralizeWord(childTotal, "main section") + " and related pages.";
        }
        if (semantic === "l1" && childTotal > 0) {
          return "Open " + pluralizeWord(childTotal, "subtopic") + " from this section.";
        }
        if (semantic === "l2" && childTotal > 0) {
          return "This section opens into " + pluralizeWord(childTotal, "page") + ".";
        }
        return "";
      }

      function getRepresentativeSampleScore(node) {
        if (!node) {
          return -1;
        }
        var score = 0;
        var descendantTotal = Math.max(0, parseInt(String(node.descendant_total || 0), 10) || 0);
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        var densityTier = String(node.density_tier || "balanced").trim().toLowerCase();
        var titleBucket = String(node.title_length_bucket || "").trim().toLowerCase();
        var semanticLevel = String(node.semantic_level || "").trim().toLowerCase();

        if (getNodeImage(node)) {
          score += 20;
        }
        score += Math.min(descendantTotal, 24) * 2;
        score += Math.min(childTotal, 8) * 5;
        score += getNodeSummary(node) ? 8 : 0;
        score += getTierRank(densityTier) * 4;

        if (semanticLevel === "l2") {
          score += 5;
        } else if (semanticLevel === "l3") {
          score += 2;
        }

        if (titleBucket === "medium") {
          score += 3;
        } else if (titleBucket === "long") {
          score += 2;
        } else if (titleBucket === "very-long") {
          score -= 2;
        }

        return score;
      }

      function getRankedRepresentativeNodes(items, limit) {
        var list = Array.prototype.slice.call(items || []);
        list.sort(function (a, b) {
          var scoreDelta = getRepresentativeSampleScore(b) - getRepresentativeSampleScore(a);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          var descendantDelta = (parseInt(String(b && b.descendant_total || 0), 10) || 0)
            - (parseInt(String(a && a.descendant_total || 0), 10) || 0);
          if (descendantDelta !== 0) {
            return descendantDelta;
          }
          return String(getFullLabel(a || "")).localeCompare(String(getFullLabel(b || "")));
        });
        var maxItems = Math.max(0, parseInt(String(limit || list.length), 10) || list.length);
        return list.slice(0, maxItems);
      }

      function getFocusGridMode(focusBranch, children) {
        var total = Math.max(0, parseInt(String((children && children.length) || 0), 10) || 0);
        var branchTier = getTierRank(focusBranch && focusBranch.density_tier);
        if (width <= 720) {
          return "stacked";
        }
        if (total <= 2) {
          return "editorial";
        }
        if (total <= 4 && width >= 1180 && branchTier <= 1) {
          return "editorial";
        }
        if (total <= 6 && width >= 980) {
          return "balanced";
        }
        if (total <= 8) {
          return "compact";
        }
        return "list";
      }

      function getFocusChildLimit(gridMode, total) {
        var childTotal = Math.max(0, parseInt(String(total || 0), 10) || 0);
        if (!childTotal) {
          return 0;
        }
        var limit = 2;
        if (gridMode === "editorial") {
          limit = width >= 1320 ? 4 : 3;
        } else if (gridMode === "balanced") {
          limit = width >= 1360 ? 6 : (width >= 980 ? 4 : 3);
        } else if (gridMode === "compact") {
          limit = width >= 1320 ? 6 : 4;
        } else if (gridMode === "list") {
          limit = width >= 1320 ? 8 : 6;
        } else if (gridMode === "stacked") {
          limit = 4;
        }
        if (childTotal <= limit + 1) {
          return childTotal;
        }
        return limit;
      }

      function getFocusCardRole(node, index, total, gridMode) {
        var sizeMode = String(node && node.focus_card_size_mode || "standard").trim().toLowerCase();
        var totalCount = Math.max(1, parseInt(String(total || 1), 10) || 1);
        if (gridMode === "editorial") {
          return index === 0 ? "featured" : "standard";
        }
        if (gridMode === "balanced") {
          if (index === 0 && (sizeMode === "hero" || totalCount >= 3)) {
            return "featured";
          }
          return "standard";
        }
        if (gridMode === "compact") {
          return index === 0 && sizeMode !== "micro" ? "standard" : "compact";
        }
        if (gridMode === "list" || gridMode === "stacked") {
          return index === 0 && sizeMode === "standard" ? "compact" : "micro";
        }
        return "standard";
      }

      function getOverflowNoun(parentNode, count) {
        var overflowCount = Math.max(0, parseInt(String(count || 0), 10) || 0);
        var semanticLevel = String(parentNode && parentNode.semantic_level || "").trim().toLowerCase();
        if (semanticLevel === "root") {
          return overflowCount === 1 ? "section" : "sections";
        }
        if (semanticLevel === "l1") {
          return overflowCount === 1 ? "subtopic" : "subtopics";
        }
        if (semanticLevel === "l2") {
          return overflowCount === 1 ? "page" : "pages";
        }
        return overflowCount === 1 ? "page" : "pages";
      }

      function applyExpandToggleState(toggle, expanded, node) {
        if (!toggle) {
          return;
        }
        var isExpanded = !!expanded;
        var labelBase = getDisplayLabel(node) || "this branch";
        var actionLabel = isExpanded ? "Hide subtopics" : "Show subtopics";
        var icon = toggle.querySelector(".ct-expand-toggle-icon");
        var text = toggle.querySelector(".ct-expand-toggle-text");
        if (icon) {
          icon.textContent = isExpanded ? "\u2212" : "+";
        }
        if (text) {
          text.textContent = isExpanded ? "Hide" : "Expand";
        }
        toggle.title = actionLabel;
        toggle.setAttribute("aria-label", actionLabel + " for " + labelBase);
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.setAttribute("data-toggle-state", isExpanded ? "expanded" : "collapsed");
      }

      function createExpandToggle(node, expanded) {
        var toggle = makeNode("button", "ct-expand-toggle");
        toggle.type = "button";
        toggle.appendChild(makeNode("span", "ct-expand-toggle-icon", expanded ? "\u2212" : "+"));
        toggle.appendChild(makeNode("span", "ct-expand-toggle-text", expanded ? "Hide" : "Expand"));
        applyExpandToggleState(toggle, expanded, node);
        return toggle;
      }

      function scheduleClusterRerender() {
        if (container.__homeClusterRenderTimer) {
          window.clearTimeout(container.__homeClusterRenderTimer);
        }
        if (container.__homeClusterRenderFrame && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(container.__homeClusterRenderFrame);
        }
        container.__homeClusterRenderFrame = 0;
        container.__homeClusterRenderTimer = 0;
        var rerender = function () {
          container.__homeClusterRenderTimer = 0;
          renderHomeClusterMap(container, payload, nodes);
        };
        if (typeof window.requestAnimationFrame === "function") {
          container.__homeClusterRenderFrame = window.requestAnimationFrame(function () {
            container.__homeClusterRenderFrame = 0;
            container.__homeClusterRenderTimer = window.setTimeout(rerender, 0);
          });
        } else {
          container.__homeClusterRenderTimer = window.setTimeout(rerender, 0);
        }
      }

      function toggleBranchExpansion(nodeId, toggle) {
        var targetId = String(nodeId || "").trim();
        if (!targetId || !nodeById[targetId]) {
          return;
        }
        var isExpanded = !state.expandedBranches[targetId];
        if (isExpanded) {
          state.expandedBranches[targetId] = true;
        } else {
          delete state.expandedBranches[targetId];
        }
        container.__homeClusterState = state;
        applyExpandToggleState(toggle, isExpanded, nodeById[targetId]);
        scheduleClusterRerender();
      }

      function getOverflowLabel(parentNode, count, options) {
        var overflowCount = Math.max(0, parseInt(String(count || 0), 10) || 0);
        var opts = options || {};
        var noun = getOverflowNoun(parentNode, overflowCount);
        if (opts.compact) {
          return "+" + String(overflowCount) + " " + noun;
        }
        return String(overflowCount) + " more " + noun;
      }

      function buildClusterMedia(node) {
        var imageSrc = getNodeImage(node);
        var media = makeNode("a", "home-cluster-card-media");
        media.href = String(node.url || "#");
        media.title = getFullLabel(node);
        if (imageSrc) {
          var image = document.createElement("img");
          image.src = imageSrc;
          image.alt = "";
          image.loading = "lazy";
          image.decoding = "async";
          media.appendChild(image);
          return media;
        }
        media.classList.add("home-cluster-card-placeholder");
        media.appendChild(
          makeNode(
            "span",
            "home-cluster-card-initial",
            String(getFullLabel(node) || "U").slice(0, 1).toUpperCase()
          )
        );
        return media;
      }

      function buildFocusChildCard(node, options) {
        var card = makeNode("article", "home-cluster-card home-cluster-card-l2");
        var opts = options || {};
        var tier = String(node.density_tier || "").trim().toLowerCase();
        var sizeMode = String(
          ((width <= 720 ? node.focus_card_size_mode_mobile : node.focus_card_size_mode) || node.focus_card_size_mode || "standard")
        ).trim().toLowerCase() || "standard";
        var cardRole = String(opts.role || "standard").trim().toLowerCase() || "standard";
        if (tier) {
          card.classList.add("is-tier-" + tier);
        }
        card.classList.add("is-size-" + sizeMode);
        card.classList.add("is-role-" + cardRole);
        card.setAttribute("data-size-mode", sizeMode);
        card.setAttribute("data-card-role", cardRole);

        var showMedia = cardRole !== "micro";
        var showSummary = cardRole === "featured" || cardRole === "standard";
        var showDeepList = cardRole !== "micro";

        if (showMedia) {
          card.appendChild(buildClusterMedia(node));
        }

        var metaRow = makeNode("div", "home-cluster-card-meta-row");
        var badgeText = parseInt(String(node.count || 0), 10) > 1
          ? pluralizeWord(node.count || 0, "page")
          : getNodeLevelLabel(node);
        metaRow.appendChild(makeNode("span", "home-cluster-count-badge", badgeText));
        metaRow.appendChild(makeNode("span", "home-cluster-card-meta", getNodeMetaLine(node) || getNodeLevelLabel(node)));
        card.appendChild(metaRow);

        var title = makeNode("h3", "home-cluster-card-title");
        var titleLink = makeNode("a", "home-cluster-title-link", getDisplayLabel(node));
        titleLink.href = String(node.url || "#");
        titleLink.title = getFullLabel(node);
        title.appendChild(titleLink);
        card.appendChild(title);

        var summary = getNodeSummary(node);
        if (summary && showSummary) {
          card.appendChild(makeNode("p", "home-cluster-node-summary", summary));
        }

        var deepChildren = childrenByParent[node.id] || [];
        if (showDeepList && deepChildren.length > 0) {
          var deepList = makeNode("div", "home-cluster-l3-list");
          var deepLimit = 0;
          if (cardRole === "featured" || sizeMode === "hero") {
            deepLimit = width >= 1240 ? 5 : (width >= 900 ? 4 : 3);
          } else if (cardRole === "standard" || sizeMode === "standard") {
            deepLimit = width >= 1240 ? 4 : (width >= 900 ? 3 : 2);
          } else if (cardRole === "compact" || sizeMode === "compact") {
            deepLimit = width >= 900 ? 3 : 2;
          } else {
            deepLimit = 0;
          }
          if (deepLimit > 0) {
            getRankedRepresentativeNodes(deepChildren, deepLimit).forEach(function (deepNode) {
              var deepLink = makeNode("a", "home-cluster-card-l3", getDisplayLabel(deepNode));
              deepLink.href = String(deepNode.url || "#");
              deepLink.title = getFullLabel(deepNode);
              deepList.appendChild(deepLink);
            });
            if (deepChildren.length > deepLimit) {
              deepList.appendChild(
                makeNode(
                  "span",
                  "home-cluster-card-l3",
                  getOverflowLabel(node, deepChildren.length - deepLimit, { compact: true })
                )
              );
            }
          }
          if (deepList.childNodes.length > 0) {
            card.appendChild(deepList);
          }
        }

        return card;
      }

      function renderFocusTrayFromState() {
        if (!focusTray) {
          return;
        }

        var focusBranchId = getEffectiveFocusBranchId();
        var focusBranch = focusBranchId ? nodeById[focusBranchId] : null;
        var selectedBranch = getSelectedBranchNode();
        var isPreview = isHoverPreviewActive();
        var isPinned = !!(state.manualSelection && selectedBranch && selectedBranch.id === focusBranchId && !isPreview);
        var focusMode = getFocusMode();
        if (!focusBranch || (!isPreview && !state.manualSelection)) {
          focusTray.innerHTML = "";
          focusTray.hidden = true;
          focusTray.removeAttribute("data-home-cluster-focus-mode");
          return;
        }

        focusTray.innerHTML = "";
        focusTray.hidden = false;
        focusTray.setAttribute("data-home-cluster-focus-mode", focusMode);

        var head = makeNode("div", "home-cluster-focus-head");
        var text = makeNode("div", "home-cluster-focus-text");
        var breadcrumbs = makeNode("nav", "home-cluster-focus-breadcrumbs");
        breadcrumbs.setAttribute("aria-label", getUiString("cluster-focus-path", "Cluster focus path"));
        var overviewCrumb = makeNode("button", "home-cluster-focus-crumb home-cluster-focus-crumb-button", getUiString("overview", "Overview"));
        overviewCrumb.type = "button";
        overviewCrumb.addEventListener("click", clearSelectedBranch);
        breadcrumbs.appendChild(overviewCrumb);
        if (selectedBranch) {
          breadcrumbs.appendChild(makeNode("span", "home-cluster-focus-crumb-sep", "/"));
          if (selectedBranch.id === focusBranchId && !isPreview) {
            breadcrumbs.appendChild(
              makeNode("span", "home-cluster-focus-crumb home-cluster-focus-crumb-current", getDisplayLabel(selectedBranch))
            );
          } else {
            var selectedCrumb = makeNode(
              "button",
              "home-cluster-focus-crumb home-cluster-focus-crumb-button home-cluster-focus-crumb-selected",
              getDisplayLabel(selectedBranch)
            );
            selectedCrumb.type = "button";
            selectedCrumb.addEventListener("click", function () {
              if (setSelectedBranch(selectedBranch.id, { manual: true })) {
                renderHomeClusterMap(container, payload, nodes);
              }
            });
            breadcrumbs.appendChild(selectedCrumb);
          }
        }
        if (!selectedBranch || selectedBranch.id !== focusBranchId) {
          breadcrumbs.appendChild(makeNode("span", "home-cluster-focus-crumb-sep", "/"));
          breadcrumbs.appendChild(
            makeNode("span", "home-cluster-focus-crumb home-cluster-focus-crumb-current", getDisplayLabel(focusBranch))
          );
        }
        text.appendChild(breadcrumbs);

        var modeLabel = getUiString("active-branch", "Active branch");
        if (isPreview) {
          modeLabel = isVertical ? getUiString("preview-branch", "Preview branch") : getUiString("hover-preview", "Hover preview");
        } else if (isPinned) {
          modeLabel = isVertical ? getUiString("selected-branch", "Selected branch") : getUiString("pinned-branch", "Pinned branch");
        } else if (state.manualSelection) {
          modeLabel = getUiString("selected-branch", "Selected branch");
        }
        var headKicker = makeNode(
          "p",
          "home-cluster-kicker",
          modeLabel
        );
        text.appendChild(headKicker);

        if (isPreview && selectedBranch) {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              formatUiString(
                "previewing-focus-selected-template",
                "Previewing {focus} while {selected} stays selected.",
                {
                  focus: getDisplayLabel(focusBranch),
                  selected: getDisplayLabel(selectedBranch)
                }
              )
            )
          );
        } else if (isPinned) {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              isVertical
          ? getUiString("vertical-selected-branch-hint", "Tap another branch to switch the selection, or open a page from this branch.")
                : getUiString("horizontal-pinned-branch-hint", "Click another branch to pin it, or hover to preview without leaving this branch.")
            )
          );
        } else {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              isVertical
                ? getUiString("vertical-branch-card-hint", "Tap a branch card to open its subtopics here.")
                : getUiString("horizontal-branch-card-hint", "Hover to preview a branch, then click to pin it in place.")
            )
          );
        }

        var headTitle = makeNode("h3", "home-cluster-focus-title");
        var headTitleLink = makeNode("a", "home-cluster-title-link", getFullLabel(focusBranch));
        headTitleLink.href = String(focusBranch.url || "#");
        headTitleLink.title = getFullLabel(focusBranch);
        headTitle.appendChild(headTitleLink);
        text.appendChild(headTitle);

        var focusMeta = getNodeMetaLine(focusBranch);
        if (focusMeta) {
          text.appendChild(makeNode("p", "home-cluster-focus-meta", focusMeta));
        }
        head.appendChild(text);

        var actions = makeNode("div", "home-cluster-focus-actions");
        if (isPreview) {
          var pinButton = makeNode("button", "home-cluster-action", getUiString("pin-branch", "Pin Branch"));
          pinButton.type = "button";
          pinButton.addEventListener("click", function () {
            if (setSelectedBranch(focusBranch.id, { manual: true })) {
              renderHomeClusterMap(container, payload, nodes);
            }
          });
          actions.appendChild(pinButton);
        }
        if (isPreview && selectedBranch) {
          var backToPinnedButton = makeNode("button", "home-cluster-action", getUiString("back-to-pinned", "Back to Pinned"));
          backToPinnedButton.type = "button";
          backToPinnedButton.addEventListener("click", function () {
            clearHoveredBranch(focusBranch.id, { immediate: true });
          });
          actions.appendChild(backToPinnedButton);
        }
        if (state.manualSelection) {
          var closeButton = makeNode("button", "home-cluster-focus-close", getUiString("back-to-overview", "Back to Overview"));
          closeButton.type = "button";
          closeButton.addEventListener("click", clearSelectedBranch);
          actions.appendChild(closeButton);
        }
        if (actions.childNodes.length > 0) {
          head.appendChild(actions);
        }

        focusTray.appendChild(head);

        var focusSummary = getNodeSummary(focusBranch);
        if (focusSummary) {
          focusTray.appendChild(makeNode("p", "home-cluster-node-summary", focusSummary));
        }

        var focusChildren = childrenByParent[focusBranch.id] || [];
        if (!focusChildren.length) {
          return;
        }

        var focusGrid = makeNode("div", "home-cluster-focus-grid");
        var gridMode = getFocusGridMode(focusBranch, focusChildren);
        focusGrid.setAttribute("data-grid-mode", gridMode);
        var childLimit = getFocusChildLimit(gridMode, focusChildren.length);
        var rankedFocusChildren = getRankedRepresentativeNodes(focusChildren, childLimit);
        rankedFocusChildren.forEach(function (childNode, childIndex) {
          focusGrid.appendChild(
            buildFocusChildCard(childNode, {
              role: getFocusCardRole(childNode, childIndex, rankedFocusChildren.length, gridMode),
              gridMode: gridMode
            })
          );
        });

        if (focusChildren.length > childLimit) {
          var overflow = makeNode(
            "a",
            "home-cluster-overflow home-cluster-overflow-l2",
            getOverflowLabel(focusBranch, focusChildren.length - childLimit, { compact: true })
          );
          overflow.href = String(focusBranch.url || "#");
          overflow.title = "Open " + getFullLabel(focusBranch) + " for " + getOverflowLabel(focusBranch, focusChildren.length - childLimit);
          overflow.setAttribute("aria-label", overflow.title);
          focusGrid.appendChild(overflow);
        }

        focusTray.appendChild(focusGrid);
      }

      function bindBranchInteractions(target, branchNode, options) {
        if (!target || !branchNode || !branchNode.id) {
          return;
        }
        var opts = options || {};
        var branchId = String(branchNode.id);

        target.addEventListener("mouseenter", function () {
          setHoveredBranch(branchId);
        });
        target.addEventListener("mouseleave", function () {
          clearHoveredBranch(branchId);
        });
        target.addEventListener("focusin", function () {
          setHoveredBranch(branchId);
        });
        target.addEventListener("focusout", function (event) {
          if (!target.contains(event.relatedTarget)) {
            clearHoveredBranch(branchId);
          }
        });

        if (!opts.selectOnClick) {
          return;
        }
        target.addEventListener("click", function (event) {
          if (event.target && event.target.closest) {
            if (event.target.closest("a") || event.target.closest("button.ct-expand-toggle")) {
              return;
            }
          }
          if (setSelectedBranch(branchId, { manual: true })) {
            renderHomeClusterMap(container, payload, nodes);
          }
        });
      }

      function shouldShowNodeKicker(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        return sizeClass === "ct-node-root"
          || sizeClass === "ct-node-xl"
          || (semantic === "l1" && sizeClass !== "ct-node-sm")
          || (semantic === "l2" && sizeClass === "ct-node-lg");
      }

      function shouldShowNodeSummary(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl") return true;
        if (semantic === "l1") return sizeClass === "ct-node-lg" || sizeClass === "ct-node-md";
        if (semantic === "l2") return sizeClass === "ct-node-lg";
        return false;
      }

      function shouldShowNodeMeta(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl" || sizeClass === "ct-node-lg") return true;
        if ((semantic === "l1" || semantic === "l2") && sizeClass === "ct-node-md") return true;
        return false;
      }

      function shouldShowCountLabel(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl") return true;
        if ((semantic === "l1" || semantic === "l2") && sizeClass !== "ct-node-sm") return true;
        return false;
      }



      function buildTreeNodeBubble(node, sizeClass) {

        var bubble = makeNode("div", "ct-node " + (sizeClass || "ct-node-md"));

        applyHomeClusterNodeMeta(bubble, node);
        bubble.setAttribute("data-node-id", String(node.id || ""));

        var link = makeNode("a", "ct-node-link");

        link.href = String(node.url || "#");

        link.title = getFullLabel(node);

        link.setAttribute("aria-label", "Open page: " + getFullLabel(node));



        /* thumbnail or initial */

        var imgSrc = getNodeImage(node);

        var showThumb = sizeClass !== "ct-node-xs";

        if (imgSrc && showThumb) {

          var thumb = makeNode("div", "ct-node-thumb");

          var img = document.createElement("img");

          img.src = imgSrc;

          img.alt = "";

          img.loading = "lazy";

          img.decoding = "async";

          thumb.appendChild(img);

          link.appendChild(thumb);

        } else if (showThumb) {

          var initial = makeNode("span", "ct-node-initial", String(getFullLabel(node) || "U").slice(0, 1).toUpperCase());

          link.appendChild(initial);

        }

        var content = makeNode("span", "ct-node-content");

        if (shouldShowNodeKicker(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-kicker", getNodeLevelLabel(node)));
        }



        var labelText = (sizeClass === "ct-node-root")
          ? getFullLabel(node)
          : getDisplayLabel(node);

        var label = makeNode("span", "ct-node-label", labelText);

        content.appendChild(label);

        var secondaryTitle = getSecondaryCardTitle(node, labelText);
        if (secondaryTitle && sizeClass !== "ct-node-root") {
          content.appendChild(makeNode("span", "ct-node-title-full", secondaryTitle));
        }

        var summaryText = getNodeSummary(node);
        if (summaryText && shouldShowNodeSummary(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-summary", summaryText));
        }

        var metaText = getNodeMetaLine(node);
        if (metaText && shouldShowNodeMeta(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-meta", metaText));
        }

        link.appendChild(content);

        bubble.appendChild(link);



        /* count badge */

        var count = parseInt(String(node.count || 0), 10);

        var childTotal = parseInt(String(node.child_total || 0), 10);

        if (count > 1 || childTotal > 0) {

          var badgeText = shouldShowCountLabel(node, sizeClass)
          ? pluralizeWord(count || 1, "page")
            : String(count || 1);
          var badge = makeNode("span", "ct-node-badge", badgeText);

        badge.title = getNodeMetaLine(node) || (String(count) + " pages in this section");
          badge.setAttribute("aria-label", badge.title);

          bubble.appendChild(badge);

        }



        /* node size encoding */

        var descendantTotal = parseInt(String(node.descendant_total || 0), 10);

        if (descendantTotal >= 20) {

          bubble.classList.add("ct-node-heavy");

        } else if (descendantTotal >= 8) {

          bubble.classList.add("ct-node-medium");

        }



        return bubble;

      }



      function buildClusterDot(count, parentUrl, parentNode, options) {

        var dot = makeNode("a", "ct-cluster-dot");
        var compactLabel = getOverflowLabel(parentNode, count, { compact: true });
        var fullLabel = getOverflowLabel(parentNode, count, options);

        dot.href = String(parentUrl || "#");

        dot.title = fullLabel;
        dot.setAttribute("aria-label", fullLabel);

        dot.textContent = compactLabel;

        return dot;

      }

      function getFanoutColumnCount(count, availableWidth) {

        var branchCount = Math.max(1, parseInt(String(count || 1), 10) || 1);

        var usableWidth = Math.max(320, parseInt(String(availableWidth || width || 0), 10) || 320);

        if (usableWidth <= 720) {
          return 1;
        }

        var minCardWidth = branchCount <= 3 ? 320 : (branchCount <= 6 ? 290 : (branchCount <= 8 ? 238 : 214));
        if (multiRootExplorerFanout) {
          minCardWidth = branchCount >= 10 ? 268 : 248;
        }

        var columns = Math.max(1, Math.floor((usableWidth - 56) / minCardWidth));

        if (branchCount >= 9 && usableWidth >= 1480) {

          columns = Math.max(columns, 5);

        } else if (branchCount >= 7 && usableWidth >= 1180) {

          columns = Math.max(columns, 4);

        } else if (usableWidth >= 880) {

          columns = Math.max(columns, 3);

        } else if (usableWidth >= 620) {

          columns = Math.max(columns, 2);

        }

        if (multiRootExplorerFanout) {
          columns = Math.min(columns, usableWidth >= 1680 ? 4 : 3);
        }

        if (branchCount <= 4) {

          columns = Math.min(columns, 2);

        } else if (branchCount <= 6) {

          columns = Math.min(columns, 3);

        } else if (branchCount <= 8) {

          columns = Math.min(columns, 4);

        } else if (branchCount <= 12) {

          columns = Math.min(columns, 5);

        }

        return Math.max(1, Math.min(branchCount, columns));

      }

      function buildFanoutCard(branchNode, index) {

        var item = makeNode("div", "ct-fanout-item");

        item.setAttribute("data-branch-id", branchNode.id);

        item.setAttribute("data-branch-index", String(index));

        var bubble = buildTreeNodeBubble(branchNode, getNodeSizeClass(1, "fanout", branchNode));

        bubble.classList.add("ct-fanout-node");

        item.appendChild(bubble);
        bindBranchInteractions(item, branchNode, { selectOnClick: true });

        return item;

      }

      function getTreeColumnCount(branchCount, usableWidth, options) {
        var total = Math.max(1, parseInt(String(branchCount || 1), 10) || 1);
        var widthValue = Math.max(320, parseInt(String(usableWidth || width || 0), 10) || 320);
        var opts = options || {};
        var focusedBranchMode = !!opts.focusedBranchMode;
        var deepTree = !!opts.deepTree;

        if (total <= 1) return 1;

        if (widthValue >= 1560) {
          if (focusedBranchMode) {
            return Math.min(total, total >= 7 ? 4 : 3);
          }
          if (!deepTree && total >= 8) {
            return Math.min(total, 4);
          }
          if (total >= 5) {
            return Math.min(total, 3);
          }
          return Math.min(total, 2);
        }

        if (widthValue >= 1280) {
          if (focusedBranchMode) {
            return Math.min(total, total >= 5 ? 3 : 2);
          }
          if (!deepTree && total >= 7) {
            return Math.min(total, 3);
          }
          if (total >= 4) {
            return 2;
          }
          return 1;
        }

        if (widthValue >= 1024) {
          if (focusedBranchMode && total >= 5) {
            return 2;
          }
          if (total >= 6 && !deepTree) {
            return 2;
          }
        }

        return 1;
      }

      function getTreeBranchSpan(branchNode, treeColumns) {
        var columns = Math.max(1, parseInt(String(treeColumns || 1), 10) || 1);
        if (columns <= 1 || !branchNode) {
          return "regular";
        }

        var branchId = String(branchNode.id || "").trim();
        var isSelectedBranch = branchId && branchId === String(state.selectedBranchId || "").trim();
        var childCount = (childrenByParent[branchId] || []).length;
        var subtreeShape = branchNode.subtree_shape && typeof branchNode.subtree_shape === "object"
          ? branchNode.subtree_shape
          : {};
        var subtreeDepth = Math.max(0, parseInt(String(subtreeShape.max_depth || 0), 10) || 0);

        if (isSelectedBranch && shouldPreferFocusedBranch && childCount > 0) {
          return "full";
        }

        if (columns >= 3 && childCount >= 5 && subtreeDepth >= 2) {
          return "wide";
        }

        return "regular";
      }

      function getSubtreeLayout(parentNode, childDepth, childCount) {

        var hintedLayout = String((parentNode && parentNode.preferred_subtree_layout) || "").trim().toLowerCase();
        if (hintedLayout === "card-grid" || hintedLayout === "chip-grid") {
          if (strategy === "grid") {
            return "tree";
          }
          return hintedLayout;
        }

        var total = Math.max(0, parseInt(String(childCount || ((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.child_count) || 0)), 10) || 0);

        if (!total) return "tree";

        if (strategy === "grid") return "tree";

        var localDepth = parseInt(String((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.max_depth) || 0), 10);
        var localBreadth = parseInt(String((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.max_breadth) || total), 10);

        if (childDepth === 2) {

          if (total <= 4 && width >= 760) return "card-grid";

          if (total <= 8 && width >= 1080 && String(parentNode.semantic_level || "") === "l1") {

            return "card-grid";

          }

          if (localDepth >= 2 && localBreadth <= 12 && total <= 6 && width >= 1240) {

            return "card-grid";

          }

          if (total <= 12 && width >= 1320 && String(parentNode.semantic_level || "") === "l1") {

            return "card-grid";

          }

        }

        if (childDepth >= 3 && total <= 6 && localDepth <= 2 && width >= 900) {

          return "chip-grid";

        }

        return "tree";

      }

      function buildSubtreeChipList(parentNode, children, maxVisible) {

        var chipList = makeNode("div", "ct-subtree-chip-list");
        chipList.setAttribute("data-ct-subtree-layout", "chip-grid");
        if (parentNode && parentNode.id) {
          chipList.setAttribute("data-parent-id", String(parentNode.id));
        }

        var visible = Math.max(0, parseInt(String(maxVisible || children.length), 10) || children.length);

        children.slice(0, visible).forEach(function (child) {

          var chip = makeNode("a", "ct-subtree-chip", getDisplayLabel(child));

          chip.href = String(child.url || "#");

          chip.title = getFullLabel(child);

          chipList.appendChild(chip);

        });

        if (children.length > visible) {

          chipList.appendChild(buildClusterDot(children.length - visible, parentNode.url, parentNode));

        }

        return chipList;

      }

      function buildSubtreeGrid(parentNode, children, childDepth, expanded, tier) {

        var grid = makeNode("div", "ct-subtree-grid ct-subtree-grid-l" + Math.min(childDepth, 4));
        grid.setAttribute("data-ct-subtree-layout", "card-grid");
        if (parentNode && parentNode.id) {
          grid.setAttribute("data-parent-id", String(parentNode.id));
        }

        var inlineLimit = expanded ? children.length : Math.min(children.length, childDepth === 2 ? 8 : 6);

        children.slice(0, inlineLimit).forEach(function (child) {

          var card = makeNode("div", "ct-subtree-card");

          var cardBubble = buildTreeNodeBubble(child, getNodeSizeClass(childDepth, strategy, child));

          cardBubble.classList.add("ct-subtree-node");

          card.appendChild(cardBubble);

          var subChildren = childrenByParent[child.id] || [];

          if (subChildren.length > 0) {

            var isChildExpanded = !!state.expandedBranches[child.id];

            var subToggle = createExpandToggle(child, isChildExpanded);

            (function (nodeId) {

              subToggle.addEventListener("click", function (event) {

                event.preventDefault();

                event.stopPropagation();

                toggleBranchExpansion(nodeId, subToggle);

              });

            })(child.id);

            cardBubble.appendChild(subToggle);

            if (isChildExpanded || subChildren.length <= getInlineL3Limit(tier, strategy, child)) {

              card.appendChild(buildSubtreeChipList(child, subChildren, isChildExpanded ? subChildren.length : 4));

            }

          }

          grid.appendChild(card);

        });

        if (children.length > inlineLimit && !expanded) {

          var overflowCard = makeNode("div", "ct-subtree-card ct-subtree-card-overflow");

          overflowCard.appendChild(buildClusterDot(children.length - inlineLimit, parentNode.url, parentNode));

          grid.appendChild(overflowCard);

        }

        return grid;

      }



      /* --- Recursive child builder for any depth --- */

      function buildChildrenRecursive(parentNode, depth, expanded) {

        var children = childrenByParent[parentNode.id] || [];

        if (!children.length) return null;

        var tier = String(parentNode.density_tier || "balanced");

        var limit;

        if (depth <= 2) {

          limit = expanded ? children.length : getInlineChildLimit(tier, depth, strategy, parentNode);

        } else {

          limit = expanded ? children.length : getInlineL3Limit(tier, strategy, parentNode);

        }

        if (limit <= 0 && !expanded) return null;



        var childDepthForLayout = parseInt(String(depth || 0), 10) + 1;

        var subtreeLayout = getSubtreeLayout(parentNode, childDepthForLayout, children.length);

        if (subtreeLayout === "card-grid") {

          return buildSubtreeGrid(parentNode, children, childDepthForLayout, expanded, tier);

        }

        if (subtreeLayout === "chip-grid") {

          return buildSubtreeChipList(parentNode, children, expanded ? children.length : Math.min(children.length, 6));

        }

        var groupClass = depth <= 2 ? "ct-l2-group" : "ct-l3-group";

        var wrap = makeNode("div", groupClass);
        wrap.setAttribute("data-ct-subtree-layout", "tree");
        wrap.setAttribute("data-ct-child-depth", String(childDepthForLayout));
        if (parentNode && parentNode.id) {
          wrap.setAttribute("data-parent-id", String(parentNode.id));
        }

        var shown = children.slice(0, Math.min(limit, children.length));



        shown.forEach(function (child) {

          var childDepth = parseInt(String(child.depth || depth + 1), 10);

          var sizeClass = getNodeSizeClass(childDepth, strategy, child);

          var childRow = makeNode("div", "ct-tree-row ct-tree-row-l" + Math.min(childDepth, 4));

          if (strategy !== "cascade") {

            childRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

          }

          var childBubble = buildTreeNodeBubble(child, sizeClass);

          childRow.appendChild(childBubble);



          /* recursively build grandchildren */

          var isChildExpanded = !!state.expandedBranches[child.id];

          var subChildren = childrenByParent[child.id] || [];

          if (subChildren.length > 0) {

            /* add expand toggle */

            var subToggle = createExpandToggle(child, isChildExpanded);

            (function (nodeId) {

              subToggle.addEventListener("click", function (event) {

                event.preventDefault();

                event.stopPropagation();

                toggleBranchExpansion(nodeId, subToggle);

              });

            })(child.id);

            childBubble.appendChild(subToggle);

          }



          if (isChildExpanded || (subChildren.length > 0 && subChildren.length <= getInlineL3Limit(tier, strategy, child))) {

            var subGroup = buildChildrenRecursive(child, childDepth, isChildExpanded);

            if (subGroup) {

              if (strategy !== "cascade") {

                childRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

              }

              childRow.appendChild(subGroup);

            }

          }



          wrap.appendChild(childRow);

        });



        if (children.length > limit && !expanded) {

          var overflowRow = makeNode("div", "ct-tree-row ct-tree-row-l" + Math.min(depth + 1, 4));

          if (strategy !== "cascade") {

            overflowRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

          }

          overflowRow.appendChild(buildClusterDot(children.length - limit, parentNode.url, parentNode));

          wrap.appendChild(overflowRow);

        }

        return wrap;

      }



      /* --- L1 branch row builder --- */

      function buildBranchRow(branchNode, index) {

        var isSelectedBranch = String(state.selectedBranchId || "").trim() === String(branchNode.id || "").trim();

        var sizeClass = getNodeSizeClass(1, strategy, branchNode);

        var row = makeNode("div", "ct-tree-row ct-tree-row-l1");

        row.setAttribute("data-branch-id", branchNode.id);

        row.setAttribute("data-branch-index", String(index));



        if (strategy !== "cascade") {

          row.appendChild(makeNode("span", "ct-connector ct-connector-h ct-connector-root", ""));

        }



        var l1Bubble = buildTreeNodeBubble(branchNode, sizeClass);

        row.appendChild(l1Bubble);



        bindBranchInteractions(row, branchNode, { selectOnClick: true });



        return row;

      }



      /* --- Grid pill builder (compact grid mode) --- */

      function buildGridPill(branchNode, index) {
        var isSelectedBranch = String(state.selectedBranchId || "").trim() === String(branchNode.id || "").trim();
        var descendantTotal = parseInt(String(branchNode.descendant_total || 0), 10);

        /* tag-cloud sizing: heavy branches get bigger pills */
        var pillSizeClass = "";
        if (descendantTotal >= 20) {
          pillSizeClass = " ct-grid-pill-lg";
        } else if (descendantTotal >= 8) {
          pillSizeClass = " ct-grid-pill-md";
        }

        var pill = makeNode("div", "ct-grid-pill" + pillSizeClass + (isSelectedBranch ? " ct-grid-pill-selected" : ""));
        pill.setAttribute("data-branch-id", branchNode.id);

        /* use larger node for heavy pills */
        var sizeClass = descendantTotal >= 20 ? "ct-node-md" : getNodeSizeClass(1, strategy, branchNode);
        var bubble = buildTreeNodeBubble(branchNode, sizeClass);
        pill.appendChild(bubble);
        bindBranchInteractions(pill, branchNode, { selectOnClick: true });

        return pill;
      }



      /* === RENDER === */

      board.innerHTML = "";
      board.classList.remove("ct-layout-fanout", "ct-layout-cascade", "ct-layout-grid", "ct-layout-tree", "ct-vertical", "ct-horizontal");

      if (focusTray) {

        focusTray.innerHTML = "";

        focusTray.hidden = true;

      }



      container.setAttribute("data-ct-strategy", strategy);
      container.setAttribute("data-ct-auto-strategy", autoStrategy);
      syncClusterLabels(strategy);

      board.classList.toggle("ct-vertical", isVertical);

      board.classList.toggle("ct-horizontal", !isVertical);



      /* Keep the synthetic root in data for layout/state, but do not draw a
         visible root card above the actual map contents. */



      if (strategy === "fanout") {

        /* --- CENTERED ROOT + RESPONSIVE CHILD FANOUT --- */

        board.classList.add("ct-layout-fanout");

        var fanoutWrap = makeNode("div", "ct-fanout-wrap");

        var fanoutGrid = makeNode("div", "ct-fanout-grid");
        var fanoutColumns = getFanoutColumnCount(l1Count, width);
        fanoutGrid.style.setProperty("--ct-fanout-columns", String(fanoutColumns));
        fanoutGrid.setAttribute("data-ct-columns", String(fanoutColumns));
        fanoutGrid.setAttribute("data-ct-subtree-layout", "fanout-grid");

        allBranches.forEach(function (branchNode, index) {

          fanoutGrid.appendChild(buildFanoutCard(branchNode, index));

        });

        fanoutWrap.appendChild(fanoutGrid);

        board.appendChild(fanoutWrap);



      } else if (strategy === "cascade") {

        /* --- VERTICAL CASCADE --- */

        board.classList.add("ct-layout-cascade");

        var cascadeWrap = makeNode("div", "ct-cascade-levels");

        var branchLevel = makeNode("div", "ct-cascade-row");

        allBranches.forEach(function (branchNode, index) {

          var branchItem = makeNode("div", "ct-cascade-item");

          branchItem.appendChild(buildBranchRow(branchNode, index));

          branchLevel.appendChild(branchItem);

        });

        cascadeWrap.appendChild(branchLevel);

        board.appendChild(cascadeWrap);



      } else if (strategy === "grid") {

        /* --- COMPACT GRID --- */

        board.classList.add("ct-layout-grid");

        var gridWrap = makeNode("div", "ct-grid-wrap");
        gridWrap.setAttribute("data-ct-subtree-layout", "top-level-grid");

        var maxPills = l1Count <= 50 ? l1Count : Math.min(60, l1Count);

        var shownBranches = allBranches.slice(0, maxPills);

        shownBranches.forEach(function (branchNode, index) {

          gridWrap.appendChild(buildGridPill(branchNode, index));

        });

        if (allBranches.length > maxPills) {

          gridWrap.appendChild(buildClusterDot(allBranches.length - maxPills, rootNode.url, rootNode));

        }

        board.appendChild(gridWrap);



      } else {

        /* --- HORIZONTAL TREE --- */

        board.classList.add("ct-layout-tree");

        var treeWrap = makeNode("div", "ct-tree-wrap");
        var treeGrid = makeNode("div", "ct-tree-grid");
        var treeColumns = getTreeColumnCount(l1Count, width, {
          focusedBranchMode: shouldPreferFocusedBranch,
          deepTree: maxDepth >= 3
        });
        var treeMaxWidthRem = treeColumns >= 4 ? 104 : (treeColumns === 3 ? 98 : 92);
        treeGrid.style.setProperty("--ct-tree-columns", String(treeColumns));
        treeGrid.setAttribute("data-ct-tree-columns", String(treeColumns));
        treeWrap.style.setProperty("--ct-tree-max-width", String(treeMaxWidthRem) + "rem");

        allBranches.forEach(function (branchNode, index) {

          var branchItem = makeNode("div", "ct-tree-branch-item");
          var branchSpan = getTreeBranchSpan(branchNode, treeColumns);
          branchItem.setAttribute("data-ct-branch-span", branchSpan);
          if (branchSpan === "full") {
            branchItem.classList.add("ct-tree-branch-item-full");
          } else if (branchSpan === "wide") {
            branchItem.classList.add("ct-tree-branch-item-wide");
          }
          branchItem.appendChild(buildBranchRow(branchNode, index));
          treeGrid.appendChild(branchItem);

        });

        treeWrap.appendChild(treeGrid);
        board.appendChild(treeWrap);

      }

      syncBranchAttention();
      renderFocusTrayFromState();
      container.classList.toggle(
        "home-cluster-mobile-detail",
        !!(isVertical && shouldPreferFocusedBranch && state.manualSelection && String(state.selectedBranchId || "").trim())
      );

      function removeClusterConnectorOverlay() {
        var existingOverlay = board.querySelector(".ct-connector-overlay");
        if (existingOverlay && existingOverlay.parentNode) {
          existingOverlay.parentNode.removeChild(existingOverlay);
        }
        board.classList.remove("ct-svg-connectors");
      }

      function ensureClusterConnectorOverlay() {
        var overlay = board.querySelector(".ct-connector-overlay");
        if (overlay) {
          return overlay;
        }
        overlay = document.createElementNS(svgNs, "svg");
        overlay.setAttribute("class", "ct-connector-overlay");
        overlay.setAttribute("aria-hidden", "true");
        board.insertBefore(overlay, board.firstChild || null);
        return overlay;
      }

      function refreshClusterConnectorOverlay() {
        if (
          isVertical
          || strategy === "grid"
          || !document.createElementNS
          || !board.isConnected
        ) {
          removeClusterConnectorOverlay();
          return;
        }

        var boardRect = board.getBoundingClientRect();
        var overlayWidth = Math.max(Math.ceil(boardRect.width || 0), board.scrollWidth || 0);
        var overlayHeight = Math.max(Math.ceil(boardRect.height || 0), board.scrollHeight || 0);
        if (!overlayWidth || !overlayHeight) {
          removeClusterConnectorOverlay();
          return;
        }

        var renderedById = {};
        Array.prototype.forEach.call(board.querySelectorAll(".ct-node[data-node-id]"), function (bubble) {
          var nodeId = String(bubble.getAttribute("data-node-id") || "").trim();
          if (nodeId && !renderedById[nodeId]) {
            renderedById[nodeId] = bubble;
          }
        });

        var connectors = [];
        Object.keys(renderedById).forEach(function (nodeId) {
          var node = nodeById[nodeId];
          var parentId = String((node && node.parent_id) || "").trim();
          var parentBubble = parentId ? renderedById[parentId] : null;
          var usesVirtualRoot = !!(
            parentId
            && rootNode
            && String(rootNode.id || "").trim() === parentId
            && !parentBubble
          );
          if (!parentId || (!parentBubble && !usesVirtualRoot)) {
            return;
          }

          var childRect = renderedById[nodeId].getBoundingClientRect();
          var parentRect = parentBubble ? parentBubble.getBoundingClientRect() : null;
          var horizontalDistance = parentRect ? Math.abs(childRect.left - parentRect.right) : 0;
          var verticalDistance = parentRect ? Math.abs(childRect.top - parentRect.bottom) : 999;
          var mostlyHorizontal = horizontalDistance >= verticalDistance;
          var startX;
          var startY;
          var endX;
          var endY;
          var pathData;

          if (usesVirtualRoot) {
            startX = boardRect.width * 0.5;
            startY = 1;
            endX = childRect.left - boardRect.left + (childRect.width * 0.5);
            endY = childRect.top - boardRect.top;
            var rootControl = Math.max(22, Math.abs(endY - startY) * 0.56);
            pathData = "M " + startX + " " + startY
              + " C " + startX + " " + (startY + rootControl)
              + ", " + endX + " " + (endY - rootControl)
              + ", " + endX + " " + endY;
          } else if (mostlyHorizontal) {
            startX = parentRect.right - boardRect.left;
            startY = parentRect.top - boardRect.top + (parentRect.height * 0.5);
            endX = childRect.left - boardRect.left;
            endY = childRect.top - boardRect.top + (childRect.height * 0.5);
            var horizontalControl = Math.max(22, Math.abs(endX - startX) * 0.52);
            pathData = "M " + startX + " " + startY
              + " C " + (startX + horizontalControl) + " " + startY
              + ", " + (endX - horizontalControl) + " " + endY
              + ", " + endX + " " + endY;
          } else {
            startX = parentRect.left - boardRect.left + (parentRect.width * 0.5);
            startY = parentRect.bottom - boardRect.top;
            endX = childRect.left - boardRect.left + (childRect.width * 0.5);
            endY = childRect.top - boardRect.top;
            var verticalControl = Math.max(18, Math.abs(endY - startY) * 0.52);
            pathData = "M " + startX + " " + startY
              + " C " + startX + " " + (startY + verticalControl)
              + ", " + endX + " " + (endY - verticalControl)
              + ", " + endX + " " + endY;
          }

          connectors.push({
            childId: nodeId,
            isActive: isNodeInSelectedBranch(nodeId),
            pathData: pathData
          });
        });

        if (!connectors.length) {
          removeClusterConnectorOverlay();
          return;
        }

        var overlay = ensureClusterConnectorOverlay();
        while (overlay.firstChild) {
          overlay.removeChild(overlay.firstChild);
        }
        overlay.setAttribute("viewBox", "0 0 " + overlayWidth + " " + overlayHeight);
        overlay.setAttribute("width", String(overlayWidth));
        overlay.setAttribute("height", String(overlayHeight));

        connectors.forEach(function (connector) {
          var path = document.createElementNS(svgNs, "path");
          path.setAttribute("class", "ct-connector-path" + (connector.isActive ? " is-active" : ""));
          path.setAttribute("d", connector.pathData);
          path.setAttribute("data-child-id", connector.childId);
          overlay.appendChild(path);
        });
        board.classList.add("ct-svg-connectors");
      }

      function scheduleClusterConnectorOverlayRefresh() {
        if (container.__homeClusterConnectorFrame) {
          window.cancelAnimationFrame(container.__homeClusterConnectorFrame);
        }
        container.__homeClusterConnectorFrame = window.requestAnimationFrame(function () {
          container.__homeClusterConnectorFrame = 0;
          var refreshOverlay = container.__homeClusterConnectorRefresh;
          if (typeof refreshOverlay === "function") {
            refreshOverlay();
          }
        });
      }

      container.__homeClusterConnectorRefresh = refreshClusterConnectorOverlay;
      scheduleClusterConnectorOverlayRefresh();

      if (!container.__homeClusterConnectorOverlayBound) {
        if (window.ResizeObserver) {
          container.__homeClusterConnectorObserver = new ResizeObserver(function () {
            scheduleClusterConnectorOverlayRefresh();
          });
          container.__homeClusterConnectorObserver.observe(board);
        }
        if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
          document.fonts.ready.then(function () {
            scheduleClusterConnectorOverlayRefresh();
          }).catch(function () {
            // Ignore font observer failures.
          });
        }
        container.__homeClusterConnectorOverlayBound = true;
      }

      if (focusTray && !focusTray.__homeClusterPreviewBound) {
        focusTray.__homeClusterPreviewBound = true;
        focusTray.addEventListener("mouseenter", function () {
          cancelPendingHoverClear();
          var pendingBranchId = String(container.__homeClusterPendingPreviewBranchId || "").trim();
          if (pendingBranchId && nodeById[pendingBranchId] && state.hoveredBranchId !== pendingBranchId) {
            setHoveredBranch(pendingBranchId);
          }
        });
        focusTray.addEventListener("focusin", function () {
          cancelPendingHoverClear();
        });
        focusTray.addEventListener("mouseleave", function () {
          if (isHoverPreviewActive()) {
            clearHoveredBranch(state.hoveredBranchId);
          }
        });
        focusTray.addEventListener("focusout", function (event) {
          if (focusTray.contains(event.relatedTarget)) {
            return;
          }
          if (isHoverPreviewActive()) {
            clearHoveredBranch(state.hoveredBranchId);
          }
        });
      }



      /* resize handler */

      if (!container.__homeClusterResizeHandler) {

        container.__homeClusterResizeHandler = function () {

          renderHomeClusterMap(container, payload, nodes);

        };

        window.addEventListener("resize", container.__homeClusterResizeHandler);

      }



      /* jump-pill handler */

      if (!container.__homeClusterJumpHandler) {

        container.__homeClusterJumpHandler = function (event) {

          var trigger = event.target && event.target.closest ? event.target.closest("[data-home-cluster-jump]") : null;

          if (!trigger) return;

          var branchBase = String(trigger.getAttribute("data-home-cluster-jump") || "").trim();

          var targetId = branchByBase[branchBase] || "";

          if (!targetId) return;

          event.preventDefault();

          setSelectedBranch(targetId, { manual: true });

          renderHomeClusterMap(container, payload, nodes);

          var targetRow = board.querySelector("[data-branch-id=\"" + targetId + "\"]");

          if (targetRow && typeof targetRow.scrollIntoView === "function") {

            targetRow.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });

          } else if (typeof container.scrollIntoView === "function") {

            container.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });

          }

        };

        document.addEventListener("click", container.__homeClusterJumpHandler);

      }



      /* strategy sub-switcher buttons */

      var stratSwitcher = container.querySelector("[data-ct-strategy-switcher]");

      if (stratSwitcher) {

        var stratBtns = stratSwitcher.querySelectorAll("[data-ct-strategy-btn]");

        Array.prototype.forEach.call(stratBtns, function (btn) {

          var btnStrategy = String(btn.getAttribute("data-ct-strategy-btn") || "").trim().toLowerCase();

          var isActive = (!container.getAttribute("data-ct-strategy-override") && (
            btnStrategy === autoStrategy
            || (autoStrategy === "fanout" && btnStrategy === "adaptive")
          ))

            || (btnStrategy === strategy && container.getAttribute("data-ct-strategy-override"));

          btn.classList.toggle("is-active", isActive);

          btn.setAttribute("aria-pressed", isActive ? "true" : "false");

          if (!btn.__ctStrategyBound) {

            btn.__ctStrategyBound = true;

            btn.addEventListener("click", function () {

              var nextStrategy = String(btn.getAttribute("data-ct-strategy-btn") || "").trim().toLowerCase();

              if (nextStrategy === "adaptive") {

                container.removeAttribute("data-ct-strategy-override");

              } else {

                container.setAttribute("data-ct-strategy-override", nextStrategy);

              }

              renderHomeClusterMap(container, payload, nodes);

            });

          }

        });

      }

    }



    function renderHomeGraph(container) {
      var dataNode = container.querySelector("[data-hierarchy-graph-data]");
      if (!dataNode) {
        return;
      }

      var payload = {};
      try {
        payload = JSON.parse(String(dataNode.textContent || "{}"));
      } catch (err) {
        payload = {};
      }
      var nodes = Array.isArray(payload.nodes) ? payload.nodes.slice() : [];
      if (!nodes.length) {
        container.hidden = true;
        return;
      }

      var mode = String(payload.mode || container.getAttribute("data-hierarchy-mode") || "tree-diagram").trim().toLowerCase();
      if (container.hasAttribute("data-home-cluster-map")) {
        renderHomeClusterMap(container, payload, nodes);
        return;
      }

      var svg = container.querySelector("svg");
      if (!svg) {
        return;
      }

      var compact = Boolean(container.clientWidth && container.clientWidth < 700 && mode !== "tree-diagram" && mode !== "cluster-diagram");
      var depthGroups = {};
      var childrenByParent = {};
      var positionsById = {};
      var maxDepth = 0;

      nodes.forEach(function (node) {
        node.depth = parseInt(String(node.depth || 0), 10);
        if (!Number.isFinite(node.depth) || node.depth < 0) {
          node.depth = 0;
        }
        maxDepth = Math.max(maxDepth, node.depth);
        if (!depthGroups[node.depth]) {
          depthGroups[node.depth] = [];
        }
        depthGroups[node.depth].push(node);
        var parentId = String(node.parent_id || "").trim();
        if (parentId) {
          if (!childrenByParent[parentId]) {
            childrenByParent[parentId] = [];
          }
          childrenByParent[parentId].push(node);
        }
      });

      Object.keys(depthGroups).forEach(function (depthKey) {
        depthGroups[depthKey].sort(function (a, b) {
          var aSlot = parseInt(String(a.slot_index || 0), 10);
          var bSlot = parseInt(String(b.slot_index || 0), 10);
          if (Number.isFinite(aSlot) && Number.isFinite(bSlot) && aSlot !== bSlot) {
            return aSlot - bSlot;
          }
          return String(a.label || "").localeCompare(String(b.label || ""));
        });
      });

      clearSvg(svg);

      var depthOneCount = (depthGroups[1] || []).length;
      var width = Math.max(980, container.clientWidth || 980);
      if (mode === "tree-diagram") {
        width = Math.max(width, 260 + (depthOneCount * 190));
      } else {
        width = Math.max(width, 1040);
      }
      if (compact) {
        width = Math.max(container.clientWidth || 360, 360);
      }
      var rowGap = compact ? 112 : 126;
      var height = 140 + ((maxDepth + 1) * rowGap);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      var margin = compact ? 28 : 80;
      var rootNodes = depthGroups[0] || [];
      if (rootNodes.length) {
        rootNodes[0].x = Math.round(width / 2);
        rootNodes[0].y = 64;
        positionsById[rootNodes[0].id] = { x: rootNodes[0].x, y: rootNodes[0].y };
      }

      var depthOneNodes = depthGroups[1] || [];
      var depthOnePositions = buildSpreadPositions(
        depthOneNodes.length,
        margin + 40,
        width - margin - 40,
        compact ? 188 : 206
      );
      for (var depthOneIndex = 0; depthOneIndex < depthOneNodes.length; depthOneIndex += 1) {
        depthOneNodes[depthOneIndex].x = depthOnePositions[depthOneIndex].x;
        depthOneNodes[depthOneIndex].y = depthOnePositions[depthOneIndex].y;
        positionsById[depthOneNodes[depthOneIndex].id] = {
          x: depthOneNodes[depthOneIndex].x,
          y: depthOneNodes[depthOneIndex].y
        };
      }

      var depthTwoNodes = depthGroups[2] || [];
      if (depthTwoNodes.length) {
        var segmentCount = Math.max(1, depthOneNodes.length || rootNodes.length || 1);
        var segmentWidth = Math.max(168, Math.floor((width - (margin * 2)) / segmentCount));
        var fallbackParent = depthOneNodes[0] || rootNodes[0] || null;
        depthTwoNodes.forEach(function (node) {
          var parentId = String(node.parent_id || "").trim();
          var parentNode = null;
          if (parentId) {
            parentNode = depthOneNodes.filter(function (candidate) {
              return candidate.id === parentId;
            })[0] || rootNodes.filter(function (candidate) {
              return candidate.id === parentId;
            })[0] || null;
          }
          if (!parentNode) {
            parentNode = fallbackParent;
          }
          var parentIndex = Math.max(0, depthOneNodes.indexOf(parentNode));
          var siblings = childrenByParent[parentNode ? parentNode.id : ""] || [node];
          var siblingIndex = Math.max(0, siblings.indexOf(node));
          var segmentStart = margin + (parentIndex * segmentWidth);
          var segmentEnd = segmentStart + segmentWidth;
          var childPositions = buildSpreadPositions(
            siblings.length,
            segmentStart + 18,
            segmentEnd - 18,
            compact ? 308 : 336
          );
          var position = childPositions[siblingIndex] || {
            x: Math.round((segmentStart + segmentEnd) / 2),
            y: compact ? 308 : 336
          };
          node.x = position.x;
          node.y = position.y;
          positionsById[node.id] = { x: node.x, y: node.y };
        });
      }

      (payload.edges || []).forEach(function (edge) {
        var from = positionsById[String((edge && edge.from) || "")];
        var to = positionsById[String((edge && edge.to) || "")];
        if (!from || !to) {
          return;
        }
        appendEdge(svg, from.x, from.y + 30, to.x, to.y - 30, "hierarchy-graph-edge-tree");
      });

      nodes.forEach(function (node) {
        if (!positionsById[node.id]) {
          return;
        }
        node.x = positionsById[node.id].x;
        node.y = positionsById[node.id].y;
        appendNode(svg, node, { compact: compact });
      });
    }

    Array.prototype.forEach.call(homeGraphContainers, renderHomeGraph);
    Array.prototype.forEach.call(articleGraphContainers, renderArticleGraph);
    document.addEventListener("phoenix-home-mode-changed", function () {
      window.setTimeout(function () {
        Array.prototype.forEach.call(homeGraphContainers, renderHomeGraph);
      }, 0);
    });
  }

  function slugify(text) {
    var slug = String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\\s-]/g, "")
      .replace(/\\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return slug || "section";
  }

  function markEndnotesAnchor(articleRoot) {
    if (!articleRoot) {
      return;
    }
    var candidates = articleRoot.querySelectorAll("h1, h2, h3, h4, h5, h6, p, strong");
    for (var i = 0; i < candidates.length; i += 1) {
      var node = candidates[i];
      var label = String(node.textContent || "").trim().toLowerCase();
      if (label === "endnotes" || label === "references" || label === "sources") {
        if (!node.id) {
          node.id = "endnotes";
        }
        node.classList.add("endnotes-marker");
        return;
      }
    }
  }

  function initEndnotesCollapsing() {
    var article = document.querySelector(".article-body");
    var root = document.documentElement;
    if (!article || !root) {
      return;
    }

    markEndnotesAnchor(article);

    var mode = String(root.getAttribute("data-endnotes-mode") || "auto").toLowerCase();
    if (mode !== "auto" && mode !== "expanded" && mode !== "collapsed") {
      mode = "auto";
    }
    if (mode === "expanded") {
      return;
    }

    var threshold = parseInt(root.getAttribute("data-endnotes-collapse-threshold"), 10);
    if (!Number.isFinite(threshold) || threshold < 1) {
      threshold = 6;
    }
    var initialVisible = parseInt(root.getAttribute("data-endnotes-initial-visible"), 10);
    if (!Number.isFinite(initialVisible) || initialVisible < 1) {
      initialVisible = 6;
    }

    var marker = article.querySelector(".endnotes-marker, #endnotes");
    if (!marker) {
      return;
    }

    var entries = [];
    var sections = [];
    var currentSection = {
      heading: null,
      refs: [],
      lists: []
    };
    sections.push(currentSection);
    var cursor = marker.nextElementSibling;
    while (cursor) {
      if (cursor.classList && cursor.classList.contains("further-reading-section")) {
        break;
      }
      var tag = String(cursor.tagName || "").toUpperCase();
      if (/^H[1-6]$/.test(tag) && !cursor.classList.contains("endnotes-marker")) {
        var headingLabel = String(cursor.textContent || "").trim().toLowerCase();
        if (headingLabel === "additional references" || headingLabel === "additional sources") {
          cursor.classList.add("additional-references-marker");
          currentSection = {
            heading: cursor,
            refs: [],
            lists: []
          };
          sections.push(currentSection);
        } else {
          break;
        }
      }
      if (tag !== "SCRIPT" && tag !== "STYLE") {
        entries.push(cursor);
        if (tag === "OL" || tag === "UL") {
          currentSection.lists.push(cursor);
          var listItems = Array.prototype.filter.call(cursor.children, function (node) {
            return String((node && node.tagName) || "").toUpperCase() === "LI";
          });
          if (listItems.length) {
            cursor.classList.add("endnotes-entry-list");
            Array.prototype.forEach.call(listItems, function (item) {
              currentSection.refs.push({
                node: item,
                container: cursor
              });
            });
          } else {
            currentSection.refs.push({
              node: cursor,
              container: cursor
            });
          }
        } else if (!cursor.classList.contains("additional-references-marker")) {
          currentSection.refs.push({
            node: cursor,
            container: cursor
          });
        }
      }
      cursor = cursor.nextElementSibling;
    }

    if (!entries.length) {
      return;
    }

    var toggleTargets = [];
    Array.prototype.forEach.call(sections, function (section) {
      Array.prototype.forEach.call(section.refs, function (ref) {
        toggleTargets.push(ref);
      });
    });
    var summaryNoun = sections.length > 1 ? "references" : "endnotes";

    if (mode === "auto" && toggleTargets.length <= threshold) {
      return;
    }
    if (initialVisible >= toggleTargets.length) {
      return;
    }

    Array.prototype.forEach.call(toggleTargets, function (entry, index) {
      if (!entry || !entry.node) {
        return;
      }
      entry.node.classList.add("endnotes-entry");
      entry.node.classList.toggle("is-hidden-endnote", index >= initialVisible);
    });

    var controlGroups = [];
    var createControls = function (position) {
      var controls = document.createElement("div");
      controls.className = "endnotes-toggle-wrap";
      if (position === "bottom") {
        controls.classList.add("endnotes-toggle-wrap-bottom");
      }

      var summary = document.createElement("p");
      summary.className = "endnotes-toggle-summary";
      controls.appendChild(summary);

      var button = document.createElement("button");
      button.type = "button";
      button.className = "endnotes-toggle-button";
      controls.appendChild(button);

      controlGroups.push({ summary: summary, button: button });
      return controls;
    };

    var topControls = createControls("top");
    marker.insertAdjacentElement("afterend", topControls);

    var bottomControls = createControls("bottom");
    entries[entries.length - 1].insertAdjacentElement("afterend", bottomControls);

    var expanded = false;
    var setBlockHidden = function (node, hidden) {
      if (!node || !node.classList) {
        return;
      }
      node.classList.toggle("is-hidden-endnote-block", Boolean(hidden));
    };
    var applyControlState = function (summaryText, buttonText, ariaExpanded) {
      Array.prototype.forEach.call(controlGroups, function (group) {
        if (!group) {
          return;
        }
        group.summary.textContent = summaryText;
        group.button.textContent = buttonText;
        group.button.setAttribute("aria-expanded", ariaExpanded);
      });
    };
    var update = function () {
      Array.prototype.forEach.call(toggleTargets, function (entry, index) {
        if (!entry || !entry.node || !entry.node.classList) {
          return;
        }
        entry.node.classList.toggle("is-hidden-endnote", !expanded && index >= initialVisible);
      });
      Array.prototype.forEach.call(sections, function (section) {
        var visibleInSection = 0;
        Array.prototype.forEach.call(section.refs, function (entry) {
          if (!entry || !entry.node || !entry.node.classList) {
            return;
          }
          if (!entry.node.classList.contains("is-hidden-endnote")) {
            visibleInSection += 1;
          }
        });
        if (section.heading) {
          setBlockHidden(section.heading, !expanded && visibleInSection < 1);
        }
        Array.prototype.forEach.call(section.lists, function (listNode) {
          var listVisibleCount = 0;
          Array.prototype.forEach.call(section.refs, function (entry) {
            if (!entry || entry.container !== listNode || !entry.node || !entry.node.classList) {
              return;
            }
            if (!entry.node.classList.contains("is-hidden-endnote")) {
              listVisibleCount += 1;
            }
          });
          setBlockHidden(listNode, !expanded && listVisibleCount < 1);
        });
      });
      if (expanded) {
        applyControlState(
          "Showing all " + String(toggleTargets.length) + " " + summaryNoun + ".",
          "Show fewer references",
          "true"
        );
      } else {
        var hiddenCount = Math.max(0, toggleTargets.length - initialVisible);
        applyControlState(
          "Showing first " + String(initialVisible) + " of " + String(toggleTargets.length) + " " + summaryNoun + ".",
          "Show " + String(hiddenCount) + " more references",
          "false"
        );
      }
    };

    Array.prototype.forEach.call(controlGroups, function (group) {
      group.button.addEventListener("click", function () {
        expanded = !expanded;
        update();
      });
    });
    update();
  }

  function detectPseudoHeadings(article) {
    if (!article) {
      return;
    }
    var sourceLabelPattern = /\\b(?:academic|publishing|springer|wikipedia|researchgate|youtube|journal|press)\\b/i;
    var sourceLabelAliases = {
      "oup academic": true,
      "aip publishing": true,
      "wikipedia": true,
      "springer": true,
      "researchgate": true,
      "youtube": true,
      "academia": true,
      "academic": true
    };
    var blocks = article.querySelectorAll("p");
    Array.prototype.forEach.call(blocks, function (node) {
      if (!node || !node.parentElement) {
        return;
      }
      if (node.closest && node.closest(".related-reports")) {
        return;
      }
      if (node.classList.contains("pseudo-heading-level-2") || node.classList.contains("pseudo-heading-level-3")) {
        return;
      }
      var text = String(node.textContent || "").trim();
      if (!text || text.length < 3 || text.length > 110) {
        return;
      }
      if (/https?:\/\//i.test(text)) {
        return;
      }
      var childCount = node.children ? node.children.length : 0;
      if (childCount === 1) {
        var onlyChild = node.children[0];
        if (!onlyChild || !onlyChild.tagName) {
          return;
        }
        var tag = String(onlyChild.tagName || "").toLowerCase();
        if (["strong", "b", "em", "i"].indexOf(tag) === -1) {
          return;
        }
        var styledLevelClass = (tag === "em" || tag === "i") ? "pseudo-heading-level-3" : "pseudo-heading-level-2";
        node.classList.add(styledLevelClass);
        return;
      }
      if (childCount !== 0) {
        return;
      }

      var lower = text.toLowerCase();
      if (sourceLabelAliases[lower] || sourceLabelPattern.test(lower)) {
        if (text.split(/\\s+/).length <= 3) {
          return;
        }
      }
      if (/^[a-z0-9-]+(?:\\.[a-z0-9-]+)+$/.test(lower)) {
        return;
      }
      if (/^\\s*(?:\\[(?:\\d+)\\]|\\d+\\.)\\s+/.test(text)) {
        return;
      }
      if ((/[.!?]$/.test(text) && text.length > 42) || (text.indexOf(":") !== -1 && text.length > 70)) {
        return;
      }
      if (!/^[A-Z]/.test(text)) {
        return;
      }

      var prev = node.previousElementSibling;
      var prevIsHeading = false;
      if (prev && prev.tagName) {
        var prevTag = String(prev.tagName || "").toUpperCase();
        prevIsHeading = prevTag === "H2" || prevTag === "H3" || prevTag === "H4"
          || prev.classList.contains("pseudo-heading-level-2")
          || prev.classList.contains("pseudo-heading-level-3");
      }
      var levelClass = prevIsHeading ? "pseudo-heading-level-3" : "pseudo-heading-level-2";
      node.classList.add(levelClass);
    });
  }

  function buildPageToc() {
    var tocRoots = document.querySelectorAll("[data-page-toc], [data-mobile-page-toc]");
    var article = document.querySelector(".article-body");
    if (!tocRoots.length || !article) {
      return;
    }
    document.documentElement.setAttribute("data-page-toc-count", "0");

    markEndnotesAnchor(article);
    var realHeadings = article.querySelectorAll("h2, h3, h4");
    if (realHeadings.length < 2) {
      detectPseudoHeadings(article);
    }

    function shouldIncludeTocHeading(heading, text) {
      var label = String(text || "").trim();
      if (!label) {
        return false;
      }
      if (/^showing first \d+ of \d+ endnotes\.?$/i.test(label)) {
        return false;
      }
      if (/^showing first \d+ of \d+ additional sources\.?$/i.test(label)) {
        return false;
      }
      if (/^show \d+ more sources\.?$/i.test(label) || /^show fewer sources\.?$/i.test(label)) {
        return false;
      }
      if (/^additional references?$/i.test(label) || /^additional sources?$/i.test(label)) {
        return false;
      }
      if (/et al\.?$/i.test(label) && label.length < 90 && label.indexOf(":") === -1) {
        return false;
      }
      if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}(?:,\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})+(?:\s+et al\.)?$/.test(label)) {
        return false;
      }
      if (heading && heading.classList && heading.classList.contains("endnotes-marker")) {
        return false;
      }
      return true;
    }

    var headings = article.querySelectorAll("h2, h3, h4, p.pseudo-heading-level-2, p.pseudo-heading-level-3");
    var dispatchState = function (hasHeadings) {
      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-page-toc-built", {
            detail: { hasHeadings: Boolean(hasHeadings) }
          })
        );
      } catch (err) {
        // Ignore custom event failures.
      }
    };
    var renderEmptyState = function () {
      Array.prototype.forEach.call(tocRoots, function (rootNode) {
        rootNode.innerHTML = "<p class=\"page-toc-empty\">No section headings detected.</p>";
      });
      dispatchState(false);
    };
    if (!headings.length) {
      renderEmptyState();
      return;
    }

    var usedIds = {};
    var headingList = [];
    var tocEntries = [];
    var linkGroups = [];
    var lastActiveId = "";
    var forcedActiveId = "";
    var forcedActiveExpiresAt = 0;

    Array.prototype.forEach.call(headings, function (heading) {
      if (heading.closest && heading.closest(".related-reports, .further-reading-section, [data-page-toc-exclude]")) {
        return;
      }
      var text = String(heading.textContent || "").trim();
      text = text.replace(/^\\s*(?:#+\\s*)+/, "").trim();
      if (!shouldIncludeTocHeading(heading, text)) {
        return;
      }
      var baseId = heading.id || slugify(text);
      var nextId = baseId;
      var suffix = 2;
      while (usedIds[nextId]) {
        nextId = baseId + "-" + String(suffix);
        suffix += 1;
      }
      usedIds[nextId] = true;
      if (!heading.id) {
        heading.id = nextId;
      }

      headingList.push(heading);
    });

    if (!headingList.length) {
      renderEmptyState();
      return;
    }

    var activeTopLevelEntry = null;
    Array.prototype.forEach.call(headingList, function (heading) {
      var text = String(heading.textContent || "").trim().replace(/^\s*(?:#+\s*)+/, "").trim();
      var tagName = String(heading.tagName || "").toUpperCase();
      var isDepth3 = (
        tagName === "H3"
        || tagName === "H4"
        || heading.classList.contains("pseudo-heading-level-3")
      );
      var entry = {
        id: heading.id,
        heading: heading,
        text: text,
        depth: isDepth3 ? 3 : 2,
        children: []
      };
      if (entry.depth === 2 || !activeTopLevelEntry) {
        tocEntries.push(entry);
        activeTopLevelEntry = entry.depth === 2 ? entry : activeTopLevelEntry;
        if (entry.depth === 2) {
          activeTopLevelEntry = entry;
        }
      } else {
        activeTopLevelEntry.children.push(entry);
      }
    });

    var topLevelEntriesWithChildren = tocEntries.filter(function (entry) {
      return Boolean(entry.children && entry.children.length);
    });
    var hasNestedGroups = Boolean(topLevelEntriesWithChildren.length);
    var flatTocMode = tocEntries.length >= 1;
    var balancedSingleBranch = false;
    var pageTocMode = flatTocMode ? "flat" : "default";
    var indexToAlphabeticLabel = function (index) {
      var value = Math.max(0, parseInt(String(index || 0), 10) || 0);
      var token = "";
      do {
        token = String.fromCharCode(97 + (value % 26)) + token;
        value = Math.floor(value / 26) - 1;
      } while (value >= 0);
      return token;
    };
    var normalizeTocLookupText = function (value) {
      return String(value || "")
        .replace(/[-_]+/g, " ")
        .replace(/[^\w\s']+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[’]/g, "'")
        .trim()
        .toLowerCase();
    };

    Array.prototype.forEach.call(tocEntries, function (entry, entryIndex) {
      entry.indexLabel = String(entryIndex + 1).padStart(2, "0");
      Array.prototype.forEach.call(entry.children || [], function (childEntry, childIndex) {
        childEntry.indexLabel = entry.indexLabel + indexToAlphabeticLabel(childIndex);
      });
    });

    var linkHeroHighlights = function () {
      var heroCopy = document.querySelector(".article-hero-copy");
      var highlights = document.querySelector(".article-hero-highlights-list");
      if (!highlights) {
        if (!heroCopy || !tocEntries.length) {
          return;
        }
        var section = document.createElement("section");
        section.className = "article-hero-highlights";
        section.setAttribute("aria-label", "Key sections");
        var title = document.createElement("p");
        title.className = "article-hero-highlights-title";
        var pageToolsLabel = document.querySelector(".page-tools-label, .mobile-page-tools-title");
        title.textContent = String((pageToolsLabel && pageToolsLabel.textContent) || "On this page").trim() || "On this page";
        highlights = document.createElement("ul");
        highlights.className = "article-hero-highlights-list";
        Array.prototype.slice.call(tocEntries, 0, 3).forEach(function (entry) {
          if (!entry || !entry.text) {
            return;
          }
          var item = document.createElement("li");
          item.textContent = entry.text;
          highlights.appendChild(item);
        });
        if (!highlights.children.length) {
          return;
        }
        section.appendChild(title);
        section.appendChild(highlights);
        heroCopy.appendChild(section);
      }
      var entriesByText = {};
      Array.prototype.forEach.call(tocEntries, function (entry) {
        var key = normalizeTocLookupText(entry.text);
        if (key && !entriesByText[key]) {
          entriesByText[key] = entry;
        }
      });
      Array.prototype.forEach.call(highlights.querySelectorAll("li"), function (item) {
        if (!item || item.querySelector("a")) {
          return;
        }
        var text = String(item.textContent || "").trim();
        var entry = entriesByText[normalizeTocLookupText(text)];
        if (!entry || !entry.id) {
          return;
        }
        var link = document.createElement("a");
        link.href = "#" + entry.id;
        link.textContent = text;
        item.textContent = "";
        item.appendChild(link);
      });
    };

    linkHeroHighlights();

    Array.prototype.forEach.call(tocRoots, function (rootNode) {
      var tocList = document.createElement("ul");
      var linksById = {};
      var setTocItemExpanded = function (item, isExpanded) {
        if (!item || !item.classList || !item.classList.contains("has-children")) {
          return;
        }
        item.classList.toggle("is-collapsed", !isExpanded);
        var toggle = item.querySelector(":scope > .page-toc-row > [data-page-toc-toggle]");
        if (!toggle) {
          return;
        }
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.setAttribute("title", isExpanded ? "Collapse subsections" : "Expand subsections");
        toggle.textContent = isExpanded ? "-" : "+";
      };
      var updateBulkActionButtons = function (buttons, isActive) {
        if (!buttons || !buttons.length) {
          return;
        }
        Array.prototype.forEach.call(buttons, function (button) {
          if (!button) {
            return;
          }
          button.classList.toggle("is-active", Boolean(isActive));
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      };
      var updateBulkActionState = function () {
        if (!hasNestedGroups) {
          return;
        }
        var nestedItems = rootNode.querySelectorAll(".page-toc-item.has-children");
        var allExpanded = Array.prototype.every.call(nestedItems, function (item) {
          return item && !item.classList.contains("is-collapsed");
        });
        var allCollapsed = Array.prototype.every.call(nestedItems, function (item) {
          return item && item.classList.contains("is-collapsed");
        });
        updateBulkActionButtons(expandAllButtons, allExpanded);
        updateBulkActionButtons(collapseAllButtons, allCollapsed);
      };
      var setAllTocItemsExpanded = function (isExpanded) {
        Array.prototype.forEach.call(rootNode.querySelectorAll(".page-toc-item.has-children"), function (item) {
          setTocItemExpanded(item, isExpanded);
        });
        updateBulkActionState();
      };
      var buildTocItem = function (entry, parentItem) {
        var li = document.createElement("li");
        li.className = "page-toc-item " + (entry.depth === 3 ? "toc-depth-3" : "toc-depth-2");
        var row = document.createElement("div");
        row.className = "page-toc-row";
        var hasChildren = Boolean(entry.children && entry.children.length);
        if (hasChildren) {
          li.classList.add("has-children");
          if (balancedSingleBranch) {
            li.classList.add("is-primary-group");
          }
          var toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "page-toc-toggle";
          toggle.setAttribute("data-page-toc-toggle", "");
          toggle.setAttribute("aria-label", "Collapse subsections under " + entry.text);
          row.appendChild(toggle);
        }
        var link = document.createElement("a");
        link.href = "#" + entry.id;
        var isCardLink = flatTocMode;
        var isFlatPrimaryLink = isCardLink && !parentItem;
        var isFlatNestedLink = isCardLink && Boolean(parentItem);
        if (isFlatPrimaryLink) {
          li.classList.add("is-flat-link");
        }
        if (isFlatNestedLink) {
          li.classList.add("is-flat-nested-link");
          if (hasChildren) {
            li.classList.add("is-flat-nested-branch");
          }
        }
        if (isCardLink) {
          var index = document.createElement("span");
          index.className = "page-toc-link-index";
          index.textContent = entry.indexLabel || "";
          index.setAttribute("aria-hidden", "true");
          link.appendChild(index);
        }
        var label = document.createElement("span");
        label.className = "page-toc-link-label";
        label.textContent = entry.text;
        link.appendChild(label);
        if (isCardLink) {
          var cue = document.createElement("span");
          cue.className = "page-toc-link-cue";
          cue.textContent = "Jump";
          cue.setAttribute("aria-hidden", "true");
          link.appendChild(cue);
        }
        row.appendChild(link);
        li.appendChild(row);
        linksById[entry.id] = {
          link: link,
          item: li,
          parentItem: parentItem || null
        };
        if (hasChildren) {
          var childList = document.createElement("ul");
          childList.className = "page-toc-children";
          if (balancedSingleBranch) {
            childList.classList.add("page-toc-children-balanced");
          }
          Array.prototype.forEach.call(entry.children, function (childEntry) {
            childList.appendChild(buildTocItem(childEntry, li));
          });
          li.appendChild(childList);
          setTocItemExpanded(li, true);
          var toggleButton = row.querySelector("[data-page-toc-toggle]");
          if (toggleButton) {
            toggleButton.addEventListener("click", function () {
              var shouldExpand = li.classList.contains("is-collapsed");
              setTocItemExpanded(li, shouldExpand);
              updateBulkActionState();
            });
          }
        }
        return li;
      };
      Array.prototype.forEach.call(tocEntries, function (entry) {
        tocList.appendChild(buildTocItem(entry, null));
      });
      rootNode.innerHTML = "";
      rootNode.classList.toggle("page-toc-balanced", balancedSingleBranch);
      rootNode.classList.toggle("page-toc-flat", flatTocMode);
      rootNode.setAttribute("data-page-toc-mode", pageTocMode);
      rootNode.appendChild(tocList);
      var controlsRoot = rootNode.parentElement || rootNode;
      var bulkActionTopThreshold = 10;
      var actionsRoots = controlsRoot.querySelectorAll(".page-toc-actions, .mobile-page-toc-actions");
      var expandAllButtons = controlsRoot.querySelectorAll("[data-page-toc-expand-all]");
      var collapseAllButtons = controlsRoot.querySelectorAll("[data-page-toc-collapse-all]");
      var showTopBulkActions = headingList.length > bulkActionTopThreshold;
      Array.prototype.forEach.call(actionsRoots, function (actionsRoot) {
        var isTopActions = actionsRoot && actionsRoot.hasAttribute("data-page-toc-actions-top");
        actionsRoot.hidden = !hasNestedGroups || (isTopActions && !showTopBulkActions);
      });
      Array.prototype.forEach.call(expandAllButtons, function (button) {
        button.hidden = !hasNestedGroups;
        button.disabled = !hasNestedGroups;
        button.setAttribute("aria-pressed", "false");
        button.onclick = function () {
          setAllTocItemsExpanded(true);
        };
      });
      Array.prototype.forEach.call(collapseAllButtons, function (button) {
        button.hidden = !hasNestedGroups;
        button.disabled = !hasNestedGroups;
        button.setAttribute("aria-pressed", "false");
        button.onclick = function () {
          setAllTocItemsExpanded(false);
        };
      });
      updateBulkActionState();
      linkGroups.push({
        rootNode: rootNode,
        linksById: linksById
      });
    });
    document.documentElement.setAttribute("data-page-toc-count", String(headingList.length));

    var scrollTocActiveLinkIntoView = function (rootNode, activeLink) {
      if (!rootNode || !activeLink || !rootNode.closest || !activeLink.getBoundingClientRect) {
        return;
      }
      var scrollContainer = rootNode.closest("[data-page-tools]")
        || rootNode.closest(".mobile-page-tools-body")
        || rootNode.closest("[data-mobile-page-tools]")
        || rootNode;
      if (!scrollContainer || !scrollContainer.getBoundingClientRect) {
        return;
      }
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 6) {
        return;
      }
      var containerRect = scrollContainer.getBoundingClientRect();
      var linkRect = activeLink.getBoundingClientRect();
      var pad = Math.max(18, Math.round(scrollContainer.clientHeight * 0.16));
      var upperBound = containerRect.top + pad;
      var lowerBound = containerRect.bottom - pad;
      if (linkRect.top >= upperBound && linkRect.bottom <= lowerBound) {
        return;
      }
      var targetTop = scrollContainer.scrollTop
        + (linkRect.top - containerRect.top)
        - Math.round(scrollContainer.clientHeight * 0.28);
      var maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      var nextTop = Math.max(0, Math.min(targetTop, maxTop));
      if (Math.abs(nextTop - scrollContainer.scrollTop) < 6) {
        return;
      }
      if (typeof scrollContainer.scrollTo === "function") {
        try {
          scrollContainer.scrollTo({ top: nextTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
          return;
        } catch (err) {
          // Fall through to direct assignment.
        }
      }
      scrollContainer.scrollTop = nextTop;
    };

    var setForcedActiveId = function (nextId) {
      var normalizedId = String(nextId || "").replace(/^#/, "").trim();
      if (!normalizedId) {
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return;
      }
      forcedActiveId = normalizedId;
      forcedActiveExpiresAt = Date.now() + 1600;
    };

    var resolveForcedActiveId = function () {
      if (!forcedActiveId) {
        return "";
      }
      var targetHeading = null;
      for (var i = 0; i < headingList.length; i += 1) {
        if (headingList[i].id === forcedActiveId) {
          targetHeading = headingList[i];
          break;
        }
      }
      if (!targetHeading) {
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return "";
      }
      if (Date.now() > forcedActiveExpiresAt) {
        var releaseMarker = window.scrollY + Math.max(120, getAnchorOffsetPixels() + 72);
        if (targetHeading.offsetTop > releaseMarker + 12) {
          return forcedActiveId;
        }
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return "";
      }
      return forcedActiveId;
    };

    var updateActiveLink = function () {
      var activeId = headingList[0] ? headingList[0].id : "";
      var marker = window.scrollY + Math.max(120, getAnchorOffsetPixels() + 48);
      for (var i = 0; i < headingList.length; i += 1) {
        if (headingList[i].offsetTop <= marker) {
          activeId = headingList[i].id;
        }
      }
      var forcedId = resolveForcedActiveId();
      if (forcedId) {
        activeId = forcedId;
      }
      var activeChanged = activeId !== lastActiveId;
      lastActiveId = activeId;
      Array.prototype.forEach.call(linkGroups, function (group) {
        var currentLink = null;
        Object.keys(group.linksById).forEach(function (id) {
          var record = group.linksById[id];
          var link = record.link;
          var isActive = id === activeId;
          link.classList.toggle("is-active", isActive);
          if (isActive) {
            currentLink = link;
            link.setAttribute("aria-current", "location");
          } else {
            link.removeAttribute("aria-current");
          }
        });
        if (activeChanged && currentLink) {
          scrollTocActiveLinkIntoView(group.rootNode, currentLink);
        }
      });
    };

    Array.prototype.forEach.call(linkGroups, function (group) {
      Object.keys(group.linksById).forEach(function (id) {
        var record = group.linksById[id];
        var link = record && record.link;
        if (!link || typeof link.addEventListener !== "function") {
          return;
        }
        link.addEventListener("click", function () {
          setForcedActiveId(id);
          window.setTimeout(updateActiveLink, 0);
          window.setTimeout(updateActiveLink, 220);
        });
      });
    });

    window.addEventListener("hashchange", function () {
      setForcedActiveId(window.location.hash);
      updateActiveLink();
      window.setTimeout(updateActiveLink, 220);
    });

    window.addEventListener("scroll", updateActiveLink, { passive: true });
    updateActiveLink();
    dispatchState(true);
  }

  function initBackToTop() {
    var buttons = document.querySelectorAll("[data-back-to-top], [data-mobile-back-to-top], [data-footer-back-to-top], [data-search-page-back-to-top]");
    if (!buttons.length) {
      return;
    }
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
    });
  }

  function createPageActionToast() {
    var toast = document.querySelector(".page-action-toast");
    if (toast) {
      return toast;
    }
    toast = document.createElement("div");
    toast.className = "page-action-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
  }

  var pageActionToastTimer = 0;

  function showPageActionToast(message) {
    if (!message || !document.body) {
      return;
    }
    var toast = createPageActionToast();
    if (!toast) {
      return;
    }
    toast.textContent = String(message);
    toast.classList.add("is-visible");
    window.clearTimeout(pageActionToastTimer);
    pageActionToastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function copyTextToClipboard(text) {
    var value = String(text || "");
    if (!value) {
      return Promise.reject(new Error("Nothing to copy."));
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "readonly");
      helper.style.position = "fixed";
      helper.style.top = "-9999px";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      try {
        var copied = document.execCommand("copy");
        document.body.removeChild(helper);
        if (copied) {
          resolve();
          return;
        }
      } catch (err) {
        document.body.removeChild(helper);
        reject(err);
        return;
      }
      reject(new Error("Copy command failed."));
    });
  }

  function createActionIcon(kind) {
    if (kind === "download") {
      return ""
        + "<svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\">"
        + "<path d=\"M12 3v11\"></path>"
        + "<path d=\"m7 11 5 5 5-5\"></path>"
        + "<path d=\"M5 20h14\"></path>"
        + "</svg>";
    }
    return ""
      + "<svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\">"
      + "<path d=\"M15 8a3 3 0 1 0-2.83-4\"></path>"
      + "<path d=\"M6 14a3 3 0 1 0 2.83 4\"></path>"
      + "<path d=\"M18 21a3 3 0 1 0 0-6\"></path>"
      + "<path d=\"m8.59 15.51 6.83 3.98\"></path>"
      + "<path d=\"m15.41 4.51-6.82 3.98\"></path>"
      + "</svg>";
  }

  function createActionButton(kind, label, options) {
    var settings = options || {};
    var button = document.createElement("button");
    button.type = "button";
    button.className = "page-action-button";
    if (settings.iconOnly) {
      button.classList.add("page-action-button-icon");
    }
    if (settings.title) {
      button.title = settings.title;
      button.setAttribute("aria-label", settings.title);
    } else if (label) {
      button.setAttribute("aria-label", label);
    }
    button.innerHTML = ""
      + "<span class=\"page-action-icon\" aria-hidden=\"true\">"
      + createActionIcon(kind)
      + "</span>"
      + "<span class=\"page-action-label\">"
      + String(label || "")
      + "</span>";
    return button;
  }

  function buildAssetSharePayload(assetData) {
    var fallbackTitle = String(document.title || "Infographic").trim();
    var label = String((assetData && assetData.label) || "").trim();
    return {
      title: label || fallbackTitle,
      text: label || fallbackTitle,
      url: String((assetData && assetData.url) || window.location.href)
    };
  }

  function getFileNameFromUrl(rawUrl, fallbackName) {
    var fallback = String(fallbackName || "download").trim() || "download";
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      var segments = parsed.pathname.split("/");
      var lastSegment = decodeURIComponent(String(segments.pop() || "").trim());
      return lastSegment || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function isDownloadableAssetUrl(rawUrl) {
    return /\.(?:svg|png|jpe?g|webp|gif|pdf)(?:[?#].*)?$/i.test(String(rawUrl || ""));
  }

  function resolvePrimaryAssetUrl(imageNode) {
    if (!imageNode) {
      return "";
    }
    var parentLink = imageNode.closest("a");
    var linkHref = parentLink ? String(parentLink.getAttribute("href") || "").trim() : "";
    if (linkHref && isDownloadableAssetUrl(linkHref)) {
      return new URL(linkHref, window.location.href).href;
    }
    var source = String(imageNode.currentSrc || imageNode.getAttribute("src") || "").trim();
    return source ? new URL(source, window.location.href).href : "";
  }

  function isPipelineActionableAssetUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      var pathname = decodeURIComponent(String(parsed.pathname || ""));
      if (pathname.indexOf("/assets/images/") === -1) {
        return false;
      }
      return /(?:-overview\.(?:svg|png|jpe?g|webp)|-image1\.(?:png|jpe?g|webp)|-Illustration-[123](?:-(?:dark|light))?\.(?:svg|png|jpe?g|webp))$/i.test(pathname);
    } catch (err) {
      return false;
    }
  }

  function getImageActionHost(imageNode, article) {
    if (!imageNode || !article) {
      return null;
    }
    var galleryItem = imageNode.closest(".svg-gallery-item");
    if (galleryItem && article.contains(galleryItem)) {
      return galleryItem;
    }
    var figure = imageNode.closest("figure");
    if (figure && article.contains(figure)) {
      return figure;
    }

    var parent = imageNode.parentElement;
    if (parent && parent.tagName === "A") {
      return parent;
    }
    return imageNode;
  }

  function ensureMediaActionHost(hostNode) {
    if (!hostNode) {
      return null;
    }
    if (hostNode.classList && hostNode.classList.contains("article-hero-media")) {
      return hostNode;
    }
    if (hostNode.classList && hostNode.classList.contains("page-media-action-shell")) {
      return hostNode;
    }
    var tagName = String(hostNode.tagName || "").toUpperCase();
    if (tagName === "IMG" || tagName === "A") {
      var wrapper = document.createElement("div");
      wrapper.className = "page-media-action-shell page-media-action-shell-direct";
      hostNode.parentNode.insertBefore(wrapper, hostNode);
      wrapper.appendChild(hostNode);
      return wrapper;
    }
    hostNode.classList.add("page-media-action-shell");
    return hostNode;
  }

  function triggerFileDownload(downloadUrl, filename) {
    if (!downloadUrl) {
      return false;
    }
    var link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename || "";
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  function getArticleAssets(article) {
    if (!article) {
      return [];
    }
    var assets = [];
    var images = article.querySelectorAll("img");
    Array.prototype.forEach.call(images, function (imageNode) {
      if (!imageNode) {
        return;
      }
      if (imageNode.closest(".related-reports, .image-lightbox, .topic-card-media")) {
        return;
      }
      var assetUrl = resolvePrimaryAssetUrl(imageNode);
      if (!assetUrl || !isPipelineActionableAssetUrl(assetUrl)) {
        return;
      }
      assets.push({
        image: imageNode,
        host: getImageActionHost(imageNode, article),
        url: assetUrl,
        downloadName: getFileNameFromUrl(assetUrl, "image"),
        label: String(imageNode.getAttribute("alt") || document.title || "Infographic").trim()
      });
    });
    return assets;
  }

  function getHeroPreviewAsset() {
    var heroMedia = document.querySelector(".article-hero-media");
    if (!heroMedia) {
      return null;
    }
    var heroImage = heroMedia.querySelector("img");
    if (!heroImage) {
      return null;
    }
    var assetUrl = resolvePrimaryAssetUrl(heroImage);
    if (!assetUrl || !isPipelineActionableAssetUrl(assetUrl)) {
      return null;
    }
    return {
      image: heroImage,
      host: heroMedia,
      url: assetUrl,
      downloadName: getFileNameFromUrl(assetUrl, "image"),
          label: String(heroImage.getAttribute("alt") || document.title || "Page preview").trim()
    };
  }

  function normalizeAssetComparisonUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      parsed.hash = "";
      parsed.search = "";
      return parsed.href;
    } catch (err) {
      return "";
    }
  }

  function markDuplicateMobileHeroPreview(article) {
    var heroPreviewAsset = getHeroPreviewAsset();
    if (!article || !heroPreviewAsset || !heroPreviewAsset.host) {
      return;
    }
    var heroUrl = normalizeAssetComparisonUrl(heroPreviewAsset.url);
    if (!heroUrl) {
      return;
    }
    var duplicateImage = null;
    var articleImages = article.querySelectorAll("img");
    Array.prototype.some.call(articleImages, function (imageNode) {
      var assetUrl = normalizeAssetComparisonUrl(resolvePrimaryAssetUrl(imageNode));
      if (assetUrl && assetUrl === heroUrl) {
        duplicateImage = imageNode;
        return true;
      }
      return false;
    });
    if (!duplicateImage) {
      return;
    }
    heroPreviewAsset.host.classList.add("article-hero-media-mobile-duplicate");
  }

  function isSvgAssetUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      return /\.svg$/i.test(String(parsed.pathname || ""));
    } catch (err) {
      return false;
    }
  }

  function getResolvedImageDisplayUrl(imageNode) {
    if (!imageNode) {
      return "";
    }
    var current = String(imageNode.currentSrc || imageNode.getAttribute("src") || "").trim();
    if (!current) {
      return "";
    }
    try {
      return new URL(current, window.location.href).href;
    } catch (err) {
      return "";
    }
  }

  function canExpandImageAsset(asset) {
    if (!asset || !asset.image) {
      return false;
    }
    var assetUrl = String(asset.url || "").trim();
    if (!assetUrl) {
      return false;
    }
    if (isSvgAssetUrl(assetUrl)) {
      return true;
    }
    var displayedUrl = getResolvedImageDisplayUrl(asset.image);
    if (displayedUrl && displayedUrl !== assetUrl) {
      return true;
    }
    var renderedWidth = 0;
    var renderedHeight = 0;
    if (asset.image.getBoundingClientRect) {
      var rect = asset.image.getBoundingClientRect();
      renderedWidth = Number(rect.width || 0);
      renderedHeight = Number(rect.height || 0);
    }
    var naturalWidth = Number(asset.image.naturalWidth || 0);
    var naturalHeight = Number(asset.image.naturalHeight || 0);
    if (!(naturalWidth > 0 && naturalHeight > 0 && renderedWidth > 0 && renderedHeight > 0)) {
      return false;
    }
    return naturalWidth > renderedWidth * 1.12 || naturalHeight > renderedHeight * 1.12;
  }

  function initPageActionButtons() {
    return;
  }

  function initImageLightbox() {
    var body = document.body;
    var article = document.querySelector(".article-body");
    if (!article || !body || body.classList.contains("page-home")) {
      return;
    }

    var actionableAssets = getArticleAssets(article);
    var heroPreviewAsset = getHeroPreviewAsset();
    markDuplicateMobileHeroPreview(article);
    if (heroPreviewAsset) {
      actionableAssets.unshift(heroPreviewAsset);
    }
    if (!actionableAssets.length) {
      return;
    }

    var overlay = document.createElement("div");
    overlay.className = "image-lightbox";
    overlay.setAttribute("hidden", "hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = ""
      + "<div class=\"image-lightbox-stage\" role=\"document\">"
      + "<button type=\"button\" class=\"image-lightbox-close\" aria-label=\"Close image viewer\">Close</button>"
      + "<img class=\"image-lightbox-image\" alt=\"\">"
      + "</div>"
      + "<p class=\"image-lightbox-caption\"></p>";
    document.body.appendChild(overlay);

    var closeButton = overlay.querySelector(".image-lightbox-close");
    var stageImage = overlay.querySelector(".image-lightbox-image");
    var stageCaption = overlay.querySelector(".image-lightbox-caption");
    var previousOverflow = "";

    function closeOverlay() {
      overlay.setAttribute("hidden", "hidden");
      overlay.setAttribute("aria-hidden", "true");
      stageImage.removeAttribute("src");
      stageImage.removeAttribute("data-theme-src-dark");
      stageImage.removeAttribute("data-theme-src-light");
      stageImage.alt = "";
      if (stageCaption) {
        stageCaption.textContent = "";
      }
      document.body.style.overflow = previousOverflow || "";
      previousOverflow = "";
    }

    function openOverlay(asset) {
      if (!asset || !asset.image) {
        return;
      }
      if (!overlay.hasAttribute("hidden")) {
        return;
      }
      var src = String(asset.url || "").trim();
      var darkSrc = String(asset.image.getAttribute("data-theme-src-dark") || "").trim();
      var lightSrc = String(asset.image.getAttribute("data-theme-src-light") || "").trim();
      if (darkSrc && lightSrc) {
        src = document.documentElement.getAttribute("data-theme") === "dark" ? darkSrc : lightSrc;
      }
      if (!src) {
        return;
      }
      var alt = String(asset.label || asset.image.getAttribute("alt") || "").trim();
      previousOverflow = document.body.style.overflow || "";
      stageImage.src = src;
      if (darkSrc && lightSrc) {
        stageImage.setAttribute("data-theme-src-dark", darkSrc);
        stageImage.setAttribute("data-theme-src-light", lightSrc);
      } else {
        stageImage.removeAttribute("data-theme-src-dark");
        stageImage.removeAttribute("data-theme-src-light");
      }
      stageImage.alt = alt;
      if (stageCaption) {
        stageCaption.textContent = alt;
      }
      overlay.removeAttribute("hidden");
      overlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function attachImageHandler(asset) {
      if (!asset || !asset.image) {
        return;
      }
      var imageNode = asset.image;
      if (imageNode.classList.contains("zoomable-image")) {
        return;
      }
      var hostNode = ensureMediaActionHost(asset.host || getImageActionHost(imageNode, article));
        if (hostNode && hostNode.classList) {
          hostNode.classList.add("has-lightbox-affordance");
          if (!hostNode.querySelector("[data-lightbox-affordance]")) {
            var affordance = document.createElement("span");
            affordance.className = "image-lightbox-affordance";
            affordance.setAttribute("data-lightbox-affordance", "true");
            affordance.innerHTML = '<span class="image-lightbox-affordance-icon" aria-hidden="true">+</span><span class="image-lightbox-affordance-label">View Large</span>';
            hostNode.appendChild(affordance);
          }
        }
      imageNode.classList.add("zoomable-image");
      imageNode.setAttribute("tabindex", "0");
      imageNode.setAttribute("role", "button");
      if (!imageNode.getAttribute("aria-label")) {
        var altText = String(imageNode.getAttribute("alt") || "").trim();
        imageNode.setAttribute("aria-label", altText ? ("Expand image: " + altText) : "Expand image");
      }

      imageNode.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openOverlay(asset);
      });

      imageNode.addEventListener("keydown", function (event) {
        var key = String(event.key || "");
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openOverlay(asset);
        }
      });

      var parentLink = imageNode.closest("a");
      if (parentLink) {
        parentLink.addEventListener("click", function (event) {
          if (event.target === imageNode) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openOverlay(asset);
        });
      }
    }

    Array.prototype.forEach.call(actionableAssets, function (asset) {
      if (!asset || !asset.image) {
        return;
      }
      var evaluateExpandability = function () {
        if (canExpandImageAsset(asset)) {
          attachImageHandler(asset);
        }
      };
      if (asset.image.complete) {
        evaluateExpandability();
        return;
      }
      asset.image.addEventListener("load", evaluateExpandability, { once: true });
    });

    if (closeButton) {
      closeButton.addEventListener("click", function () {
        closeOverlay();
      });
    }

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hasAttribute("hidden")) {
        closeOverlay();
      }
    });
  }

  function initScrollAnimations() {
    if (prefersReducedMotion()) {
      return;
    }
    var animElements = document.querySelectorAll(
      ".topic-card, .home-featured, .home-hero, .home-hierarchy-band, .home-detailed-catalog, .article-hero, .article-branch-map, .article-body > figure, .article-body > .page-media-action-shell-direct, .article-body > .youtube-embed-container, .article-body > .svg-gallery, .site-footer"
    );
    var revealFallback = function() {
      for (var i = 0; i < animElements.length; i++) {
        animElements[i].classList.add("is-visible");
      }
    };
    if (!animElements.length || !("IntersectionObserver" in window)) {
      revealFallback();
      return;
    }
    var revealFailsafeTimer = window.setTimeout(revealFallback, 1400);
    var observer = new IntersectionObserver(function(entries, obs) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
      if (document.querySelectorAll(".animate-on-scroll:not(.is-visible)").length === 0) {
        window.clearTimeout(revealFailsafeTimer);
      }
    }, {
      root: null,
      rootMargin: "0px",
      threshold: 0
    });

    var activeCount = 0;
    Array.prototype.forEach.call(animElements, function(el, index) {
      el.style.setProperty("--reveal-delay", String(Math.min(index * 36, 220)) + "ms");
      var rect = el.getBoundingClientRect();
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (rect.top < viewportHeight && rect.bottom > 0) {
        el.classList.add("animate-on-scroll");
        el.classList.add("is-visible");
      } else {
        el.classList.add("animate-on-scroll");
        observer.observe(el);
        activeCount++;
      }
    });
    if (activeCount === 0) {
      window.clearTimeout(revealFailsafeTimer);
    }
  }

  function initUapWorldMap() {
    var roots = document.querySelectorAll('[data-interactive-map], [data-uap-world-map]');
    if (!roots.length) {
      return;
    }
    Array.prototype.forEach.call(roots, function(root) {
    if (root.__interactiveMapInitialized) {
      return;
    }
    root.__interactiveMapInitialized = true;
    var canvas = root.querySelector('[data-interactive-map-canvas], [data-uap-world-map-canvas]');
    var preview = root.querySelector('[data-interactive-map-preview], [data-uap-world-map-preview]');
    var mapSrc = root.getAttribute('data-map-src');
    var dataSrc = root.getAttribute('data-map-data-src');
    var itemType = root.getAttribute('data-map-item-type') || 'country';
    var itemTypeTitle = itemType.charAt(0).toUpperCase() + itemType.slice(1);
    var mapLabel = root.getAttribute('data-map-label') || 'Interactive map';
    var fallbackSummary = root.getAttribute('data-map-fallback-summary') || 'Open this item from the map.';
    var previewPreloadLimit = root.getAttribute('data-map-preview-preload') || 'all';
    var mapFitMode = root.getAttribute('data-map-fit') || '';
    var mapLayout = String(root.getAttribute('data-map-layout') || '').trim().toLowerCase();
    var initialItemId = String(root.getAttribute('data-map-initial-item') || '').trim().toUpperCase();
    if (!canvas || !mapSrc || !dataSrc) {
      return;
    }
    var loadText = function(url) {
      if (typeof fetch === 'function') {
        return fetch(url, { credentials: 'same-origin' }).then(function(res) {
          if (!res.ok) {
            throw new Error('Failed to load ' + url);
          }
          return res.text();
        });
      }
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText);
          } else {
            reject(new Error('Failed to load ' + url));
          }
        };
        xhr.onerror = function() { reject(new Error('Failed to load ' + url)); };
        xhr.send();
      });
    };
    var loadTextWithRetry = function(url) {
      return loadText(url).catch(function(firstError) {
        return new Promise(function(resolve) {
          window.setTimeout(resolve, 180);
        }).then(function() {
          return loadText(url);
        }).catch(function() {
          throw firstError;
        });
      });
    };

    var siteAssetBase = (function() {
      var source = String(mapSrc || dataSrc || '').trim();
      try {
        var sourceUrl = new URL(source || '.', document.baseURI);
        var path = sourceUrl.pathname || '';
        var marker = path.indexOf('/assets/');
        if (marker !== -1) {
          sourceUrl.pathname = path.slice(0, marker + 1);
          sourceUrl.search = '';
          sourceUrl.hash = '';
          return sourceUrl.href;
        }
      } catch (err) {
        return document.baseURI;
      }
      return document.baseURI;
    })();

    var resolveSiteAssetUrl = function(url) {
      var value = String(url || '').trim();
      if (!value) {
        return '';
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
        return value;
      }
      try {
        return new URL(value.replace(/^\/+/, ''), siteAssetBase).href;
      } catch (err) {
        return value;
      }
    };
    var cp1252ReverseMap = {
      0x20AC: 0x80,
      0x201A: 0x82,
      0x0192: 0x83,
      0x201E: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02C6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8A,
      0x2039: 0x8B,
      0x0152: 0x8C,
      0x017D: 0x8E,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201C: 0x93,
      0x201D: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02DC: 0x98,
      0x2122: 0x99,
      0x0161: 0x9A,
      0x203A: 0x9B,
      0x0153: 0x9C,
      0x017E: 0x9E,
      0x0178: 0x9F
    };
    var repairMojibakeText = function(value) {
      var text = String(value || '');
      if (!/[ÃÂâ�]/.test(text)) {
        return text;
      }
      try {
        if (typeof TextDecoder === 'function') {
          var bytes = [];
          for (var i = 0; i < text.length; i += 1) {
            var code = text.charCodeAt(i);
            if (code <= 0xFF) {
              bytes.push(code);
            } else if (cp1252ReverseMap[code]) {
              bytes.push(cp1252ReverseMap[code]);
            } else {
              return text;
            }
          }
          var decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
          if (decoded && !/[ÃÂâ�]\uFFFD?/.test(decoded)) {
            return decoded;
          }
        }
      } catch (err) {}
      return text
        .replace(/\u00e2\u20ac\u2122/g, '\u2019')
        .replace(/\u00e2\u20ac\u0153/g, '\u201c')
        .replace(/\u00e2\u20ac\u009d/g, '\u201d')
        .replace(/\u00e2\u20ac\u009d/g, '\u201d')
        .replace(/\u00e2\u20ac\u2018/g, '-')
        .replace(/\u00e2\u20ac\u2011/g, '-')
        .replace(/\u00e2\u20ac\u201d/g, '\u2014')
        .replace(/\u00e2\u20ac\u201c/g, '\u2013')
        .replace(/\u00e2\u20ac\u00a6/g, '\u2026')
        .replace(/\u00c3\u00bc/g, '\u00fc')
        .replace(/\u00c3\u00b4/g, '\u00f4')
        .replace(/\u00c3\u00a9/g, '\u00e9')
        .replace(/\u00c3\u00a3/g, '\u00e3');
    };
    var normaliseMapItemText = function(item) {
      if (!item || typeof item !== 'object') {
        return item;
      }
      Object.keys(item).forEach(function(key) {
        if (typeof item[key] === 'string') {
          item[key] = repairMojibakeText(item[key]);
        }
      });
      return item;
    };
    var getItemLabel = function(item) {
      return item && (item.displayLabel || item.label || item.country || item.mapName || itemTypeTitle);
    };
    var getItemTitle = function(item) {
      return item && (item.displayTitle || item.title || item.displayLabel || item.label || item.country || itemTypeTitle);
    };
    var normalisePreviewHeadingText = function(value) {
      return String(value || '').toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    };
    var shouldShowPreviewKicker = function(label, title) {
      var labelKey = normalisePreviewHeadingText(label);
      var titleKey = normalisePreviewHeadingText(title);
      if (!labelKey || !titleKey || labelKey === titleKey) {
        return false;
      }
      if (labelKey.length > 8 && titleKey.indexOf(labelKey) !== -1) {
        return false;
      }
      if (titleKey.length > 8 && labelKey.indexOf(titleKey) !== -1) {
        return false;
      }
      return true;
    };
    var getItemSummary = function(item) {
      return item && (item.displaySummary || item.summary || fallbackSummary);
    };
    var getItemCode = function(item) {
      if (item && item.hideCode) {
        return '';
      }
      return item && (item.displayCode || item.code || item.iso || item.id || '');
    };
    var getItemRegionLabel = function(item) {
      if (!item) {
        return '';
      }
      return item.displayRegion || item.regionLabel || item.region || item.subregion || '';
    };
    var normaliseRegionKey = function(value) {
      return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    };
    var getItemRegionKey = function(item) {
      if (!item) {
        return '';
      }
      return normaliseRegionKey(item.regionKey || item.region || item.displayRegion || item.regionLabel || item.subregion);
    };
    var getItemCountLabel = function(item) {
      if (!item) {
        return '';
      }
      var rawCount = item.displayCount || item.countLabel || item.pageCount || item.count || item.pages || item.total;
      if (rawCount === null || typeof rawCount === 'undefined' || rawCount === '') {
        return '';
      }
      if (typeof rawCount === 'string' && /\D/.test(rawCount)) {
        return rawCount;
      }
      var count = Number(rawCount);
      if (!isFinite(count) || count < 1) {
        return '';
      }
      return String(count) + (count === 1 ? ' page' : ' pages');
    };
    var getPreviewMetaHtml = function(item) {
      var chips = [];
      var code = String(getItemCode(item) || '').trim();
      var region = String(getItemRegionLabel(item) || '').trim();
      var count = String(getItemCountLabel(item) || '').trim();
      if (code) {
        chips.push('<span class="interactive-map-preview-chip uap-world-map-preview-chip">' + escapeHtml(code) + '</span>');
      }
      if (region) {
        var regionKey = getItemRegionKey(item);
        if (regionKey) {
          chips.push(
            '<button type="button" class="interactive-map-preview-chip uap-world-map-preview-chip interactive-map-preview-chip-action uap-world-map-preview-chip-action" '
            + 'data-interactive-map-continent-focus="' + escapeHtml(regionKey) + '" '
            + 'data-uap-world-map-region-focus="' + escapeHtml(regionKey) + '" '
            + 'aria-label="Focus map on ' + escapeHtml(region) + '">' + escapeHtml(region) + '</button>'
          );
        } else {
          chips.push('<span class="interactive-map-preview-chip uap-world-map-preview-chip">' + escapeHtml(region) + '</span>');
        }
      }
      if (count) {
        chips.push('<span class="interactive-map-preview-count uap-world-map-preview-count">' + escapeHtml(count) + '</span>');
      }
      return chips.length ? '<span class="interactive-map-preview-meta uap-world-map-preview-meta">' + chips.join('') + '</span>' : '';
    };
    var warmedPreviewImages = {};
    var warmPreviewImage = function(item) {
      var imageUrl = item && resolveSiteAssetUrl(item.image);
      if (!imageUrl || warmedPreviewImages[imageUrl]) {
        return;
      }
      warmedPreviewImages[imageUrl] = true;
      var image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = imageUrl;
    };
    var preloadPreviewImages = function(items) {
      if (!items || !items.length) {
        return;
      }
      var limit = String(previewPreloadLimit || '').toLowerCase() === 'all'
        ? items.length
        : Math.max(0, parseInt(previewPreloadLimit, 10) || 0);
      var queue = items.filter(function(item) { return item && item.image; }).slice(0, limit);
      if (!queue.length) {
        return;
      }
      var preloadNext = function() {
        var started = 0;
        while (queue.length && started < 4) {
          warmPreviewImage(queue.shift());
          started += 1;
        }
        if (!queue.length) {
          return;
        }
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(preloadNext, { timeout: 1800 });
        } else {
          window.setTimeout(preloadNext, 140);
        }
      };
      window.setTimeout(preloadNext, 450);
    };
    var bindPreviewImageFallback = function() {
      if (!preview) {
        return;
      }
      var image = preview.querySelector('img');
      if (!image) {
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.add('is-image-missing');
        return;
      }
      var removeBrokenImage = function() {
        if (image.parentNode === preview) {
          preview.removeChild(image);
        }
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.add('is-image-missing');
      };
      image.addEventListener('load', function() {
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.remove('is-image-missing');
      }, { once: true });
      image.addEventListener('error', removeBrokenImage, { once: true });
      if (image.complete && !image.naturalWidth) {
        removeBrokenImage();
      } else if (!image.complete) {
        preview.classList.add('is-image-loading');
        preview.setAttribute('aria-busy', 'true');
      }
    };
    bindPreviewImageFallback();

    var inlineDataNode = root.querySelector('[data-interactive-map-data], [data-uap-world-map-data]');
    var inlineSvg = canvas.querySelector('svg');
    var setMapState = function(state, message) {
      root.setAttribute('data-map-state', state);
      var currentStatus = canvas.querySelector('.interactive-map-status, .uap-world-map-status');
      if (!message) {
        if (currentStatus && currentStatus.parentNode === canvas) {
          canvas.removeChild(currentStatus);
        }
        return;
      }
      if (!currentStatus) {
        currentStatus = document.createElement('span');
        currentStatus.className = 'interactive-map-status uap-world-map-status';
        currentStatus.setAttribute('role', 'status');
        currentStatus.setAttribute('aria-live', 'polite');
        canvas.appendChild(currentStatus);
      }
      currentStatus.textContent = message;
    };
    if (inlineSvg) {
      setMapState('initializing', 'Preparing map…');
    } else {
      setMapState('loading', 'Loading map…');
    }
    var countryAliases = {
      UK: 'GB',
      EL: 'GR'
    };
    var timezoneCountryRules = [
      [/^Europe\/London$/i, 'GB'],
      [/^Europe\/Dublin$/i, 'IE'],
      [/^America\/(New_York|Detroit|Kentucky|Indiana|Chicago|North_Dakota|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Adak|Honolulu)$/i, 'US'],
      [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Regina|Halifax|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit)$/i, 'CA'],
      [/^Australia\//i, 'AU'],
      [/^Pacific\/(Auckland|Chatham)$/i, 'NZ'],
      [/^Europe\/Paris$/i, 'FR'],
      [/^Europe\/Berlin$/i, 'DE'],
      [/^Europe\/Madrid$/i, 'ES'],
      [/^Europe\/Rome$/i, 'IT'],
      [/^Europe\/Amsterdam$/i, 'NL'],
      [/^Europe\/Brussels$/i, 'BE'],
      [/^Europe\/Zurich$/i, 'CH'],
      [/^Europe\/Stockholm$/i, 'SE'],
      [/^Europe\/Oslo$/i, 'NO'],
      [/^Europe\/Copenhagen$/i, 'DK'],
      [/^Europe\/Helsinki$/i, 'FI'],
      [/^Europe\/Warsaw$/i, 'PL'],
      [/^Europe\/Prague$/i, 'CZ'],
      [/^Europe\/Vienna$/i, 'AT'],
      [/^Europe\/Lisbon$/i, 'PT'],
      [/^America\/Mexico_City$/i, 'MX'],
      [/^America\/Sao_Paulo$/i, 'BR'],
      [/^America\/Buenos_Aires$/i, 'AR'],
      [/^America\/Santiago$/i, 'CL'],
      [/^Asia\/(Tokyo)$/i, 'JP'],
      [/^Asia\/(Seoul)$/i, 'KR'],
      [/^Asia\/(Shanghai|Hong_Kong)$/i, 'CN'],
      [/^Asia\/(Kolkata|Calcutta)$/i, 'IN'],
      [/^Asia\/Singapore$/i, 'SG'],
      [/^Asia\/Dubai$/i, 'AE'],
      [/^Africa\/Johannesburg$/i, 'ZA'],
      [/^Africa\/Lagos$/i, 'NG']
    ];
    var normaliseCountryIso = function(value) {
      var iso = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (countryAliases[iso]) {
        iso = countryAliases[iso];
      }
      return iso.length === 2 ? iso : '';
    };
    var inferCountryFromTimezone = function(availableCountries) {
      var timezone = '';
      try {
        timezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch (err) {}
      if (!timezone) {
        return '';
      }
      for (var i = 0; i < timezoneCountryRules.length; i += 1) {
        var rule = timezoneCountryRules[i];
        if (rule[0].test(timezone) && availableCountries[rule[1]]) {
          return rule[1];
        }
      }
      return '';
    };
    var inferCountryFromLocale = function(availableCountries) {
      var languages = [];
      try {
        if (navigator.languages && navigator.languages.length) {
          languages = Array.prototype.slice.call(navigator.languages);
        } else if (navigator.language) {
          languages = [navigator.language];
        }
      } catch (err) {}
      for (var i = 0; i < languages.length; i += 1) {
        var parts = String(languages[i] || '').replace(/_/g, '-').split('-');
        if (parts.length < 2) {
          continue;
        }
        var iso = normaliseCountryIso(parts[parts.length - 1]);
        if (iso && availableCountries[iso]) {
          return iso;
        }
      }
      return '';
    };
    var guessVisitorCountryIso = function(availableCountries) {
      return inferCountryFromTimezone(availableCountries) || inferCountryFromLocale(availableCountries) || '';
    };
    var mapDataUnavailable = false;
    var dataPromise = inlineDataNode && inlineSvg
      ? Promise.resolve([null, JSON.parse(inlineDataNode.textContent || '{}'), true])
      : Promise.all([
        loadTextWithRetry(mapSrc).then(function(svgText) {
          // Insert the base map as soon as it arrives. A slow or temporarily
          // unavailable metadata request must not leave the mobile canvas blank.
          canvas.innerHTML = svgText;
          return svgText;
        }),
        loadTextWithRetry(dataSrc).then(function(text) {
          return JSON.parse(text);
        }).catch(function() {
          mapDataUnavailable = true;
          return { items: [], countries: [] };
        }),
        Promise.resolve(false)
      ]);

    dataPromise.then(function(results) {
      var svgText = results[0];
      var mapData = results[1] || {};
      var isInline = !!results[2];
      var byIso = {};
      (mapData.items || mapData.countries || []).forEach(function(item) {
        item = normaliseMapItemText(item);
        var id = item && (item.id || item.iso);
        if (id) {
          byIso[String(id).toUpperCase()] = item;
        }
      });
      preloadPreviewImages(Object.keys(byIso).map(function(iso) { return byIso[iso]; }));
      if (!isInline) {
        // The SVG was inserted as soon as it loaded so it remained visible
        // while the metadata request completed.
      }
      var svg = canvas.querySelector('svg');
      if (!svg) {
        throw new Error('Map SVG did not contain an svg element.');
      }
      var contextShapeMapLayouts = {
        'canada': true,
        'australia': true,
        'france-departments': true,
        'spain-provinces': true,
        'italy-regions': true,
        'germany-states': true
      };
      root.addEventListener('click', function(event) {
        event.stopPropagation();
      });
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', mapLabel);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      var zoomState = { scale: 1, x: 0, y: 0 };
      var minZoom = 1;
      var maxZoom = 6;
      var panButtons = {};
      var getPanLimits = function() {
        var rect = canvas.getBoundingClientRect();
        var width = rect.width || 0;
        var height = rect.height || 0;
        return {
          maxX: Math.max(0, width * (zoomState.scale - 1)),
          maxY: Math.max(0, height * (zoomState.scale - 1))
        };
      };
      var setPanButtonState = function(direction, isAvailable) {
        var button = panButtons[direction];
        if (!button) {
          return;
        }
        button.hidden = !isAvailable;
        button.disabled = !isAvailable;
        button.classList.toggle('is-available', Boolean(isAvailable));
        button.setAttribute('aria-hidden', isAvailable ? 'false' : 'true');
        button.setAttribute('tabindex', isAvailable ? '0' : '-1');
      };
      var updatePanControls = function() {
        var limits = getPanLimits();
        var isZoomed = zoomState.scale > 1.01;
        var tolerance = 1;
        setPanButtonState('left', isZoomed && zoomState.x < -tolerance);
        setPanButtonState('right', isZoomed && zoomState.x > -limits.maxX + tolerance);
        setPanButtonState('up', isZoomed && zoomState.y < -tolerance);
        setPanButtonState('down', isZoomed && zoomState.y > -limits.maxY + tolerance);
      };
      var applyZoom = function() {
        svg.style.transform = 'translate(' + zoomState.x + 'px, ' + zoomState.y + 'px) scale(' + zoomState.scale + ')';
        svg.style.transformOrigin = '0 0';
        root.setAttribute('data-interactive-map-zoom', zoomState.scale > 1.01 ? 'zoomed' : 'default');
        root.setAttribute('data-uap-world-map-zoom', zoomState.scale > 1.01 ? 'zoomed' : 'default');
        updatePanControls();
      };
      var clampPan = function() {
        var limits = getPanLimits();
        zoomState.x = Math.min(0, Math.max(-limits.maxX, zoomState.x));
        zoomState.y = Math.min(0, Math.max(-limits.maxY, zoomState.y));
      };
      var setZoom = function(nextScale, originX, originY) {
        var rect = canvas.getBoundingClientRect();
        var oldScale = zoomState.scale;
        var scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        var localX = typeof originX === 'number' ? originX : rect.width / 2;
        var localY = typeof originY === 'number' ? originY : rect.height / 2;
        if (Math.abs(scale - oldScale) < 0.001) {
          return;
        }
        zoomState.x = localX - ((localX - zoomState.x) * scale / oldScale);
        zoomState.y = localY - ((localY - zoomState.y) * scale / oldScale);
        zoomState.scale = scale;
        clampPan();
        applyZoom();
      };
      var resetZoom = function() {
        zoomState = { scale: 1, x: 0, y: 0 };
        applyZoom();
      };
      var panBy = function(deltaX, deltaY) {
        if (zoomState.scale <= 1.01) {
          return;
        }
        zoomState.x += deltaX;
        zoomState.y += deltaY;
        clampPan();
        applyZoom();
      };
      var zoomToNode = function(node, nextScale) {
        var canvasRect = canvas.getBoundingClientRect();
        var nodeRect = node.getBoundingClientRect();
        if (!canvasRect.width || !canvasRect.height || !nodeRect.width || !nodeRect.height) {
          return;
        }
        var screenX = nodeRect.left - canvasRect.left + nodeRect.width / 2;
        var screenY = nodeRect.top - canvasRect.top + nodeRect.height / 2;
        var worldX = (screenX - zoomState.x) / zoomState.scale;
        var worldY = (screenY - zoomState.y) / zoomState.scale;
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        zoomState.x = canvasRect.width / 2 - worldX * zoomState.scale;
        zoomState.y = canvasRect.height / 2 - worldY * zoomState.scale;
        clampPan();
        applyZoom();
      };
      var controls = document.createElement('div');
      controls.className = 'interactive-map-controls uap-world-map-controls';
      controls.setAttribute('aria-label', 'Map zoom controls');
      controls.setAttribute('role', 'group');
      var panControls = document.createElement('div');
      panControls.className = 'interactive-map-pan-controls uap-world-map-pan-controls';
      panControls.setAttribute('aria-label', 'Map pan controls');
      panControls.setAttribute('role', 'group');
      var makeZoomButton = function(label, ariaLabel, handler) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'interactive-map-control uap-world-map-control';
        button.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
        button.addEventListener('click', function(event) {
          event.preventDefault();
          handler();
        });
        return button;
      };
      var makePanButton = function(direction, label, ariaLabel, handler) {
        var button = makeZoomButton(label, ariaLabel, handler);
        button.className += ' interactive-map-pan-control uap-world-map-pan-control interactive-map-pan-control-' + direction;
        button.hidden = true;
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        panButtons[direction] = button;
        return button;
      };
      controls.appendChild(makeZoomButton('+', 'Zoom in', function() { setZoom(zoomState.scale * 1.35); }));
      controls.appendChild(makeZoomButton('-', 'Zoom out', function() { setZoom(zoomState.scale / 1.35); }));
      controls.appendChild(makeZoomButton('Reset', 'Reset map zoom', resetZoom));
      panControls.appendChild(makePanButton('left', '\u2190', 'Move map view left', function() {
        panBy(Math.max(80, canvas.getBoundingClientRect().width * 0.18), 0);
      }));
      panControls.appendChild(makePanButton('up', '\u2191', 'Move map view up', function() {
        panBy(0, Math.max(70, canvas.getBoundingClientRect().height * 0.18));
      }));
      panControls.appendChild(makePanButton('down', '\u2193', 'Move map view down', function() {
        panBy(0, -Math.max(70, canvas.getBoundingClientRect().height * 0.18));
      }));
      panControls.appendChild(makePanButton('right', '\u2192', 'Move map view right', function() {
        panBy(-Math.max(80, canvas.getBoundingClientRect().width * 0.18), 0);
      }));
      canvas.appendChild(controls);
      canvas.appendChild(panControls);
      canvas.addEventListener('wheel', function(event) {
        event.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
        setZoom(zoomState.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });
      window.addEventListener('resize', function() {
        clampPan();
        applyZoom();
      });
      var dragState = null;
      var activePointers = {};
      var pinchState = null;
      var lastPointerCountryIso = '';
      var lastPointerMoved = false;
      var getActivePointerList = function() {
        return Object.keys(activePointers).map(function(pointerId) {
          return activePointers[pointerId];
        }).filter(Boolean);
      };
      var getPointerDistance = function(first, second) {
        var dx = Number(second.clientX || 0) - Number(first.clientX || 0);
        var dy = Number(second.clientY || 0) - Number(first.clientY || 0);
        return Math.sqrt(dx * dx + dy * dy);
      };
      var getPointerCenter = function(first, second) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: ((Number(first.clientX || 0) + Number(second.clientX || 0)) / 2) - rect.left,
          y: ((Number(first.clientY || 0) + Number(second.clientY || 0)) / 2) - rect.top
        };
      };
      var beginPinchZoom = function(pointerList) {
        if (!pointerList || pointerList.length < 2) {
          pinchState = null;
          return;
        }
        var first = pointerList[0];
        var second = pointerList[1];
        var distance = getPointerDistance(first, second);
        if (!(distance > 0)) {
          pinchState = null;
          return;
        }
        var center = getPointerCenter(first, second);
        pinchState = {
          pointerIds: [String(first.pointerId), String(second.pointerId)],
          distance: distance,
          scale: zoomState.scale,
          worldX: (center.x - zoomState.x) / zoomState.scale,
          worldY: (center.y - zoomState.y) / zoomState.scale
        };
        dragState = null;
        canvas.classList.add('is-panning');
      };
      var updatePinchZoom = function() {
        if (!pinchState) {
          return false;
        }
        var first = activePointers[pinchState.pointerIds[0]];
        var second = activePointers[pinchState.pointerIds[1]];
        if (!first || !second) {
          pinchState = null;
          return false;
        }
        var distance = getPointerDistance(first, second);
        if (!(distance > 0)) {
          return false;
        }
        var center = getPointerCenter(first, second);
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, pinchState.scale * (distance / pinchState.distance)));
        zoomState.x = center.x - pinchState.worldX * zoomState.scale;
        zoomState.y = center.y - pinchState.worldY * zoomState.scale;
        lastPointerMoved = true;
        lastPointerCountryIso = '';
        clampPan();
        applyZoom();
        return true;
      };
      var clearPointer = function(event) {
        if (!event || typeof event.pointerId === 'undefined') {
          return;
        }
        delete activePointers[String(event.pointerId)];
      };
      var capturePointer = function(pointerId) {
        try {
          canvas.setPointerCapture(pointerId);
        } catch (err) {}
      };
      var navigateToItem = function(item) {
        if (item && item.url) {
          window.location.href = resolveSiteAssetUrl(item.url);
        }
      };
      canvas.addEventListener('pointerdown', function(event) {
        if (event.target && event.target.closest && event.target.closest('.interactive-map-controls, .uap-world-map-controls, .interactive-map-pan-controls, .uap-world-map-pan-controls')) {
          return;
        }
        activePointers[String(event.pointerId)] = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType || ''
        };
        var pointerList = getActivePointerList();
        if (pointerList.length >= 2) {
          event.preventDefault();
          pointerList.forEach(function(pointerInfo) {
            capturePointer(pointerInfo.pointerId);
          });
          lastPointerMoved = true;
          lastPointerCountryIso = '';
          beginPinchZoom(pointerList);
          return;
        }
        lastPointerMoved = false;
        lastPointerCountryIso = '';
        if (event.target && event.target.closest) {
          var countryTarget = event.target.closest('[data-interactive-map-item], [data-uap-country]');
          if (countryTarget) {
            lastPointerCountryIso = String(countryTarget.getAttribute('data-interactive-map-item') || countryTarget.getAttribute('data-uap-country') || '').toUpperCase();
          }
        }
        if (zoomState.scale <= 1.01) {
          return;
        }
        if (event.pointerType === 'touch') {
          return;
        }
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: zoomState.x,
          originY: zoomState.y
        };
        capturePointer(event.pointerId);
        canvas.classList.add('is-panning');
      });
      canvas.addEventListener('pointermove', function(event) {
        if (activePointers[String(event.pointerId)]) {
          activePointers[String(event.pointerId)].clientX = event.clientX;
          activePointers[String(event.pointerId)].clientY = event.clientY;
        }
        if (pinchState) {
          event.preventDefault();
          updatePinchZoom();
          return;
        }
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        if (Math.abs(event.clientX - dragState.startX) > 5 || Math.abs(event.clientY - dragState.startY) > 5) {
          lastPointerMoved = true;
        }
        zoomState.x = dragState.originX + event.clientX - dragState.startX;
        zoomState.y = dragState.originY + event.clientY - dragState.startY;
        clampPan();
        applyZoom();
      });
      var endPan = function(event) {
        clearPointer(event);
        if (pinchState) {
          if (getActivePointerList().length >= 2) {
            beginPinchZoom(getActivePointerList());
          } else {
            pinchState = null;
            dragState = null;
            canvas.classList.remove('is-panning');
          }
          return;
        }
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        dragState = null;
        canvas.classList.remove('is-panning');
      };
      canvas.addEventListener('pointerup', endPan);
      canvas.addEventListener('pointercancel', endPan);
      canvas.addEventListener('pointerleave', function(event) {
        if (event.pointerType === 'touch') {
          endPan(event);
        }
      });
      canvas.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (lastPointerMoved) {
          lastPointerMoved = false;
          lastPointerCountryIso = '';
          return;
        }
        var countryNode = event.target && event.target.closest ? event.target.closest('[data-interactive-map-item], [data-uap-country]') : null;
        var iso = countryNode
          ? String(countryNode.getAttribute('data-interactive-map-item') || countryNode.getAttribute('data-uap-country') || '').toUpperCase()
          : lastPointerCountryIso;
        lastPointerCountryIso = '';
        if (iso && byIso[iso]) {
          navigateToItem(byIso[iso]);
        }
      });
      applyZoom();
      var active = null;
      var activeItem = null;
      var nodesByIso = {};
      var fitSvgToLinkedBounds = function() {
        if (mapFitMode !== 'linked-bounds' || !svg.createSVGPoint) {
          return;
        }
        var matrix = null;
        try {
          matrix = svg.getScreenCTM();
        } catch (err) {
          matrix = null;
        }
        if (!matrix) {
          return;
        }
        var inverse = matrix.inverse();
        var point = svg.createSVGPoint();
        var bounds = null;
        var addClientPoint = function(clientX, clientY) {
          point.x = clientX;
          point.y = clientY;
          var svgPoint = point.matrixTransform(inverse);
          if (!bounds) {
            bounds = {
              left: svgPoint.x,
              top: svgPoint.y,
              right: svgPoint.x,
              bottom: svgPoint.y
            };
            return;
          }
          bounds.left = Math.min(bounds.left, svgPoint.x);
          bounds.top = Math.min(bounds.top, svgPoint.y);
          bounds.right = Math.max(bounds.right, svgPoint.x);
          bounds.bottom = Math.max(bounds.bottom, svgPoint.y);
        };
        Object.keys(nodesByIso).forEach(function(iso) {
          forEachMapNode(nodesByIso[iso], function(node) {
            if (!node || !node.getBoundingClientRect) {
              return;
            }
            var rect = node.getBoundingClientRect();
            if (!rect || !rect.width || !rect.height) {
              return;
            }
            addClientPoint(rect.left, rect.top);
            addClientPoint(rect.right, rect.top);
            addClientPoint(rect.right, rect.bottom);
            addClientPoint(rect.left, rect.bottom);
          });
        });
        if (!bounds || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
          return;
        }
        var width = bounds.right - bounds.left;
        var height = bounds.bottom - bounds.top;
        var canvasRect = canvas.getBoundingClientRect();
        var canvasAspect = canvasRect && canvasRect.width && canvasRect.height
          ? canvasRect.width / canvasRect.height
          : 0;
        if (canvasAspect > 0 && width > 0 && height > 0) {
          var boundsAspect = width / height;
          if (canvasAspect > boundsAspect) {
            var expandedWidth = height * canvasAspect;
            var extraWidth = expandedWidth - width;
            bounds.left -= extraWidth / 2;
            bounds.right += extraWidth / 2;
            width = expandedWidth;
          } else if (canvasAspect < boundsAspect) {
            var expandedHeight = width / canvasAspect;
            var extraHeight = expandedHeight - height;
            bounds.top -= extraHeight / 2;
            bounds.bottom += extraHeight / 2;
            height = expandedHeight;
          }
        }
        if (root.getAttribute('data-map-layout') === 'canada') {
          // The source Canada SVG is dominated by far-northern islands.  After
          // fitting the linked province/territory bounds, trim a little of that
          // northern extent so the reset/initial view reads as Canada rather
          // than as an Arctic close-up.  Keep the crop modest: territories
          // should remain visible and clickable in the overview.
          var canadaNorthernTrim = height * 0.10;
          bounds.top += canadaNorthernTrim;
          height -= canadaNorthernTrim;
        }
        var pad = Math.max(width, height) * 0.035;
        svg.setAttribute(
          'viewBox',
          [
            bounds.left - pad,
            bounds.top - pad,
            width + pad * 2,
            height + pad * 2
          ].map(function(value) { return Number(value).toFixed(3); }).join(' ')
        );
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('data-map-fit-applied', 'linked-bounds');
        zoomState = { scale: 1, x: 0, y: 0 };
        applyZoom();
      };
      var zoomToScreenBounds = function(bounds, nextScale) {
        var canvasRect = canvas.getBoundingClientRect();
        if (!bounds || !canvasRect.width || !canvasRect.height || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
          return;
        }
        var centerX = bounds.left - canvasRect.left + (bounds.right - bounds.left) / 2;
        var centerY = bounds.top - canvasRect.top + (bounds.bottom - bounds.top) / 2;
        var worldX = (centerX - zoomState.x) / zoomState.scale;
        var worldY = (centerY - zoomState.y) / zoomState.scale;
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        zoomState.x = canvasRect.width / 2 - worldX * zoomState.scale;
        zoomState.y = canvasRect.height / 2 - worldY * zoomState.scale;
        clampPan();
        applyZoom();
      };
      var focusMapOnRegion = function(regionKey) {
        var targetRegionKey = normaliseRegionKey(regionKey);
        var bounds = null;
        if (!targetRegionKey) {
          return false;
        }
        Object.keys(byIso).forEach(function(iso) {
          var item = byIso[iso];
          var node = nodesByIso[iso];
          if (!item || !node || getItemRegionKey(item) !== targetRegionKey) {
            return;
          }
          var rect = getMapNodesBounds(node);
          if (!rect || !rect.right || !rect.bottom || rect.right <= rect.left || rect.bottom <= rect.top) {
            return;
          }
          if (!bounds) {
            bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            return;
          }
          bounds.left = Math.min(bounds.left, rect.left);
          bounds.top = Math.min(bounds.top, rect.top);
          bounds.right = Math.max(bounds.right, rect.right);
          bounds.bottom = Math.max(bounds.bottom, rect.bottom);
        });
        if (!bounds) {
          return false;
        }
        zoomToScreenBounds(bounds, targetRegionKey === 'americas' ? 1.75 : 2.05);
        root.setAttribute('data-interactive-map-region-focus', targetRegionKey);
        root.setAttribute('data-uap-world-map-region-focus', targetRegionKey);
        return true;
      };
      var updatePreview = function(item) {
        if (!item || !preview) {
          return;
        }
        preview.setAttribute('tabindex', item.url ? '0' : '-1');
        preview.setAttribute('role', item.url ? 'link' : 'group');
        preview.setAttribute('aria-label', item.url ? 'Open file for ' + getItemLabel(item) : itemTypeTitle + ' preview');
        var imageUrl = resolveSiteAssetUrl(item.image);
        warmPreviewImage(item);
        var imageHtml = imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="eager" decoding="async" fetchpriority="high">' : '';
        var previewLabel = getItemLabel(item);
        var previewTitle = getItemTitle(item);
        var kickerHtml = '<span class="interactive-map-preview-kicker uap-world-map-preview-kicker">' + escapeHtml(previewLabel) + '</span>';
        preview.innerHTML = imageHtml
          + getPreviewMetaHtml(item)
          + kickerHtml
          + '<strong data-interactive-map-preview-title data-uap-world-map-preview-title>' + escapeHtml(previewTitle) + '</strong>'
          + '<span data-interactive-map-preview-summary data-uap-world-map-preview-summary>' + escapeHtml(getItemSummary(item)) + '</span>'
          + (item.url ? '<span class="interactive-map-preview-cta uap-world-map-preview-cta">Open file</span>' : '');
        bindPreviewImageFallback();
      };
      var forEachMapNode = function(nodeOrNodes, callback) {
        if (!nodeOrNodes || typeof callback !== 'function') {
          return;
        }
        if (nodeOrNodes.length && !nodeOrNodes.nodeType) {
          Array.prototype.forEach.call(nodeOrNodes, function(node) {
            if (node) {
              callback(node);
            }
          });
          return;
        }
        callback(nodeOrNodes);
      };
      var getMapNodesBounds = function(nodeOrNodes) {
        var bounds = null;
        forEachMapNode(nodeOrNodes, function(node) {
          if (!node || !node.getBoundingClientRect) {
            return;
          }
          var rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) {
            return;
          }
          if (!bounds) {
            bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            return;
          }
          bounds.left = Math.min(bounds.left, rect.left);
          bounds.top = Math.min(bounds.top, rect.top);
          bounds.right = Math.max(bounds.right, rect.right);
          bounds.bottom = Math.max(bounds.bottom, rect.bottom);
        });
        return bounds;
      };
      var clearActive = function() {
        forEachMapNode(active, function(node) {
          node.classList.remove('is-hovered');
        });
        active = null;
      };
      if (preview) {
        preview.addEventListener('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          var regionFocusButton = event.target && event.target.closest
            ? event.target.closest('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]')
            : null;
          if (regionFocusButton) {
            focusMapOnRegion(
              regionFocusButton.getAttribute('data-interactive-map-continent-focus')
              || regionFocusButton.getAttribute('data-uap-world-map-region-focus')
            );
            return;
          }
          navigateToItem(activeItem);
        });
        preview.addEventListener('keydown', function(event) {
          if (event.target && event.target.closest && event.target.closest('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]')) {
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            navigateToItem(activeItem);
          }
        });
      }
      var focusCountry = function(node, item, options) {
        clearActive();
        active = node;
        activeItem = item;
        forEachMapNode(node, function(part) {
          part.classList.add('is-hovered');
        });
        if (!options || !options.preservePreview) {
          updatePreview(item);
        }
        if (options && options.zoom) {
          var bounds = getMapNodesBounds(node);
          if (bounds) {
            zoomToScreenBounds(bounds, options.scale || 2.7);
          }
        }
      };
      var escapeAttrValue = function(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      };
      var normaliseMapSvgLabel = function(value) {
        var text = String(value || '').trim().toLowerCase();
        if (text.normalize) {
          text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return text.replace(/[^a-z0-9]+/g, ' ').trim();
      };
      var getMapNodesForItem = function(iso, item) {
        var exact = svg.getElementById ? svg.getElementById(iso) : svg.querySelector('#' + iso);
        if (exact) {
          return [exact];
        }
        var labels = [
          item && item.country,
          item && item.label,
          item && item.mapName,
          item && item.displayLabel
        ].concat((item && item.mapAliases) || []).filter(Boolean);
        var selectors = [];
        labels.forEach(function(label) {
          var safe = escapeAttrValue(label);
          selectors.push('[name="' + safe + '"]');
          selectors.push('[class="' + safe + '"]');
        });
        if (!selectors.length) {
          return [];
        }
        var seen = [];
        Array.prototype.forEach.call(svg.querySelectorAll(selectors.join(',')), function(node) {
          if (seen.indexOf(node) === -1) {
            seen.push(node);
          }
        });
        if (!seen.length) {
          var normalisedLabels = labels.map(normaliseMapSvgLabel).filter(Boolean);
          Array.prototype.forEach.call(svg.querySelectorAll('[name], [class]'), function(node) {
            var candidates = [
              normaliseMapSvgLabel(node.getAttribute('name')),
              normaliseMapSvgLabel(node.getAttribute('class'))
            ];
            if (candidates.some(function(candidate) { return normalisedLabels.indexOf(candidate) !== -1; })) {
              seen.push(node);
            }
          });
        }
        return seen;
      };
      var guessedIso = guessVisitorCountryIso(byIso);
      var guessedNode = null;
      Object.keys(byIso).forEach(function(iso) {
        var item = byIso[iso];
        var nodes = getMapNodesForItem(iso, item);
        if (!nodes.length || !item) {
          return;
        }
        if (iso === guessedIso) {
          guessedNode = nodes;
        }
        nodesByIso[iso] = nodes;
        nodes.forEach(function(node, nodeIndex) {
          node.classList.add('is-linked');
          node.setAttribute('data-uap-country', iso);
          node.setAttribute('data-interactive-map-item', iso);
          if (nodeIndex === 0) {
            node.setAttribute('tabindex', '0');
            node.setAttribute('role', 'link');
            node.setAttribute('aria-label', 'Open ' + getItemLabel(item));
          } else {
            // Multi-part countries and regions remain pointer targets, but only
            // one shape per item should enter the keyboard/accessibility tree.
            node.setAttribute('tabindex', '-1');
            node.setAttribute('aria-hidden', 'true');
            node.removeAttribute('role');
            node.removeAttribute('aria-label');
          }
          node.addEventListener('mouseenter', function() { focusCountry(nodes, item); });
          node.addEventListener('focus', function() { focusCountry(nodes, item); });
          node.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            navigateToItem(item);
          });
          node.addEventListener('keydown', function(event) {
            if ((event.key === 'Enter' || event.key === ' ') && item.url) {
              event.preventDefault();
              event.stopPropagation();
              navigateToItem(item);
            }
          });
        });
      });
      var markUnlinkedMapContextShapes = function() {
        if (!contextShapeMapLayouts[mapLayout]) {
          return;
        }
        Array.prototype.forEach.call(svg.querySelectorAll('path, polygon, polyline, rect, circle'), function(node) {
          if (node.hasAttribute('data-interactive-map-item') || node.hasAttribute('data-uap-country')) {
            return;
          }
          node.classList.add('map-context-shape');
          node.setAttribute('aria-hidden', 'true');
        });
      };
      markUnlinkedMapContextShapes();
      fitSvgToLinkedBounds();
      var resolveInitialIso = function() {
        if (initialItemId && byIso[initialItemId] && nodesByIso[initialItemId]) {
          return initialItemId;
        }
        if (root.getAttribute('data-map-layout') === 'uk-counties' && byIso['UK-HC-SUFFOLK'] && nodesByIso['UK-HC-SUFFOLK']) {
          return 'UK-HC-SUFFOLK';
        }
        var previewTitleNode = preview && preview.querySelector('[data-interactive-map-preview-title], [data-uap-world-map-preview-title]');
        var previewTitle = normaliseMapSvgLabel(previewTitleNode ? previewTitleNode.textContent : '');
        var previewKickerNode = preview && preview.querySelector('.interactive-map-preview-kicker, .uap-world-map-preview-kicker');
        var previewKicker = normaliseMapSvgLabel(previewKickerNode ? previewKickerNode.textContent : '');
        var matchedIso = '';
        Object.keys(byIso).some(function(iso) {
          var item = byIso[iso];
          var labels = [
            getItemLabel(item),
            getItemTitle(item),
            item && item.mapName,
            item && item.country,
            item && item.province,
            item && item.state,
            item && item.county
          ].concat((item && item.mapAliases) || []);
          var normalisedLabels = labels.map(normaliseMapSvgLabel).filter(Boolean);
          if (
            (previewKicker && normalisedLabels.indexOf(previewKicker) !== -1)
            || (previewTitle && normalisedLabels.some(function(label) { return previewTitle.indexOf(label) !== -1 || label.indexOf(previewTitle) !== -1; }))
          ) {
            matchedIso = iso;
            return true;
          }
          return false;
        });
        if (matchedIso && byIso[matchedIso] && nodesByIso[matchedIso]) {
          return matchedIso;
        }
        var firstIso = Object.keys(byIso).filter(function(iso) { return nodesByIso[iso]; })[0] || '';
        return firstIso;
      };
      var initialIso = resolveInitialIso();
      if (initialIso && byIso[initialIso] && nodesByIso[initialIso]) {
        focusCountry(nodesByIso[initialIso], byIso[initialIso], { preservePreview: !initialItemId });
      }
      if (root.getAttribute('data-map-auto-focus') === 'visitor' && guessedIso && guessedNode) {
        window.setTimeout(function() {
          if (!active) {
            focusCountry(guessedNode, byIso[guessedIso], { zoom: true });
          }
        }, 160);
      }
      setMapState(
        mapDataUnavailable ? 'partial' : 'ready',
        mapDataUnavailable ? 'Map links are unavailable. Use the featured file or Contents below.' : ''
      );
    }).catch(function() {
      canvas.innerHTML = '';
      var staticFallback = document.createElement('img');
      staticFallback.className = 'interactive-map-static-fallback uap-world-map-static-fallback';
      staticFallback.src = resolveSiteAssetUrl(mapSrc);
      staticFallback.alt = mapLabel;
      staticFallback.addEventListener('load', function() {
        root.setAttribute('data-map-state', 'static');
      }, { once: true });
      staticFallback.addEventListener('error', function() {
        if (staticFallback.parentNode === canvas) {
          canvas.removeChild(staticFallback);
        }
        setMapState('error', 'Map unavailable. Use the featured file or Contents below.');
      }, { once: true });
      canvas.appendChild(staticFallback);
      setMapState('fallback', 'Interactive map unavailable. Use the featured file or Contents below.');
    });
    });
  }

  function init() {
    initContentPageScrollReset();
    cleanGeneratedTopicLabels();
    initAffiliateClickTracking();
    initScrollAnimations();
    initAnchorOffsetSync();
    highlightSearchTermOnPage();
    markActiveSidebarLink();
    buildPageToc();
    initMobilePageTools();
    initSidebarCollapsing();
    initSidebarFilter();
    initMobileSidebarMode();
    initMobileQuickNav();
    initSiteSearch();
    initSearchResultsPage();
    initHeaderTopicsMenu();
    initSidebarDocking();
    initHomeResponsiveDisclosures();
    initHomeModeSwitcher();
    initHomeVerticalView();
    initUapWorldMap();
    initHomeFilter();
    initHomeCardNavigation();
    initHierarchyGraphs();
    initEndnotesCollapsing();
    initPageActionButtons();
    initBackToTop();
    initImageLightbox();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

