const t=Symbol();const s=Object.getPrototypeOf,c=new WeakMap,l=e=>e&&(c.has(e)?c.get(e):s(e)===Object.prototype||s(e)===Array.prototype),y$1=e=>l(e)&&e[t]||null,h$2=(e,t=!0)=>{c.set(e,t);};

const isObject = (x) => typeof x === "object" && x !== null;
const proxyStateMap = /* @__PURE__ */ new WeakMap();
const refSet = /* @__PURE__ */ new WeakSet();
const buildProxyFunction = (objectIs = Object.is, newProxy = (target, handler) => new Proxy(target, handler), canProxy = (x) => isObject(x) && !refSet.has(x) && (Array.isArray(x) || !(Symbol.iterator in x)) && !(x instanceof WeakMap) && !(x instanceof WeakSet) && !(x instanceof Error) && !(x instanceof Number) && !(x instanceof Date) && !(x instanceof String) && !(x instanceof RegExp) && !(x instanceof ArrayBuffer), defaultHandlePromise = (promise) => {
  switch (promise.status) {
    case "fulfilled":
      return promise.value;
    case "rejected":
      throw promise.reason;
    default:
      throw promise;
  }
}, snapCache = /* @__PURE__ */ new WeakMap(), createSnapshot = (target, version, handlePromise = defaultHandlePromise) => {
  const cache = snapCache.get(target);
  if ((cache == null ? void 0 : cache[0]) === version) {
    return cache[1];
  }
  const snap = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target));
  h$2(snap, true);
  snapCache.set(target, [version, snap]);
  Reflect.ownKeys(target).forEach((key) => {
    if (Object.getOwnPropertyDescriptor(snap, key)) {
      return;
    }
    const value = Reflect.get(target, key);
    const desc = {
      value,
      enumerable: true,
      // This is intentional to avoid copying with proxy-compare.
      // It's still non-writable, so it avoids assigning a value.
      configurable: true
    };
    if (refSet.has(value)) {
      h$2(value, false);
    } else if (value instanceof Promise) {
      delete desc.value;
      desc.get = () => handlePromise(value);
    } else if (proxyStateMap.has(value)) {
      const [target2, ensureVersion] = proxyStateMap.get(
        value
      );
      desc.value = createSnapshot(
        target2,
        ensureVersion(),
        handlePromise
      );
    }
    Object.defineProperty(snap, key, desc);
  });
  return Object.preventExtensions(snap);
}, proxyCache = /* @__PURE__ */ new WeakMap(), versionHolder = [1, 1], proxyFunction = (initialObject) => {
  if (!isObject(initialObject)) {
    throw new Error("object required");
  }
  const found = proxyCache.get(initialObject);
  if (found) {
    return found;
  }
  let version = versionHolder[0];
  const listeners = /* @__PURE__ */ new Set();
  const notifyUpdate = (op, nextVersion = ++versionHolder[0]) => {
    if (version !== nextVersion) {
      version = nextVersion;
      listeners.forEach((listener) => listener(op, nextVersion));
    }
  };
  let checkVersion = versionHolder[1];
  const ensureVersion = (nextCheckVersion = ++versionHolder[1]) => {
    if (checkVersion !== nextCheckVersion && !listeners.size) {
      checkVersion = nextCheckVersion;
      propProxyStates.forEach(([propProxyState]) => {
        const propVersion = propProxyState[1](nextCheckVersion);
        if (propVersion > version) {
          version = propVersion;
        }
      });
    }
    return version;
  };
  const createPropListener = (prop) => (op, nextVersion) => {
    const newOp = [...op];
    newOp[1] = [prop, ...newOp[1]];
    notifyUpdate(newOp, nextVersion);
  };
  const propProxyStates = /* @__PURE__ */ new Map();
  const addPropListener = (prop, propProxyState) => {
    if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && propProxyStates.has(prop)) {
      throw new Error("prop listener already exists");
    }
    if (listeners.size) {
      const remove = propProxyState[3](createPropListener(prop));
      propProxyStates.set(prop, [propProxyState, remove]);
    } else {
      propProxyStates.set(prop, [propProxyState]);
    }
  };
  const removePropListener = (prop) => {
    var _a;
    const entry = propProxyStates.get(prop);
    if (entry) {
      propProxyStates.delete(prop);
      (_a = entry[1]) == null ? void 0 : _a.call(entry);
    }
  };
  const addListener = (listener) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      propProxyStates.forEach(([propProxyState, prevRemove], prop) => {
        if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && prevRemove) {
          throw new Error("remove already exists");
        }
        const remove = propProxyState[3](createPropListener(prop));
        propProxyStates.set(prop, [propProxyState, remove]);
      });
    }
    const removeListener = () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        propProxyStates.forEach(([propProxyState, remove], prop) => {
          if (remove) {
            remove();
            propProxyStates.set(prop, [propProxyState]);
          }
        });
      }
    };
    return removeListener;
  };
  const baseObject = Array.isArray(initialObject) ? [] : Object.create(Object.getPrototypeOf(initialObject));
  const handler = {
    deleteProperty(target, prop) {
      const prevValue = Reflect.get(target, prop);
      removePropListener(prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted) {
        notifyUpdate(["delete", [prop], prevValue]);
      }
      return deleted;
    },
    set(target, prop, value, receiver) {
      const hasPrevValue = Reflect.has(target, prop);
      const prevValue = Reflect.get(target, prop, receiver);
      if (hasPrevValue && (objectIs(prevValue, value) || proxyCache.has(value) && objectIs(prevValue, proxyCache.get(value)))) {
        return true;
      }
      removePropListener(prop);
      if (isObject(value)) {
        value = y$1(value) || value;
      }
      let nextValue = value;
      if (value instanceof Promise) {
        value.then((v) => {
          value.status = "fulfilled";
          value.value = v;
          notifyUpdate(["resolve", [prop], v]);
        }).catch((e) => {
          value.status = "rejected";
          value.reason = e;
          notifyUpdate(["reject", [prop], e]);
        });
      } else {
        if (!proxyStateMap.has(value) && canProxy(value)) {
          nextValue = proxyFunction(value);
        }
        const childProxyState = !refSet.has(nextValue) && proxyStateMap.get(nextValue);
        if (childProxyState) {
          addPropListener(prop, childProxyState);
        }
      }
      Reflect.set(target, prop, nextValue, receiver);
      notifyUpdate(["set", [prop], value, prevValue]);
      return true;
    }
  };
  const proxyObject = newProxy(baseObject, handler);
  proxyCache.set(initialObject, proxyObject);
  const proxyState = [
    baseObject,
    ensureVersion,
    createSnapshot,
    addListener
  ];
  proxyStateMap.set(proxyObject, proxyState);
  Reflect.ownKeys(initialObject).forEach((key) => {
    const desc = Object.getOwnPropertyDescriptor(
      initialObject,
      key
    );
    if ("value" in desc) {
      proxyObject[key] = initialObject[key];
      delete desc.value;
      delete desc.writable;
    }
    Object.defineProperty(baseObject, key, desc);
  });
  return proxyObject;
}) => [
  // public functions
  proxyFunction,
  // shared state
  proxyStateMap,
  refSet,
  // internal things
  objectIs,
  newProxy,
  canProxy,
  defaultHandlePromise,
  snapCache,
  createSnapshot,
  proxyCache,
  versionHolder
];
const [defaultProxyFunction] = buildProxyFunction();
function proxy(initialObject = {}) {
  return defaultProxyFunction(initialObject);
}
function subscribe(proxyObject, callback, notifyInSync) {
  const proxyState = proxyStateMap.get(proxyObject);
  if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && !proxyState) {
    console.warn("Please use proxy object");
  }
  let promise;
  const ops = [];
  const addListener = proxyState[3];
  let isListenerActive = false;
  const listener = (op) => {
    ops.push(op);
    if (notifyInSync) {
      callback(ops.splice(0));
      return;
    }
    if (!promise) {
      promise = Promise.resolve().then(() => {
        promise = void 0;
        if (isListenerActive) {
          callback(ops.splice(0));
        }
      });
    }
  };
  const removeListener = addListener(listener);
  isListenerActive = true;
  return () => {
    isListenerActive = false;
    removeListener();
  };
}
function snapshot(proxyObject, handlePromise) {
  const proxyState = proxyStateMap.get(proxyObject);
  if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && !proxyState) {
    console.warn("Please use proxy object");
  }
  const [target, ensureVersion, createSnapshot] = proxyState;
  return createSnapshot(target, ensureVersion(), handlePromise);
}

const state$7 = proxy({
  history: ["ConnectWallet"],
  view: "ConnectWallet",
  data: void 0
});
const RouterCtrl = {
  state: state$7,
  subscribe(callback) {
    return subscribe(state$7, () => callback(state$7));
  },
  push(view, data) {
    if (view !== state$7.view) {
      state$7.view = view;
      if (data) {
        state$7.data = data;
      }
      state$7.history.push(view);
    }
  },
  reset(view) {
    state$7.view = view;
    state$7.history = [view];
  },
  replace(view) {
    if (state$7.history.length > 1) {
      state$7.history[state$7.history.length - 1] = view;
      state$7.view = view;
    }
  },
  goBack() {
    if (state$7.history.length > 1) {
      state$7.history.pop();
      const [last] = state$7.history.slice(-1);
      state$7.view = last;
    }
  },
  setData(data) {
    state$7.data = data;
  }
};
const CoreUtil = {
  WALLETCONNECT_DEEPLINK_CHOICE: "WALLETCONNECT_DEEPLINK_CHOICE",
  WCM_VERSION: "WCM_VERSION",
  RECOMMENDED_WALLET_AMOUNT: 9,
  isMobile() {
    if (typeof window !== "undefined") {
      return Boolean(
        window.matchMedia("(pointer:coarse)").matches || /Android|webOS|iPhone|iPad|iPod|BlackBerry|Opera Mini/u.test(navigator.userAgent)
      );
    }
    return false;
  },
  isAndroid() {
    return CoreUtil.isMobile() && navigator.userAgent.toLowerCase().includes("android");
  },
  isIos() {
    const ua = navigator.userAgent.toLowerCase();
    return CoreUtil.isMobile() && (ua.includes("iphone") || ua.includes("ipad"));
  },
  isHttpUrl(url) {
    return url.startsWith("http://") || url.startsWith("https://");
  },
  isArray(data) {
    return Array.isArray(data) && data.length > 0;
  },
  isTelegram() {
    return typeof window !== "undefined" && // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Boolean(window.TelegramWebviewProxy) || // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean(window.Telegram) || // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean(window.TelegramWebviewProxyProto));
  },
  formatNativeUrl(appUrl, wcUri, name) {
    if (CoreUtil.isHttpUrl(appUrl)) {
      return this.formatUniversalUrl(appUrl, wcUri, name);
    }
    let safeAppUrl = appUrl;
    if (!safeAppUrl.includes("://")) {
      safeAppUrl = appUrl.replaceAll("/", "").replaceAll(":", "");
      safeAppUrl = `${safeAppUrl}://`;
    }
    if (!safeAppUrl.endsWith("/")) {
      safeAppUrl = `${safeAppUrl}/`;
    }
    this.setWalletConnectDeepLink(safeAppUrl, name);
    const encodedWcUrl = encodeURIComponent(wcUri);
    return `${safeAppUrl}wc?uri=${encodedWcUrl}`;
  },
  formatUniversalUrl(appUrl, wcUri, name) {
    if (!CoreUtil.isHttpUrl(appUrl)) {
      return this.formatNativeUrl(appUrl, wcUri, name);
    }
    let safeAppUrl = appUrl;
    if (safeAppUrl.startsWith("https://t.me")) {
      const formattedUri = Buffer.from(wcUri).toString("base64").replace(/[=]/g, "");
      if (safeAppUrl.endsWith("/")) {
        safeAppUrl = safeAppUrl.slice(0, -1);
      }
      this.setWalletConnectDeepLink(safeAppUrl, name);
      const url = new URL(safeAppUrl);
      url.searchParams.set("startapp", formattedUri);
      const link = url.toString();
      return link;
    }
    if (!safeAppUrl.endsWith("/")) {
      safeAppUrl = `${safeAppUrl}/`;
    }
    this.setWalletConnectDeepLink(safeAppUrl, name);
    const encodedWcUrl = encodeURIComponent(wcUri);
    return `${safeAppUrl}wc?uri=${encodedWcUrl}`;
  },
  async wait(miliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, miliseconds);
    });
  },
  openHref(href, target) {
    const adjustedTarget = this.isTelegram() ? "_blank" : target;
    window.open(href, adjustedTarget, "noreferrer noopener");
  },
  setWalletConnectDeepLink(href, name) {
    try {
      localStorage.setItem(CoreUtil.WALLETCONNECT_DEEPLINK_CHOICE, JSON.stringify({ href, name }));
    } catch (e) {
      console.info("Unable to set WalletConnect deep link");
    }
  },
  setWalletConnectAndroidDeepLink(wcUri) {
    try {
      const [href] = wcUri.split("?");
      localStorage.setItem(
        CoreUtil.WALLETCONNECT_DEEPLINK_CHOICE,
        JSON.stringify({ href, name: "Android" })
      );
    } catch (e) {
      console.info("Unable to set WalletConnect android deep link");
    }
  },
  removeWalletConnectDeepLink() {
    try {
      localStorage.removeItem(CoreUtil.WALLETCONNECT_DEEPLINK_CHOICE);
    } catch (e) {
      console.info("Unable to remove WalletConnect deep link");
    }
  },
  setModalVersionInStorage() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CoreUtil.WCM_VERSION, "2.7.0");
      }
    } catch (e) {
      console.info("Unable to set Web3Modal version in storage");
    }
  },
  getWalletRouterData() {
    var _a;
    const routerData = (_a = RouterCtrl.state.data) == null ? void 0 : _a.Wallet;
    if (!routerData) {
      throw new Error('Missing "Wallet" view data');
    }
    return routerData;
  }
};
const isEnabled = typeof location !== "undefined" && (location.hostname.includes("localhost") || location.protocol.includes("https"));
const state$6 = proxy({
  enabled: isEnabled,
  userSessionId: "",
  events: [],
  connectedWalletId: void 0
});
const EventsCtrl = {
  state: state$6,
  subscribe(callback) {
    return subscribe(state$6.events, () => callback(snapshot(state$6.events[state$6.events.length - 1])));
  },
  initialize() {
    if (state$6.enabled && typeof (crypto == null ? void 0 : crypto.randomUUID) !== "undefined") {
      state$6.userSessionId = crypto.randomUUID();
    }
  },
  setConnectedWalletId(connectedWalletId) {
    state$6.connectedWalletId = connectedWalletId;
  },
  click(data) {
    if (state$6.enabled) {
      const event = {
        type: "CLICK",
        name: data.name,
        userSessionId: state$6.userSessionId,
        timestamp: Date.now(),
        data
      };
      state$6.events.push(event);
    }
  },
  track(data) {
    if (state$6.enabled) {
      const event = {
        type: "TRACK",
        name: data.name,
        userSessionId: state$6.userSessionId,
        timestamp: Date.now(),
        data
      };
      state$6.events.push(event);
    }
  },
  view(data) {
    if (state$6.enabled) {
      const event = {
        type: "VIEW",
        name: data.name,
        userSessionId: state$6.userSessionId,
        timestamp: Date.now(),
        data
      };
      state$6.events.push(event);
    }
  }
};
const state$5 = proxy({
  chains: void 0,
  walletConnectUri: void 0,
  isAuth: false,
  isCustomDesktop: false,
  isCustomMobile: false,
  isDataLoaded: false,
  isUiLoaded: false
});
const OptionsCtrl = {
  state: state$5,
  subscribe(callback) {
    return subscribe(state$5, () => callback(state$5));
  },
  setChains(chains) {
    state$5.chains = chains;
  },
  setWalletConnectUri(walletConnectUri) {
    state$5.walletConnectUri = walletConnectUri;
  },
  setIsCustomDesktop(isCustomDesktop) {
    state$5.isCustomDesktop = isCustomDesktop;
  },
  setIsCustomMobile(isCustomMobile) {
    state$5.isCustomMobile = isCustomMobile;
  },
  setIsDataLoaded(isDataLoaded) {
    state$5.isDataLoaded = isDataLoaded;
  },
  setIsUiLoaded(isUiLoaded) {
    state$5.isUiLoaded = isUiLoaded;
  },
  setIsAuth(isAuth) {
    state$5.isAuth = isAuth;
  }
};
const state$4 = proxy({
  projectId: "",
  mobileWallets: void 0,
  desktopWallets: void 0,
  walletImages: void 0,
  chains: void 0,
  enableAuthMode: false,
  enableExplorer: true,
  explorerExcludedWalletIds: void 0,
  explorerRecommendedWalletIds: void 0,
  termsOfServiceUrl: void 0,
  privacyPolicyUrl: void 0
});
const ConfigCtrl = {
  state: state$4,
  subscribe(callback) {
    return subscribe(state$4, () => callback(state$4));
  },
  setConfig(config) {
    var _a, _b;
    EventsCtrl.initialize();
    OptionsCtrl.setChains(config.chains);
    OptionsCtrl.setIsAuth(Boolean(config.enableAuthMode));
    OptionsCtrl.setIsCustomMobile(Boolean((_a = config.mobileWallets) == null ? void 0 : _a.length));
    OptionsCtrl.setIsCustomDesktop(Boolean((_b = config.desktopWallets) == null ? void 0 : _b.length));
    CoreUtil.setModalVersionInStorage();
    Object.assign(state$4, config);
  }
};
var __defProp$2 = Object.defineProperty;
var __getOwnPropSymbols$2 = Object.getOwnPropertySymbols;
var __hasOwnProp$2 = Object.prototype.hasOwnProperty;
var __propIsEnum$2 = Object.prototype.propertyIsEnumerable;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues$2 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp$2.call(b, prop))
      __defNormalProp$2(a, prop, b[prop]);
  if (__getOwnPropSymbols$2)
    for (var prop of __getOwnPropSymbols$2(b)) {
      if (__propIsEnum$2.call(b, prop))
        __defNormalProp$2(a, prop, b[prop]);
    }
  return a;
};
const W3M_API = "https://explorer-api.walletconnect.com";
const SDK_TYPE = "wcm";
const SDK_VERSION = `js-${"2.7.0"}`;
async function fetchListings(endpoint, params) {
  const allParams = __spreadValues$2({ sdkType: SDK_TYPE, sdkVersion: SDK_VERSION }, params);
  const url = new URL(endpoint, W3M_API);
  url.searchParams.append("projectId", ConfigCtrl.state.projectId);
  Object.entries(allParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.append(key, String(value));
    }
  });
  const request = await fetch(url);
  return request.json();
}
const ExplorerUtil = {
  async getDesktopListings(params) {
    return fetchListings("/w3m/v1/getDesktopListings", params);
  },
  async getMobileListings(params) {
    return fetchListings("/w3m/v1/getMobileListings", params);
  },
  async getInjectedListings(params) {
    return fetchListings("/w3m/v1/getInjectedListings", params);
  },
  async getAllListings(params) {
    return fetchListings("/w3m/v1/getAllListings", params);
  },
  getWalletImageUrl(imageId) {
    return `${W3M_API}/w3m/v1/getWalletImage/${imageId}?projectId=${ConfigCtrl.state.projectId}&sdkType=${SDK_TYPE}&sdkVersion=${SDK_VERSION}`;
  },
  getAssetImageUrl(imageId) {
    return `${W3M_API}/w3m/v1/getAssetImage/${imageId}?projectId=${ConfigCtrl.state.projectId}&sdkType=${SDK_TYPE}&sdkVersion=${SDK_VERSION}`;
  }
};
var __defProp$1 = Object.defineProperty;
var __getOwnPropSymbols$1 = Object.getOwnPropertySymbols;
var __hasOwnProp$1 = Object.prototype.hasOwnProperty;
var __propIsEnum$1 = Object.prototype.propertyIsEnumerable;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues$1 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp$1.call(b, prop))
      __defNormalProp$1(a, prop, b[prop]);
  if (__getOwnPropSymbols$1)
    for (var prop of __getOwnPropSymbols$1(b)) {
      if (__propIsEnum$1.call(b, prop))
        __defNormalProp$1(a, prop, b[prop]);
    }
  return a;
};
const isMobile = CoreUtil.isMobile();
const state$3 = proxy({
  wallets: { listings: [], total: 0, page: 1 },
  search: { listings: [], total: 0, page: 1 },
  recomendedWallets: []
});
const ExplorerCtrl = {
  state: state$3,
  async getRecomendedWallets() {
    const { explorerRecommendedWalletIds, explorerExcludedWalletIds } = ConfigCtrl.state;
    if (explorerRecommendedWalletIds === "NONE" || explorerExcludedWalletIds === "ALL" && !explorerRecommendedWalletIds) {
      return state$3.recomendedWallets;
    }
    if (CoreUtil.isArray(explorerRecommendedWalletIds)) {
      const recommendedIds = explorerRecommendedWalletIds.join(",");
      const params = { recommendedIds };
      const { listings } = await ExplorerUtil.getAllListings(params);
      const listingsArr = Object.values(listings);
      listingsArr.sort((a, b) => {
        const aIndex = explorerRecommendedWalletIds.indexOf(a.id);
        const bIndex = explorerRecommendedWalletIds.indexOf(b.id);
        return aIndex - bIndex;
      });
      state$3.recomendedWallets = listingsArr;
    } else {
      const { chains, isAuth } = OptionsCtrl.state;
      const chainsFilter = chains == null ? void 0 : chains.join(",");
      const isExcluded = CoreUtil.isArray(explorerExcludedWalletIds);
      const params = {
        page: 1,
        sdks: isAuth ? "auth_v1" : void 0,
        entries: CoreUtil.RECOMMENDED_WALLET_AMOUNT,
        chains: chainsFilter,
        version: 2,
        excludedIds: isExcluded ? explorerExcludedWalletIds.join(",") : void 0
      };
      const { listings } = isMobile ? await ExplorerUtil.getMobileListings(params) : await ExplorerUtil.getDesktopListings(params);
      state$3.recomendedWallets = Object.values(listings);
    }
    return state$3.recomendedWallets;
  },
  async getWallets(params) {
    const extendedParams = __spreadValues$1({}, params);
    const { explorerRecommendedWalletIds, explorerExcludedWalletIds } = ConfigCtrl.state;
    const { recomendedWallets } = state$3;
    if (explorerExcludedWalletIds === "ALL") {
      return state$3.wallets;
    }
    if (recomendedWallets.length) {
      extendedParams.excludedIds = recomendedWallets.map((wallet) => wallet.id).join(",");
    } else if (CoreUtil.isArray(explorerRecommendedWalletIds)) {
      extendedParams.excludedIds = explorerRecommendedWalletIds.join(",");
    }
    if (CoreUtil.isArray(explorerExcludedWalletIds)) {
      extendedParams.excludedIds = [extendedParams.excludedIds, explorerExcludedWalletIds].filter(Boolean).join(",");
    }
    if (OptionsCtrl.state.isAuth) {
      extendedParams.sdks = "auth_v1";
    }
    const { page, search } = params;
    const { listings: listingsObj, total } = isMobile ? await ExplorerUtil.getMobileListings(extendedParams) : await ExplorerUtil.getDesktopListings(extendedParams);
    const listings = Object.values(listingsObj);
    const type = search ? "search" : "wallets";
    state$3[type] = {
      listings: [...state$3[type].listings, ...listings],
      total,
      page: page != null ? page : 1
    };
    return { listings, total };
  },
  getWalletImageUrl(imageId) {
    return ExplorerUtil.getWalletImageUrl(imageId);
  },
  getAssetImageUrl(imageId) {
    return ExplorerUtil.getAssetImageUrl(imageId);
  },
  resetSearch() {
    state$3.search = { listings: [], total: 0, page: 1 };
  }
};
const state$2 = proxy({
  open: false
});
const ModalCtrl = {
  state: state$2,
  subscribe(callback) {
    return subscribe(state$2, () => callback(state$2));
  },
  async open(options) {
    return new Promise((resolve) => {
      const { isUiLoaded, isDataLoaded } = OptionsCtrl.state;
      CoreUtil.removeWalletConnectDeepLink();
      OptionsCtrl.setWalletConnectUri(options == null ? void 0 : options.uri);
      OptionsCtrl.setChains(options == null ? void 0 : options.chains);
      RouterCtrl.reset("ConnectWallet");
      if (isUiLoaded && isDataLoaded) {
        state$2.open = true;
        resolve();
      } else {
        const interval = setInterval(() => {
          const opts = OptionsCtrl.state;
          if (opts.isUiLoaded && opts.isDataLoaded) {
            clearInterval(interval);
            state$2.open = true;
            resolve();
          }
        }, 200);
      }
    });
  },
  close() {
    state$2.open = false;
  }
};
var __defProp$3 = Object.defineProperty;
var __getOwnPropSymbols$3 = Object.getOwnPropertySymbols;
var __hasOwnProp$3 = Object.prototype.hasOwnProperty;
var __propIsEnum$3 = Object.prototype.propertyIsEnumerable;
var __defNormalProp$3 = (obj, key, value) => key in obj ? __defProp$3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues$3 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp$3.call(b, prop))
      __defNormalProp$3(a, prop, b[prop]);
  if (__getOwnPropSymbols$3)
    for (var prop of __getOwnPropSymbols$3(b)) {
      if (__propIsEnum$3.call(b, prop))
        __defNormalProp$3(a, prop, b[prop]);
    }
  return a;
};
function isDarkMode() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}
const state$1 = proxy({
  themeMode: isDarkMode() ? "dark" : "light"
});
const ThemeCtrl = {
  state: state$1,
  subscribe(callback) {
    return subscribe(state$1, () => callback(state$1));
  },
  setThemeConfig(theme) {
    const { themeMode, themeVariables } = theme;
    if (themeMode) {
      state$1.themeMode = themeMode;
    }
    if (themeVariables) {
      state$1.themeVariables = __spreadValues$3({}, themeVariables);
    }
  }
};
const state = proxy({
  open: false,
  message: "",
  variant: "success"
});
const ToastCtrl = {
  state,
  subscribe(callback) {
    return subscribe(state, () => callback(state));
  },
  openToast(message, variant) {
    state.open = true;
    state.message = message;
    state.variant = variant;
  },
  closeToast() {
    state.open = false;
  }
};

class WalletConnectModal {
  constructor(config) {
    this.openModal = ModalCtrl.open;
    this.closeModal = ModalCtrl.close;
    this.subscribeModal = ModalCtrl.subscribe;
    this.setTheme = ThemeCtrl.setThemeConfig;
    ThemeCtrl.setThemeConfig(config);
    ConfigCtrl.setConfig(config);
    this.initUi();
  }
  async initUi() {
    if (typeof window !== "undefined") {
      await import('./index-fb46b9c0.js');
      const modal = document.createElement("wcm-modal");
      document.body.insertAdjacentElement("beforeend", modal);
      OptionsCtrl.setIsUiLoaded(true);
    }
  }
}

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active ) ;
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };
    
// Alias for removeListener added in NodeJS 10.0
// https://nodejs.org/api/events.html#events_emitter_off_eventname_listener
EventEmitter.prototype.off = function(type, listener){
    return this.removeListener(type, listener);
};

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

var _polyfillNode_events = /*#__PURE__*/Object.freeze({
  __proto__: null,
  EventEmitter: EventEmitter,
  default: EventEmitter
});

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var browser$2 = {};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics$4 = function(d, b) {
    extendStatics$4 = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics$4(d, b);
};

function __extends$4(d, b) {
    extendStatics$4(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign$4 = function() {
    __assign$4 = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign$4.apply(this, arguments);
};

function __rest$4(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate$4(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param$4(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata$4(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter$4(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator$4(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding$4(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar$4(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values$4(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read$4(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread$4() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read$4(arguments[i]));
    return ar;
}

function __spreadArrays$4() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await$4(v) {
    return this instanceof __await$4 ? (this.v = v, this) : new __await$4(v);
}

function __asyncGenerator$4(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await$4 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator$4(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$4(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues$4(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values$4 === "function" ? __values$4(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject$4(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar$4(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault$4(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet$4(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet$4(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6$4 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get __assign () { return __assign$4; },
  __asyncDelegator: __asyncDelegator$4,
  __asyncGenerator: __asyncGenerator$4,
  __asyncValues: __asyncValues$4,
  __await: __await$4,
  __awaiter: __awaiter$4,
  __classPrivateFieldGet: __classPrivateFieldGet$4,
  __classPrivateFieldSet: __classPrivateFieldSet$4,
  __createBinding: __createBinding$4,
  __decorate: __decorate$4,
  __exportStar: __exportStar$4,
  __extends: __extends$4,
  __generator: __generator$4,
  __importDefault: __importDefault$4,
  __importStar: __importStar$4,
  __makeTemplateObject: __makeTemplateObject$4,
  __metadata: __metadata$4,
  __param: __param$4,
  __read: __read$4,
  __rest: __rest$4,
  __spread: __spread$4,
  __spreadArrays: __spreadArrays$4,
  __values: __values$4
});

var require$$0$5 = /*@__PURE__*/getAugmentedNamespace(tslib_es6$4);

var cjs$6 = {};

Object.defineProperty(cjs$6, "__esModule", { value: true });
function safeJsonParse$1(value) {
    if (typeof value !== 'string') {
        throw new Error(`Cannot safe json parse value of type ${typeof value}`);
    }
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return value;
    }
}
cjs$6.safeJsonParse = safeJsonParse$1;
function safeJsonStringify$1(value) {
    return typeof value === 'string'
        ? value
        : JSON.stringify(value, (key, value) => typeof value === 'undefined' ? null : value);
}
cjs$6.safeJsonStringify = safeJsonStringify$1;

var localStorage$1 = {exports: {}};

var hasRequiredLocalStorage;

function requireLocalStorage () {
	if (hasRequiredLocalStorage) return localStorage$1.exports;
	hasRequiredLocalStorage = 1;
	(function () {
	    let db;
	    function LocalStorage() { }
	    db = LocalStorage;
	    db.prototype.getItem = function (key) {
	        if (this.hasOwnProperty(key)) {
	            return String(this[key]);
	        }
	        return null;
	    };
	    db.prototype.setItem = function (key, val) {
	        this[key] = String(val);
	    };
	    db.prototype.removeItem = function (key) {
	        delete this[key];
	    };
	    db.prototype.clear = function () {
	        const self = this;
	        Object.keys(self).forEach(function (key) {
	            self[key] = undefined;
	            delete self[key];
	        });
	    };
	    db.prototype.key = function (i) {
	        i = i || 0;
	        return Object.keys(this)[i];
	    };
	    db.prototype.__defineGetter__("length", function () {
	        return Object.keys(this).length;
	    });
	    if (typeof commonjsGlobal !== "undefined" && commonjsGlobal.localStorage) {
	        localStorage$1.exports = commonjsGlobal.localStorage;
	    }
	    else if (typeof window !== "undefined" && window.localStorage) {
	        localStorage$1.exports = window.localStorage;
	    }
	    else {
	        localStorage$1.exports = new LocalStorage();
	    }
	})();
	
	return localStorage$1.exports;
}

var shared = {};

var types$2 = {};

var hasRequiredTypes$2;

function requireTypes$2 () {
	if (hasRequiredTypes$2) return types$2;
	hasRequiredTypes$2 = 1;
	Object.defineProperty(types$2, "__esModule", { value: true });
	types$2.IKeyValueStorage = void 0;
	class IKeyValueStorage {
	}
	types$2.IKeyValueStorage = IKeyValueStorage;
	
	return types$2;
}

var utils$2 = {};

var hasRequiredUtils$2;

function requireUtils$2 () {
	if (hasRequiredUtils$2) return utils$2;
	hasRequiredUtils$2 = 1;
	Object.defineProperty(utils$2, "__esModule", { value: true });
	utils$2.parseEntry = void 0;
	const safe_json_utils_1 = cjs$6;
	function parseEntry(entry) {
	    var _a;
	    return [entry[0], safe_json_utils_1.safeJsonParse((_a = entry[1]) !== null && _a !== void 0 ? _a : "")];
	}
	utils$2.parseEntry = parseEntry;
	
	return utils$2;
}

var hasRequiredShared;

function requireShared () {
	if (hasRequiredShared) return shared;
	hasRequiredShared = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$5;
		tslib_1.__exportStar(requireTypes$2(), exports);
		tslib_1.__exportStar(requireUtils$2(), exports);
		
	} (shared));
	return shared;
}

Object.defineProperty(browser$2, "__esModule", { value: true });
browser$2.KeyValueStorage = void 0;
const tslib_1 = require$$0$5;
const safe_json_utils_1 = cjs$6;
const localStorage_1 = tslib_1.__importDefault(requireLocalStorage());
const shared_1 = requireShared();
class KeyValueStorage {
    constructor() {
        this.localStorage = localStorage_1.default;
    }
    getKeys() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return Object.keys(this.localStorage);
        });
    }
    getEntries() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return Object.entries(this.localStorage).map(shared_1.parseEntry);
        });
    }
    getItem(key) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const item = this.localStorage.getItem(key);
            if (item === null) {
                return undefined;
            }
            return safe_json_utils_1.safeJsonParse(item);
        });
    }
    setItem(key, value) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.localStorage.setItem(key, safe_json_utils_1.safeJsonStringify(value));
        });
    }
    removeItem(key) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.localStorage.removeItem(key);
        });
    }
}
browser$2.KeyValueStorage = KeyValueStorage;
var _default = browser$2.default = KeyValueStorage;

var cjs$5 = {};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics$3 = function(d, b) {
    extendStatics$3 = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics$3(d, b);
};

function __extends$3(d, b) {
    extendStatics$3(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign$3 = function() {
    __assign$3 = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign$3.apply(this, arguments);
};

function __rest$3(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate$3(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param$3(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata$3(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter$3(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator$3(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding$3(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar$3(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values$3(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read$3(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread$3() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read$3(arguments[i]));
    return ar;
}

function __spreadArrays$3() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await$3(v) {
    return this instanceof __await$3 ? (this.v = v, this) : new __await$3(v);
}

function __asyncGenerator$3(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await$3 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator$3(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$3(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues$3(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values$3 === "function" ? __values$3(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject$3(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar$3(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault$3(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet$3(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet$3(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6$3 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get __assign () { return __assign$3; },
  __asyncDelegator: __asyncDelegator$3,
  __asyncGenerator: __asyncGenerator$3,
  __asyncValues: __asyncValues$3,
  __await: __await$3,
  __awaiter: __awaiter$3,
  __classPrivateFieldGet: __classPrivateFieldGet$3,
  __classPrivateFieldSet: __classPrivateFieldSet$3,
  __createBinding: __createBinding$3,
  __decorate: __decorate$3,
  __exportStar: __exportStar$3,
  __extends: __extends$3,
  __generator: __generator$3,
  __importDefault: __importDefault$3,
  __importStar: __importStar$3,
  __makeTemplateObject: __makeTemplateObject$3,
  __metadata: __metadata$3,
  __param: __param$3,
  __read: __read$3,
  __rest: __rest$3,
  __spread: __spread$3,
  __spreadArrays: __spreadArrays$3,
  __values: __values$3
});

var require$$0$4 = /*@__PURE__*/getAugmentedNamespace(tslib_es6$3);

var heartbeat$2 = {};

var require$$1$1 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_events);

var cjs$4 = {};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics$2 = function(d, b) {
    extendStatics$2 = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics$2(d, b);
};

function __extends$2(d, b) {
    extendStatics$2(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign$2 = function() {
    __assign$2 = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign$2.apply(this, arguments);
};

function __rest$2(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate$2(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param$2(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata$2(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter$2(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator$2(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding$2(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar$2(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values$2(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read$2(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread$2() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read$2(arguments[i]));
    return ar;
}

function __spreadArrays$2() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await$2(v) {
    return this instanceof __await$2 ? (this.v = v, this) : new __await$2(v);
}

function __asyncGenerator$2(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await$2 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator$2(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$2(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues$2(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values$2 === "function" ? __values$2(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject$2(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar$2(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault$2(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet$2(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet$2(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6$2 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get __assign () { return __assign$2; },
  __asyncDelegator: __asyncDelegator$2,
  __asyncGenerator: __asyncGenerator$2,
  __asyncValues: __asyncValues$2,
  __await: __await$2,
  __awaiter: __awaiter$2,
  __classPrivateFieldGet: __classPrivateFieldGet$2,
  __classPrivateFieldSet: __classPrivateFieldSet$2,
  __createBinding: __createBinding$2,
  __decorate: __decorate$2,
  __exportStar: __exportStar$2,
  __extends: __extends$2,
  __generator: __generator$2,
  __importDefault: __importDefault$2,
  __importStar: __importStar$2,
  __makeTemplateObject: __makeTemplateObject$2,
  __metadata: __metadata$2,
  __param: __param$2,
  __read: __read$2,
  __rest: __rest$2,
  __spread: __spread$2,
  __spreadArrays: __spreadArrays$2,
  __values: __values$2
});

var require$$0$3 = /*@__PURE__*/getAugmentedNamespace(tslib_es6$2);

var utils$1 = {};

var delay = {};

var hasRequiredDelay;

function requireDelay () {
	if (hasRequiredDelay) return delay;
	hasRequiredDelay = 1;
	Object.defineProperty(delay, "__esModule", { value: true });
	delay.delay = void 0;
	function delay$1(timeout) {
	    return new Promise(resolve => {
	        setTimeout(() => {
	            resolve(true);
	        }, timeout);
	    });
	}
	delay.delay = delay$1;
	
	return delay;
}

var convert = {};

var constants$2 = {};

var misc = {};

var hasRequiredMisc;

function requireMisc () {
	if (hasRequiredMisc) return misc;
	hasRequiredMisc = 1;
	Object.defineProperty(misc, "__esModule", { value: true });
	misc.ONE_THOUSAND = misc.ONE_HUNDRED = void 0;
	misc.ONE_HUNDRED = 100;
	misc.ONE_THOUSAND = 1000;
	
	return misc;
}

var time = {};

var hasRequiredTime;

function requireTime () {
	if (hasRequiredTime) return time;
	hasRequiredTime = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.ONE_YEAR = exports.FOUR_WEEKS = exports.THREE_WEEKS = exports.TWO_WEEKS = exports.ONE_WEEK = exports.THIRTY_DAYS = exports.SEVEN_DAYS = exports.FIVE_DAYS = exports.THREE_DAYS = exports.ONE_DAY = exports.TWENTY_FOUR_HOURS = exports.TWELVE_HOURS = exports.SIX_HOURS = exports.THREE_HOURS = exports.ONE_HOUR = exports.SIXTY_MINUTES = exports.THIRTY_MINUTES = exports.TEN_MINUTES = exports.FIVE_MINUTES = exports.ONE_MINUTE = exports.SIXTY_SECONDS = exports.THIRTY_SECONDS = exports.TEN_SECONDS = exports.FIVE_SECONDS = exports.ONE_SECOND = void 0;
		exports.ONE_SECOND = 1;
		exports.FIVE_SECONDS = 5;
		exports.TEN_SECONDS = 10;
		exports.THIRTY_SECONDS = 30;
		exports.SIXTY_SECONDS = 60;
		exports.ONE_MINUTE = exports.SIXTY_SECONDS;
		exports.FIVE_MINUTES = exports.ONE_MINUTE * 5;
		exports.TEN_MINUTES = exports.ONE_MINUTE * 10;
		exports.THIRTY_MINUTES = exports.ONE_MINUTE * 30;
		exports.SIXTY_MINUTES = exports.ONE_MINUTE * 60;
		exports.ONE_HOUR = exports.SIXTY_MINUTES;
		exports.THREE_HOURS = exports.ONE_HOUR * 3;
		exports.SIX_HOURS = exports.ONE_HOUR * 6;
		exports.TWELVE_HOURS = exports.ONE_HOUR * 12;
		exports.TWENTY_FOUR_HOURS = exports.ONE_HOUR * 24;
		exports.ONE_DAY = exports.TWENTY_FOUR_HOURS;
		exports.THREE_DAYS = exports.ONE_DAY * 3;
		exports.FIVE_DAYS = exports.ONE_DAY * 5;
		exports.SEVEN_DAYS = exports.ONE_DAY * 7;
		exports.THIRTY_DAYS = exports.ONE_DAY * 30;
		exports.ONE_WEEK = exports.SEVEN_DAYS;
		exports.TWO_WEEKS = exports.ONE_WEEK * 2;
		exports.THREE_WEEKS = exports.ONE_WEEK * 3;
		exports.FOUR_WEEKS = exports.ONE_WEEK * 4;
		exports.ONE_YEAR = exports.ONE_DAY * 365;
		
	} (time));
	return time;
}

var hasRequiredConstants$2;

function requireConstants$2 () {
	if (hasRequiredConstants$2) return constants$2;
	hasRequiredConstants$2 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$3;
		tslib_1.__exportStar(requireMisc(), exports);
		tslib_1.__exportStar(requireTime(), exports);
		
	} (constants$2));
	return constants$2;
}

var hasRequiredConvert;

function requireConvert () {
	if (hasRequiredConvert) return convert;
	hasRequiredConvert = 1;
	Object.defineProperty(convert, "__esModule", { value: true });
	convert.fromMiliseconds = convert.toMiliseconds = void 0;
	const constants_1 = requireConstants$2();
	function toMiliseconds(seconds) {
	    return seconds * constants_1.ONE_THOUSAND;
	}
	convert.toMiliseconds = toMiliseconds;
	function fromMiliseconds(miliseconds) {
	    return Math.floor(miliseconds / constants_1.ONE_THOUSAND);
	}
	convert.fromMiliseconds = fromMiliseconds;
	
	return convert;
}

var hasRequiredUtils$1;

function requireUtils$1 () {
	if (hasRequiredUtils$1) return utils$1;
	hasRequiredUtils$1 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$3;
		tslib_1.__exportStar(requireDelay(), exports);
		tslib_1.__exportStar(requireConvert(), exports);
		
	} (utils$1));
	return utils$1;
}

var watch$1 = {};

var hasRequiredWatch$1;

function requireWatch$1 () {
	if (hasRequiredWatch$1) return watch$1;
	hasRequiredWatch$1 = 1;
	Object.defineProperty(watch$1, "__esModule", { value: true });
	watch$1.Watch = void 0;
	class Watch {
	    constructor() {
	        this.timestamps = new Map();
	    }
	    start(label) {
	        if (this.timestamps.has(label)) {
	            throw new Error(`Watch already started for label: ${label}`);
	        }
	        this.timestamps.set(label, { started: Date.now() });
	    }
	    stop(label) {
	        const timestamp = this.get(label);
	        if (typeof timestamp.elapsed !== "undefined") {
	            throw new Error(`Watch already stopped for label: ${label}`);
	        }
	        const elapsed = Date.now() - timestamp.started;
	        this.timestamps.set(label, { started: timestamp.started, elapsed });
	    }
	    get(label) {
	        const timestamp = this.timestamps.get(label);
	        if (typeof timestamp === "undefined") {
	            throw new Error(`No timestamp found for label: ${label}`);
	        }
	        return timestamp;
	    }
	    elapsed(label) {
	        const timestamp = this.get(label);
	        const elapsed = timestamp.elapsed || Date.now() - timestamp.started;
	        return elapsed;
	    }
	}
	watch$1.Watch = Watch;
	watch$1.default = Watch;
	
	return watch$1;
}

var types$1 = {};

var watch = {};

var hasRequiredWatch;

function requireWatch () {
	if (hasRequiredWatch) return watch;
	hasRequiredWatch = 1;
	Object.defineProperty(watch, "__esModule", { value: true });
	watch.IWatch = void 0;
	class IWatch {
	}
	watch.IWatch = IWatch;
	
	return watch;
}

var hasRequiredTypes$1;

function requireTypes$1 () {
	if (hasRequiredTypes$1) return types$1;
	hasRequiredTypes$1 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$3;
		tslib_1.__exportStar(requireWatch(), exports);
		
	} (types$1));
	return types$1;
}

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = require$$0$3;
	tslib_1.__exportStar(requireUtils$1(), exports);
	tslib_1.__exportStar(requireWatch$1(), exports);
	tslib_1.__exportStar(requireTypes$1(), exports);
	tslib_1.__exportStar(requireConstants$2(), exports);
	
} (cjs$4));

var types = {};

var heartbeat$1 = {};

let IEvents$1 = class IEvents {
};

var esm = /*#__PURE__*/Object.freeze({
  __proto__: null,
  IEvents: IEvents$1
});

var require$$0$2 = /*@__PURE__*/getAugmentedNamespace(esm);

var hasRequiredHeartbeat$2;

function requireHeartbeat$2 () {
	if (hasRequiredHeartbeat$2) return heartbeat$1;
	hasRequiredHeartbeat$2 = 1;
	Object.defineProperty(heartbeat$1, "__esModule", { value: true });
	heartbeat$1.IHeartBeat = void 0;
	const events_1 = require$$0$2;
	class IHeartBeat extends events_1.IEvents {
	    constructor(opts) {
	        super();
	    }
	}
	heartbeat$1.IHeartBeat = IHeartBeat;
	
	return heartbeat$1;
}

var hasRequiredTypes;

function requireTypes () {
	if (hasRequiredTypes) return types;
	hasRequiredTypes = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$4;
		tslib_1.__exportStar(requireHeartbeat$2(), exports);
		
	} (types));
	return types;
}

var constants$1 = {};

var heartbeat = {};

var hasRequiredHeartbeat$1;

function requireHeartbeat$1 () {
	if (hasRequiredHeartbeat$1) return heartbeat;
	hasRequiredHeartbeat$1 = 1;
	Object.defineProperty(heartbeat, "__esModule", { value: true });
	heartbeat.HEARTBEAT_EVENTS = heartbeat.HEARTBEAT_INTERVAL = void 0;
	const time_1 = cjs$4;
	heartbeat.HEARTBEAT_INTERVAL = time_1.FIVE_SECONDS;
	heartbeat.HEARTBEAT_EVENTS = {
	    pulse: "heartbeat_pulse",
	};
	
	return heartbeat;
}

var hasRequiredConstants$1;

function requireConstants$1 () {
	if (hasRequiredConstants$1) return constants$1;
	hasRequiredConstants$1 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		const tslib_1 = require$$0$4;
		tslib_1.__exportStar(requireHeartbeat$1(), exports);
		
	} (constants$1));
	return constants$1;
}

var hasRequiredHeartbeat;

function requireHeartbeat () {
	if (hasRequiredHeartbeat) return heartbeat$2;
	hasRequiredHeartbeat = 1;
	Object.defineProperty(heartbeat$2, "__esModule", { value: true });
	heartbeat$2.HeartBeat = void 0;
	const tslib_1 = require$$0$4;
	const events_1 = require$$1$1;
	const time_1 = cjs$4;
	const types_1 = requireTypes();
	const constants_1 = requireConstants$1();
	class HeartBeat extends types_1.IHeartBeat {
	    constructor(opts) {
	        super(opts);
	        this.events = new events_1.EventEmitter();
	        this.interval = constants_1.HEARTBEAT_INTERVAL;
	        this.interval = (opts === null || opts === void 0 ? void 0 : opts.interval) || constants_1.HEARTBEAT_INTERVAL;
	    }
	    static init(opts) {
	        return tslib_1.__awaiter(this, void 0, void 0, function* () {
	            const heartbeat = new HeartBeat(opts);
	            yield heartbeat.init();
	            return heartbeat;
	        });
	    }
	    init() {
	        return tslib_1.__awaiter(this, void 0, void 0, function* () {
	            yield this.initialize();
	        });
	    }
	    stop() {
	        clearInterval(this.intervalRef);
	    }
	    on(event, listener) {
	        this.events.on(event, listener);
	    }
	    once(event, listener) {
	        this.events.once(event, listener);
	    }
	    off(event, listener) {
	        this.events.off(event, listener);
	    }
	    removeListener(event, listener) {
	        this.events.removeListener(event, listener);
	    }
	    initialize() {
	        return tslib_1.__awaiter(this, void 0, void 0, function* () {
	            this.intervalRef = setInterval(() => this.pulse(), time_1.toMiliseconds(this.interval));
	        });
	    }
	    pulse() {
	        this.events.emit(constants_1.HEARTBEAT_EVENTS.pulse);
	    }
	}
	heartbeat$2.HeartBeat = HeartBeat;
	
	return heartbeat$2;
}

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = require$$0$4;
	tslib_1.__exportStar(requireHeartbeat(), exports);
	tslib_1.__exportStar(requireTypes(), exports);
	tslib_1.__exportStar(requireConstants$1(), exports);
	
} (cjs$5));

var cjs$3 = {};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics$1 = function(d, b) {
    extendStatics$1 = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics$1(d, b);
};

function __extends$1(d, b) {
    extendStatics$1(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign$1 = function() {
    __assign$1 = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign$1.apply(this, arguments);
};

function __rest$1(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate$1(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param$1(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata$1(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter$1(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator$1(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding$1(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar$1(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values$1(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read$1(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread$1() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read$1(arguments[i]));
    return ar;
}

function __spreadArrays$1() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await$1(v) {
    return this instanceof __await$1 ? (this.v = v, this) : new __await$1(v);
}

function __asyncGenerator$1(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await$1 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator$1(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$1(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues$1(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values$1 === "function" ? __values$1(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject$1(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar$1(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault$1(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet$1(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet$1(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get __assign () { return __assign$1; },
  __asyncDelegator: __asyncDelegator$1,
  __asyncGenerator: __asyncGenerator$1,
  __asyncValues: __asyncValues$1,
  __await: __await$1,
  __awaiter: __awaiter$1,
  __classPrivateFieldGet: __classPrivateFieldGet$1,
  __classPrivateFieldSet: __classPrivateFieldSet$1,
  __createBinding: __createBinding$1,
  __decorate: __decorate$1,
  __exportStar: __exportStar$1,
  __extends: __extends$1,
  __generator: __generator$1,
  __importDefault: __importDefault$1,
  __importStar: __importStar$1,
  __makeTemplateObject: __makeTemplateObject$1,
  __metadata: __metadata$1,
  __param: __param$1,
  __read: __read$1,
  __rest: __rest$1,
  __spread: __spread$1,
  __spreadArrays: __spreadArrays$1,
  __values: __values$1
});

var require$$0$1 = /*@__PURE__*/getAugmentedNamespace(tslib_es6$1);

var quickFormatUnescaped;
var hasRequiredQuickFormatUnescaped;

function requireQuickFormatUnescaped () {
	if (hasRequiredQuickFormatUnescaped) return quickFormatUnescaped;
	hasRequiredQuickFormatUnescaped = 1;
	function tryStringify (o) {
	  try { return JSON.stringify(o) } catch(e) { return '"[Circular]"' }
	}

	quickFormatUnescaped = format;

	function format(f, args, opts) {
	  var ss = (opts && opts.stringify) || tryStringify;
	  var offset = 1;
	  if (typeof f === 'object' && f !== null) {
	    var len = args.length + offset;
	    if (len === 1) return f
	    var objects = new Array(len);
	    objects[0] = ss(f);
	    for (var index = 1; index < len; index++) {
	      objects[index] = ss(args[index]);
	    }
	    return objects.join(' ')
	  }
	  if (typeof f !== 'string') {
	    return f
	  }
	  var argLen = args.length;
	  if (argLen === 0) return f
	  var str = '';
	  var a = 1 - offset;
	  var lastPos = -1;
	  var flen = (f && f.length) || 0;
	  for (var i = 0; i < flen;) {
	    if (f.charCodeAt(i) === 37 && i + 1 < flen) {
	      lastPos = lastPos > -1 ? lastPos : 0;
	      switch (f.charCodeAt(i + 1)) {
	        case 100: // 'd'
	        case 102: // 'f'
	          if (a >= argLen)
	            break
	          if (args[a] == null)  break
	          if (lastPos < i)
	            str += f.slice(lastPos, i);
	          str += Number(args[a]);
	          lastPos = i + 2;
	          i++;
	          break
	        case 105: // 'i'
	          if (a >= argLen)
	            break
	          if (args[a] == null)  break
	          if (lastPos < i)
	            str += f.slice(lastPos, i);
	          str += Math.floor(Number(args[a]));
	          lastPos = i + 2;
	          i++;
	          break
	        case 79: // 'O'
	        case 111: // 'o'
	        case 106: // 'j'
	          if (a >= argLen)
	            break
	          if (args[a] === undefined) break
	          if (lastPos < i)
	            str += f.slice(lastPos, i);
	          var type = typeof args[a];
	          if (type === 'string') {
	            str += '\'' + args[a] + '\'';
	            lastPos = i + 2;
	            i++;
	            break
	          }
	          if (type === 'function') {
	            str += args[a].name || '<anonymous>';
	            lastPos = i + 2;
	            i++;
	            break
	          }
	          str += ss(args[a]);
	          lastPos = i + 2;
	          i++;
	          break
	        case 115: // 's'
	          if (a >= argLen)
	            break
	          if (lastPos < i)
	            str += f.slice(lastPos, i);
	          str += String(args[a]);
	          lastPos = i + 2;
	          i++;
	          break
	        case 37: // '%'
	          if (lastPos < i)
	            str += f.slice(lastPos, i);
	          str += '%';
	          lastPos = i + 2;
	          i++;
	          a--;
	          break
	      }
	      ++a;
	    }
	    ++i;
	  }
	  if (lastPos === -1)
	    return f
	  else if (lastPos < flen) {
	    str += f.slice(lastPos);
	  }

	  return str
	}
	return quickFormatUnescaped;
}

var browser$1;
var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser$1;
	hasRequiredBrowser = 1;

	const format = requireQuickFormatUnescaped();

	browser$1 = pino;

	const _console = pfGlobalThisOrFallback().console || {};
	const stdSerializers = {
	  mapHttpRequest: mock,
	  mapHttpResponse: mock,
	  wrapRequestSerializer: passthrough,
	  wrapResponseSerializer: passthrough,
	  wrapErrorSerializer: passthrough,
	  req: mock,
	  res: mock,
	  err: asErrValue
	};

	function shouldSerialize (serialize, serializers) {
	  if (Array.isArray(serialize)) {
	    const hasToFilter = serialize.filter(function (k) {
	      return k !== '!stdSerializers.err'
	    });
	    return hasToFilter
	  } else if (serialize === true) {
	    return Object.keys(serializers)
	  }

	  return false
	}

	function pino (opts) {
	  opts = opts || {};
	  opts.browser = opts.browser || {};

	  const transmit = opts.browser.transmit;
	  if (transmit && typeof transmit.send !== 'function') { throw Error('pino: transmit option must have a send function') }

	  const proto = opts.browser.write || _console;
	  if (opts.browser.write) opts.browser.asObject = true;
	  const serializers = opts.serializers || {};
	  const serialize = shouldSerialize(opts.browser.serialize, serializers);
	  let stdErrSerialize = opts.browser.serialize;

	  if (
	    Array.isArray(opts.browser.serialize) &&
	    opts.browser.serialize.indexOf('!stdSerializers.err') > -1
	  ) stdErrSerialize = false;

	  const levels = ['error', 'fatal', 'warn', 'info', 'debug', 'trace'];

	  if (typeof proto === 'function') {
	    proto.error = proto.fatal = proto.warn =
	    proto.info = proto.debug = proto.trace = proto;
	  }
	  if (opts.enabled === false) opts.level = 'silent';
	  const level = opts.level || 'info';
	  const logger = Object.create(proto);
	  if (!logger.log) logger.log = noop;

	  Object.defineProperty(logger, 'levelVal', {
	    get: getLevelVal
	  });
	  Object.defineProperty(logger, 'level', {
	    get: getLevel,
	    set: setLevel
	  });

	  const setOpts = {
	    transmit,
	    serialize,
	    asObject: opts.browser.asObject,
	    levels,
	    timestamp: getTimeFunction(opts)
	  };
	  logger.levels = pino.levels;
	  logger.level = level;

	  logger.setMaxListeners = logger.getMaxListeners =
	  logger.emit = logger.addListener = logger.on =
	  logger.prependListener = logger.once =
	  logger.prependOnceListener = logger.removeListener =
	  logger.removeAllListeners = logger.listeners =
	  logger.listenerCount = logger.eventNames =
	  logger.write = logger.flush = noop;
	  logger.serializers = serializers;
	  logger._serialize = serialize;
	  logger._stdErrSerialize = stdErrSerialize;
	  logger.child = child;

	  if (transmit) logger._logEvent = createLogEventShape();

	  function getLevelVal () {
	    return this.level === 'silent'
	      ? Infinity
	      : this.levels.values[this.level]
	  }

	  function getLevel () {
	    return this._level
	  }
	  function setLevel (level) {
	    if (level !== 'silent' && !this.levels.values[level]) {
	      throw Error('unknown level ' + level)
	    }
	    this._level = level;

	    set(setOpts, logger, 'error', 'log'); // <-- must stay first
	    set(setOpts, logger, 'fatal', 'error');
	    set(setOpts, logger, 'warn', 'error');
	    set(setOpts, logger, 'info', 'log');
	    set(setOpts, logger, 'debug', 'log');
	    set(setOpts, logger, 'trace', 'log');
	  }

	  function child (bindings, childOptions) {
	    if (!bindings) {
	      throw new Error('missing bindings for child Pino')
	    }
	    childOptions = childOptions || {};
	    if (serialize && bindings.serializers) {
	      childOptions.serializers = bindings.serializers;
	    }
	    const childOptionsSerializers = childOptions.serializers;
	    if (serialize && childOptionsSerializers) {
	      var childSerializers = Object.assign({}, serializers, childOptionsSerializers);
	      var childSerialize = opts.browser.serialize === true
	        ? Object.keys(childSerializers)
	        : serialize;
	      delete bindings.serializers;
	      applySerializers([bindings], childSerialize, childSerializers, this._stdErrSerialize);
	    }
	    function Child (parent) {
	      this._childLevel = (parent._childLevel | 0) + 1;
	      this.error = bind(parent, bindings, 'error');
	      this.fatal = bind(parent, bindings, 'fatal');
	      this.warn = bind(parent, bindings, 'warn');
	      this.info = bind(parent, bindings, 'info');
	      this.debug = bind(parent, bindings, 'debug');
	      this.trace = bind(parent, bindings, 'trace');
	      if (childSerializers) {
	        this.serializers = childSerializers;
	        this._serialize = childSerialize;
	      }
	      if (transmit) {
	        this._logEvent = createLogEventShape(
	          [].concat(parent._logEvent.bindings, bindings)
	        );
	      }
	    }
	    Child.prototype = this;
	    return new Child(this)
	  }
	  return logger
	}

	pino.levels = {
	  values: {
	    fatal: 60,
	    error: 50,
	    warn: 40,
	    info: 30,
	    debug: 20,
	    trace: 10
	  },
	  labels: {
	    10: 'trace',
	    20: 'debug',
	    30: 'info',
	    40: 'warn',
	    50: 'error',
	    60: 'fatal'
	  }
	};

	pino.stdSerializers = stdSerializers;
	pino.stdTimeFunctions = Object.assign({}, { nullTime, epochTime, unixTime, isoTime });

	function set (opts, logger, level, fallback) {
	  const proto = Object.getPrototypeOf(logger);
	  logger[level] = logger.levelVal > logger.levels.values[level]
	    ? noop
	    : (proto[level] ? proto[level] : (_console[level] || _console[fallback] || noop));

	  wrap(opts, logger, level);
	}

	function wrap (opts, logger, level) {
	  if (!opts.transmit && logger[level] === noop) return

	  logger[level] = (function (write) {
	    return function LOG () {
	      const ts = opts.timestamp();
	      const args = new Array(arguments.length);
	      const proto = (Object.getPrototypeOf && Object.getPrototypeOf(this) === _console) ? _console : this;
	      for (var i = 0; i < args.length; i++) args[i] = arguments[i];

	      if (opts.serialize && !opts.asObject) {
	        applySerializers(args, this._serialize, this.serializers, this._stdErrSerialize);
	      }
	      if (opts.asObject) write.call(proto, asObject(this, level, args, ts));
	      else write.apply(proto, args);

	      if (opts.transmit) {
	        const transmitLevel = opts.transmit.level || logger.level;
	        const transmitValue = pino.levels.values[transmitLevel];
	        const methodValue = pino.levels.values[level];
	        if (methodValue < transmitValue) return
	        transmit(this, {
	          ts,
	          methodLevel: level,
	          methodValue,
	          transmitLevel,
	          transmitValue: pino.levels.values[opts.transmit.level || logger.level],
	          send: opts.transmit.send,
	          val: logger.levelVal
	        }, args);
	      }
	    }
	  })(logger[level]);
	}

	function asObject (logger, level, args, ts) {
	  if (logger._serialize) applySerializers(args, logger._serialize, logger.serializers, logger._stdErrSerialize);
	  const argsCloned = args.slice();
	  let msg = argsCloned[0];
	  const o = {};
	  if (ts) {
	    o.time = ts;
	  }
	  o.level = pino.levels.values[level];
	  let lvl = (logger._childLevel | 0) + 1;
	  if (lvl < 1) lvl = 1;
	  // deliberate, catching objects, arrays
	  if (msg !== null && typeof msg === 'object') {
	    while (lvl-- && typeof argsCloned[0] === 'object') {
	      Object.assign(o, argsCloned.shift());
	    }
	    msg = argsCloned.length ? format(argsCloned.shift(), argsCloned) : undefined;
	  } else if (typeof msg === 'string') msg = format(argsCloned.shift(), argsCloned);
	  if (msg !== undefined) o.msg = msg;
	  return o
	}

	function applySerializers (args, serialize, serializers, stdErrSerialize) {
	  for (const i in args) {
	    if (stdErrSerialize && args[i] instanceof Error) {
	      args[i] = pino.stdSerializers.err(args[i]);
	    } else if (typeof args[i] === 'object' && !Array.isArray(args[i])) {
	      for (const k in args[i]) {
	        if (serialize && serialize.indexOf(k) > -1 && k in serializers) {
	          args[i][k] = serializers[k](args[i][k]);
	        }
	      }
	    }
	  }
	}

	function bind (parent, bindings, level) {
	  return function () {
	    const args = new Array(1 + arguments.length);
	    args[0] = bindings;
	    for (var i = 1; i < args.length; i++) {
	      args[i] = arguments[i - 1];
	    }
	    return parent[level].apply(this, args)
	  }
	}

	function transmit (logger, opts, args) {
	  const send = opts.send;
	  const ts = opts.ts;
	  const methodLevel = opts.methodLevel;
	  const methodValue = opts.methodValue;
	  const val = opts.val;
	  const bindings = logger._logEvent.bindings;

	  applySerializers(
	    args,
	    logger._serialize || Object.keys(logger.serializers),
	    logger.serializers,
	    logger._stdErrSerialize === undefined ? true : logger._stdErrSerialize
	  );
	  logger._logEvent.ts = ts;
	  logger._logEvent.messages = args.filter(function (arg) {
	    // bindings can only be objects, so reference equality check via indexOf is fine
	    return bindings.indexOf(arg) === -1
	  });

	  logger._logEvent.level.label = methodLevel;
	  logger._logEvent.level.value = methodValue;

	  send(methodLevel, logger._logEvent, val);

	  logger._logEvent = createLogEventShape(bindings);
	}

	function createLogEventShape (bindings) {
	  return {
	    ts: 0,
	    messages: [],
	    bindings: bindings || [],
	    level: { label: '', value: 0 }
	  }
	}

	function asErrValue (err) {
	  const obj = {
	    type: err.constructor.name,
	    msg: err.message,
	    stack: err.stack
	  };
	  for (const key in err) {
	    if (obj[key] === undefined) {
	      obj[key] = err[key];
	    }
	  }
	  return obj
	}

	function getTimeFunction (opts) {
	  if (typeof opts.timestamp === 'function') {
	    return opts.timestamp
	  }
	  if (opts.timestamp === false) {
	    return nullTime
	  }
	  return epochTime
	}

	function mock () { return {} }
	function passthrough (a) { return a }
	function noop () {}

	function nullTime () { return false }
	function epochTime () { return Date.now() }
	function unixTime () { return Math.round(Date.now() / 1000.0) }
	function isoTime () { return new Date(Date.now()).toISOString() } // using Date.now() for testability

	/* eslint-disable */
	/* istanbul ignore next */
	function pfGlobalThisOrFallback () {
	  function defd (o) { return typeof o !== 'undefined' && o }
	  try {
	    if (typeof globalThis !== 'undefined') return globalThis
	    Object.defineProperty(Object.prototype, 'globalThis', {
	      get: function () {
	        delete Object.prototype.globalThis;
	        return (this.globalThis = this)
	      },
	      configurable: true
	    });
	    return globalThis
	  } catch (e) {
	    return defd(self) || defd(window) || defd(this) || {}
	  }
	}
	/* eslint-enable */
	return browser$1;
}

var constants = {};

var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;
	Object.defineProperty(constants, "__esModule", { value: true });
	constants.PINO_CUSTOM_CONTEXT_KEY = constants.PINO_LOGGER_DEFAULTS = void 0;
	constants.PINO_LOGGER_DEFAULTS = {
	    level: "info",
	};
	constants.PINO_CUSTOM_CONTEXT_KEY = "custom_context";
	
	return constants;
}

var utils = {};

var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;
	Object.defineProperty(utils, "__esModule", { value: true });
	utils.generateChildLogger = utils.formatChildLoggerContext = utils.getLoggerContext = utils.setBrowserLoggerContext = utils.getBrowserLoggerContext = utils.getDefaultLoggerOptions = void 0;
	const constants_1 = requireConstants();
	function getDefaultLoggerOptions(opts) {
	    return Object.assign(Object.assign({}, opts), { level: (opts === null || opts === void 0 ? void 0 : opts.level) || constants_1.PINO_LOGGER_DEFAULTS.level });
	}
	utils.getDefaultLoggerOptions = getDefaultLoggerOptions;
	function getBrowserLoggerContext(logger, customContextKey = constants_1.PINO_CUSTOM_CONTEXT_KEY) {
	    return logger[customContextKey] || "";
	}
	utils.getBrowserLoggerContext = getBrowserLoggerContext;
	function setBrowserLoggerContext(logger, context, customContextKey = constants_1.PINO_CUSTOM_CONTEXT_KEY) {
	    logger[customContextKey] = context;
	    return logger;
	}
	utils.setBrowserLoggerContext = setBrowserLoggerContext;
	function getLoggerContext(logger, customContextKey = constants_1.PINO_CUSTOM_CONTEXT_KEY) {
	    let context = "";
	    if (typeof logger.bindings === "undefined") {
	        context = getBrowserLoggerContext(logger, customContextKey);
	    }
	    else {
	        context = logger.bindings().context || "";
	    }
	    return context;
	}
	utils.getLoggerContext = getLoggerContext;
	function formatChildLoggerContext(logger, childContext, customContextKey = constants_1.PINO_CUSTOM_CONTEXT_KEY) {
	    const parentContext = getLoggerContext(logger, customContextKey);
	    const context = parentContext.trim()
	        ? `${parentContext}/${childContext}`
	        : childContext;
	    return context;
	}
	utils.formatChildLoggerContext = formatChildLoggerContext;
	function generateChildLogger(logger, childContext, customContextKey = constants_1.PINO_CUSTOM_CONTEXT_KEY) {
	    const context = formatChildLoggerContext(logger, childContext, customContextKey);
	    const child = logger.child({ context });
	    return setBrowserLoggerContext(child, context, customContextKey);
	}
	utils.generateChildLogger = generateChildLogger;
	
	return utils;
}

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.pino = void 0;
	const tslib_1 = require$$0$1;
	const pino_1 = tslib_1.__importDefault(requireBrowser());
	Object.defineProperty(exports, "pino", { enumerable: true, get: function () { return pino_1.default; } });
	tslib_1.__exportStar(requireConstants(), exports);
	tslib_1.__exportStar(requireUtils(), exports);
	
} (cjs$3));

class n extends IEvents$1{constructor(s){super(),this.opts=s,this.protocol="wc",this.version=2;}}let h$1 = class h extends IEvents$1{constructor(s,t){super(),this.core=s,this.logger=t,this.records=new Map;}};class a{constructor(s,t){this.logger=s,this.core=t;}}class u extends IEvents$1{constructor(s,t){super(),this.relayer=s,this.logger=t;}}let g$2 = class g extends IEvents$1{constructor(s){super();}};let p$1 = class p{constructor(s,t,o,w){this.core=s,this.logger=t,this.name=o;}};class d extends IEvents$1{constructor(s,t){super(),this.relayer=s,this.logger=t;}}let E$1 = class E extends IEvents$1{constructor(s,t){super(),this.core=s,this.logger=t;}};class y{constructor(s,t){this.projectId=s,this.logger=t;}}let b$1 = class b{constructor(s){this.opts=s,this.protocol="wc",this.version=2;}};class S{constructor(s){this.client=s;}}

const JSONStringify = data => JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() + "n" : value);
const JSONParse = json => {
    const numbersBiggerThanMaxInt = /([\[:])?(\d{17,}|(?:[9](?:[1-9]07199254740991|0[1-9]7199254740991|00[8-9]199254740991|007[2-9]99254740991|007199[3-9]54740991|0071992[6-9]4740991|00719925[5-9]740991|007199254[8-9]40991|0071992547[5-9]0991|00719925474[1-9]991|00719925474099[2-9])))([,\}\]])/g;
    const serializedData = json.replace(numbersBiggerThanMaxInt, "$1\"$2n\"$3");
    return JSON.parse(serializedData, (_, value) => {
        const isCustomFormatBigInt = typeof value === "string" && value.match(/^\d+n$/);
        if (isCustomFormatBigInt)
            return BigInt(value.substring(0, value.length - 1));
        return value;
    });
};
function safeJsonParse(value) {
    if (typeof value !== "string") {
        throw new Error(`Cannot safe json parse value of type ${typeof value}`);
    }
    try {
        return JSONParse(value);
    }
    catch (_a) {
        return value;
    }
}
function safeJsonStringify(value) {
    return typeof value === "string" ? value : JSONStringify(value) || "";
}

var ed25519 = {};

var random = {};

var system = {};

var browser = {};

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(browser, "__esModule", { value: true });
browser.BrowserRandomSource = void 0;
const QUOTA = 65536;
class BrowserRandomSource {
    constructor() {
        this.isAvailable = false;
        this.isInstantiated = false;
        const browserCrypto = typeof self !== 'undefined'
            ? (self.crypto || self.msCrypto) // IE11 has msCrypto
            : null;
        if (browserCrypto && browserCrypto.getRandomValues !== undefined) {
            this._crypto = browserCrypto;
            this.isAvailable = true;
            this.isInstantiated = true;
        }
    }
    randomBytes(length) {
        if (!this.isAvailable || !this._crypto) {
            throw new Error("Browser random byte generator is not available.");
        }
        const out = new Uint8Array(length);
        for (let i = 0; i < out.length; i += QUOTA) {
            this._crypto.getRandomValues(out.subarray(i, i + Math.min(out.length - i, QUOTA)));
        }
        return out;
    }
}
browser.BrowserRandomSource = BrowserRandomSource;

function commonjsRequire(path) {
	throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}

var node = {};

var wipe$1 = {};

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(wipe$1, "__esModule", { value: true });
/**
 * Sets all values in the given array to zero and returns it.
 *
 * The fact that it sets bytes to zero can be relied on.
 *
 * There is no guarantee that this function makes data disappear from memory,
 * as runtime implementation can, for example, have copying garbage collector
 * that will make copies of sensitive data before we wipe it. Or that an
 * operating system will write our data to swap or sleep image. Another thing
 * is that an optimizing compiler can remove calls to this function or make it
 * no-op. There's nothing we can do with it, so we just do our best and hope
 * that everything will be okay and good will triumph over evil.
 */
function wipe(array) {
    // Right now it's similar to array.fill(0). If it turns
    // out that runtimes optimize this call away, maybe
    // we can try something else.
    for (var i = 0; i < array.length; i++) {
        array[i] = 0;
    }
    return array;
}
wipe$1.wipe = wipe;

var crypto$2 = {};

var _polyfillNode_crypto = /*#__PURE__*/Object.freeze({
  __proto__: null,
  default: crypto$2
});

var require$$1 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_crypto);

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(node, "__esModule", { value: true });
node.NodeRandomSource = void 0;
const wipe_1$3 = wipe$1;
class NodeRandomSource {
    constructor() {
        this.isAvailable = false;
        this.isInstantiated = false;
        if (typeof commonjsRequire !== "undefined") {
            const nodeCrypto = require$$1;
            if (nodeCrypto && nodeCrypto.randomBytes) {
                this._crypto = nodeCrypto;
                this.isAvailable = true;
                this.isInstantiated = true;
            }
        }
    }
    randomBytes(length) {
        if (!this.isAvailable || !this._crypto) {
            throw new Error("Node.js random byte generator is not available.");
        }
        // Get random bytes (result is Buffer).
        let buffer = this._crypto.randomBytes(length);
        // Make sure we got the length that we requested.
        if (buffer.length !== length) {
            throw new Error("NodeRandomSource: got fewer bytes than requested");
        }
        // Allocate output array.
        const out = new Uint8Array(length);
        // Copy bytes from buffer to output.
        for (let i = 0; i < out.length; i++) {
            out[i] = buffer[i];
        }
        // Cleanup.
        (0, wipe_1$3.wipe)(buffer);
        return out;
    }
}
node.NodeRandomSource = NodeRandomSource;

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(system, "__esModule", { value: true });
system.SystemRandomSource = void 0;
const browser_1 = browser;
const node_1 = node;
class SystemRandomSource {
    constructor() {
        this.isAvailable = false;
        this.name = "";
        // Try browser.
        this._source = new browser_1.BrowserRandomSource();
        if (this._source.isAvailable) {
            this.isAvailable = true;
            this.name = "Browser";
            return;
        }
        // If no browser source, try Node.
        this._source = new node_1.NodeRandomSource();
        if (this._source.isAvailable) {
            this.isAvailable = true;
            this.name = "Node";
            return;
        }
        // No sources, we're out of options.
    }
    randomBytes(length) {
        if (!this.isAvailable) {
            throw new Error("System random byte generator is not available.");
        }
        return this._source.randomBytes(length);
    }
}
system.SystemRandomSource = SystemRandomSource;

var binary = {};

var int = {};

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	/**
	 * Package int provides helper functions for integerss.
	 */
	// Shim using 16-bit pieces.
	function imulShim(a, b) {
	    var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
	    var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
	    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
	}
	/** 32-bit integer multiplication.  */
	// Use system Math.imul if available, otherwise use our shim.
	exports.mul = Math.imul || imulShim;
	/** 32-bit integer addition.  */
	function add(a, b) {
	    return (a + b) | 0;
	}
	exports.add = add;
	/**  32-bit integer subtraction.  */
	function sub(a, b) {
	    return (a - b) | 0;
	}
	exports.sub = sub;
	/** 32-bit integer left rotation */
	function rotl(x, n) {
	    return x << n | x >>> (32 - n);
	}
	exports.rotl = rotl;
	/** 32-bit integer left rotation */
	function rotr(x, n) {
	    return x << (32 - n) | x >>> n;
	}
	exports.rotr = rotr;
	function isIntegerShim(n) {
	    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
	}
	/**
	 * Returns true if the argument is an integer number.
	 *
	 * In ES2015, Number.isInteger.
	 */
	exports.isInteger = Number.isInteger || isIntegerShim;
	/**
	 *  Math.pow(2, 53) - 1
	 *
	 *  In ES2015 Number.MAX_SAFE_INTEGER.
	 */
	exports.MAX_SAFE_INTEGER = 9007199254740991;
	/**
	 * Returns true if the argument is a safe integer number
	 * (-MIN_SAFE_INTEGER < number <= MAX_SAFE_INTEGER)
	 *
	 * In ES2015, Number.isSafeInteger.
	 */
	exports.isSafeInteger = function (n) {
	    return exports.isInteger(n) && (n >= -exports.MAX_SAFE_INTEGER && n <= exports.MAX_SAFE_INTEGER);
	};
	
} (int));

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(binary, "__esModule", { value: true });
/**
 * Package binary provides functions for encoding and decoding numbers in byte arrays.
 */
var int_1 = int;
// TODO(dchest): add asserts for correct value ranges and array offsets.
/**
 * Reads 2 bytes from array starting at offset as big-endian
 * signed 16-bit integer and returns it.
 */
function readInt16BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return (((array[offset + 0] << 8) | array[offset + 1]) << 16) >> 16;
}
binary.readInt16BE = readInt16BE;
/**
 * Reads 2 bytes from array starting at offset as big-endian
 * unsigned 16-bit integer and returns it.
 */
function readUint16BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return ((array[offset + 0] << 8) | array[offset + 1]) >>> 0;
}
binary.readUint16BE = readUint16BE;
/**
 * Reads 2 bytes from array starting at offset as little-endian
 * signed 16-bit integer and returns it.
 */
function readInt16LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return (((array[offset + 1] << 8) | array[offset]) << 16) >> 16;
}
binary.readInt16LE = readInt16LE;
/**
 * Reads 2 bytes from array starting at offset as little-endian
 * unsigned 16-bit integer and returns it.
 */
function readUint16LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return ((array[offset + 1] << 8) | array[offset]) >>> 0;
}
binary.readUint16LE = readUint16LE;
/**
 * Writes 2-byte big-endian representation of 16-bit unsigned
 * value to byte array starting at offset.
 *
 * If byte array is not given, creates a new 2-byte one.
 *
 * Returns the output byte array.
 */
function writeUint16BE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(2); }
    if (offset === void 0) { offset = 0; }
    out[offset + 0] = value >>> 8;
    out[offset + 1] = value >>> 0;
    return out;
}
binary.writeUint16BE = writeUint16BE;
binary.writeInt16BE = writeUint16BE;
/**
 * Writes 2-byte little-endian representation of 16-bit unsigned
 * value to array starting at offset.
 *
 * If byte array is not given, creates a new 2-byte one.
 *
 * Returns the output byte array.
 */
function writeUint16LE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(2); }
    if (offset === void 0) { offset = 0; }
    out[offset + 0] = value >>> 0;
    out[offset + 1] = value >>> 8;
    return out;
}
binary.writeUint16LE = writeUint16LE;
binary.writeInt16LE = writeUint16LE;
/**
 * Reads 4 bytes from array starting at offset as big-endian
 * signed 32-bit integer and returns it.
 */
function readInt32BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return (array[offset] << 24) |
        (array[offset + 1] << 16) |
        (array[offset + 2] << 8) |
        array[offset + 3];
}
binary.readInt32BE = readInt32BE;
/**
 * Reads 4 bytes from array starting at offset as big-endian
 * unsigned 32-bit integer and returns it.
 */
function readUint32BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return ((array[offset] << 24) |
        (array[offset + 1] << 16) |
        (array[offset + 2] << 8) |
        array[offset + 3]) >>> 0;
}
binary.readUint32BE = readUint32BE;
/**
 * Reads 4 bytes from array starting at offset as little-endian
 * signed 32-bit integer and returns it.
 */
function readInt32LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return (array[offset + 3] << 24) |
        (array[offset + 2] << 16) |
        (array[offset + 1] << 8) |
        array[offset];
}
binary.readInt32LE = readInt32LE;
/**
 * Reads 4 bytes from array starting at offset as little-endian
 * unsigned 32-bit integer and returns it.
 */
function readUint32LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    return ((array[offset + 3] << 24) |
        (array[offset + 2] << 16) |
        (array[offset + 1] << 8) |
        array[offset]) >>> 0;
}
binary.readUint32LE = readUint32LE;
/**
 * Writes 4-byte big-endian representation of 32-bit unsigned
 * value to byte array starting at offset.
 *
 * If byte array is not given, creates a new 4-byte one.
 *
 * Returns the output byte array.
 */
function writeUint32BE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(4); }
    if (offset === void 0) { offset = 0; }
    out[offset + 0] = value >>> 24;
    out[offset + 1] = value >>> 16;
    out[offset + 2] = value >>> 8;
    out[offset + 3] = value >>> 0;
    return out;
}
binary.writeUint32BE = writeUint32BE;
binary.writeInt32BE = writeUint32BE;
/**
 * Writes 4-byte little-endian representation of 32-bit unsigned
 * value to array starting at offset.
 *
 * If byte array is not given, creates a new 4-byte one.
 *
 * Returns the output byte array.
 */
function writeUint32LE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(4); }
    if (offset === void 0) { offset = 0; }
    out[offset + 0] = value >>> 0;
    out[offset + 1] = value >>> 8;
    out[offset + 2] = value >>> 16;
    out[offset + 3] = value >>> 24;
    return out;
}
binary.writeUint32LE = writeUint32LE;
binary.writeInt32LE = writeUint32LE;
/**
 * Reads 8 bytes from array starting at offset as big-endian
 * signed 64-bit integer and returns it.
 *
 * IMPORTANT: due to JavaScript limitation, supports exact
 * numbers in range -9007199254740991 to 9007199254740991.
 * If the number stored in the byte array is outside this range,
 * the result is not exact.
 */
function readInt64BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var hi = readInt32BE(array, offset);
    var lo = readInt32BE(array, offset + 4);
    return hi * 0x100000000 + lo - ((lo >> 31) * 0x100000000);
}
binary.readInt64BE = readInt64BE;
/**
 * Reads 8 bytes from array starting at offset as big-endian
 * unsigned 64-bit integer and returns it.
 *
 * IMPORTANT: due to JavaScript limitation, supports values up to 2^53-1.
 */
function readUint64BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var hi = readUint32BE(array, offset);
    var lo = readUint32BE(array, offset + 4);
    return hi * 0x100000000 + lo;
}
binary.readUint64BE = readUint64BE;
/**
 * Reads 8 bytes from array starting at offset as little-endian
 * signed 64-bit integer and returns it.
 *
 * IMPORTANT: due to JavaScript limitation, supports exact
 * numbers in range -9007199254740991 to 9007199254740991.
 * If the number stored in the byte array is outside this range,
 * the result is not exact.
 */
function readInt64LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var lo = readInt32LE(array, offset);
    var hi = readInt32LE(array, offset + 4);
    return hi * 0x100000000 + lo - ((lo >> 31) * 0x100000000);
}
binary.readInt64LE = readInt64LE;
/**
 * Reads 8 bytes from array starting at offset as little-endian
 * unsigned 64-bit integer and returns it.
 *
 * IMPORTANT: due to JavaScript limitation, supports values up to 2^53-1.
 */
function readUint64LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var lo = readUint32LE(array, offset);
    var hi = readUint32LE(array, offset + 4);
    return hi * 0x100000000 + lo;
}
binary.readUint64LE = readUint64LE;
/**
 * Writes 8-byte big-endian representation of 64-bit unsigned
 * value to byte array starting at offset.
 *
 * Due to JavaScript limitation, supports values up to 2^53-1.
 *
 * If byte array is not given, creates a new 8-byte one.
 *
 * Returns the output byte array.
 */
function writeUint64BE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(8); }
    if (offset === void 0) { offset = 0; }
    writeUint32BE(value / 0x100000000 >>> 0, out, offset);
    writeUint32BE(value >>> 0, out, offset + 4);
    return out;
}
binary.writeUint64BE = writeUint64BE;
binary.writeInt64BE = writeUint64BE;
/**
 * Writes 8-byte little-endian representation of 64-bit unsigned
 * value to byte array starting at offset.
 *
 * Due to JavaScript limitation, supports values up to 2^53-1.
 *
 * If byte array is not given, creates a new 8-byte one.
 *
 * Returns the output byte array.
 */
function writeUint64LE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(8); }
    if (offset === void 0) { offset = 0; }
    writeUint32LE(value >>> 0, out, offset);
    writeUint32LE(value / 0x100000000 >>> 0, out, offset + 4);
    return out;
}
binary.writeUint64LE = writeUint64LE;
binary.writeInt64LE = writeUint64LE;
/**
 * Reads bytes from array starting at offset as big-endian
 * unsigned bitLen-bit integer and returns it.
 *
 * Supports bit lengths divisible by 8, up to 48.
 */
function readUintBE(bitLength, array, offset) {
    if (offset === void 0) { offset = 0; }
    // TODO(dchest): implement support for bitLengths non-divisible by 8
    if (bitLength % 8 !== 0) {
        throw new Error("readUintBE supports only bitLengths divisible by 8");
    }
    if (bitLength / 8 > array.length - offset) {
        throw new Error("readUintBE: array is too short for the given bitLength");
    }
    var result = 0;
    var mul = 1;
    for (var i = bitLength / 8 + offset - 1; i >= offset; i--) {
        result += array[i] * mul;
        mul *= 256;
    }
    return result;
}
binary.readUintBE = readUintBE;
/**
 * Reads bytes from array starting at offset as little-endian
 * unsigned bitLen-bit integer and returns it.
 *
 * Supports bit lengths divisible by 8, up to 48.
 */
function readUintLE(bitLength, array, offset) {
    if (offset === void 0) { offset = 0; }
    // TODO(dchest): implement support for bitLengths non-divisible by 8
    if (bitLength % 8 !== 0) {
        throw new Error("readUintLE supports only bitLengths divisible by 8");
    }
    if (bitLength / 8 > array.length - offset) {
        throw new Error("readUintLE: array is too short for the given bitLength");
    }
    var result = 0;
    var mul = 1;
    for (var i = offset; i < offset + bitLength / 8; i++) {
        result += array[i] * mul;
        mul *= 256;
    }
    return result;
}
binary.readUintLE = readUintLE;
/**
 * Writes a big-endian representation of bitLen-bit unsigned
 * value to array starting at offset.
 *
 * Supports bit lengths divisible by 8, up to 48.
 *
 * If byte array is not given, creates a new one.
 *
 * Returns the output byte array.
 */
function writeUintBE(bitLength, value, out, offset) {
    if (out === void 0) { out = new Uint8Array(bitLength / 8); }
    if (offset === void 0) { offset = 0; }
    // TODO(dchest): implement support for bitLengths non-divisible by 8
    if (bitLength % 8 !== 0) {
        throw new Error("writeUintBE supports only bitLengths divisible by 8");
    }
    if (!int_1.isSafeInteger(value)) {
        throw new Error("writeUintBE value must be an integer");
    }
    var div = 1;
    for (var i = bitLength / 8 + offset - 1; i >= offset; i--) {
        out[i] = (value / div) & 0xff;
        div *= 256;
    }
    return out;
}
binary.writeUintBE = writeUintBE;
/**
 * Writes a little-endian representation of bitLen-bit unsigned
 * value to array starting at offset.
 *
 * Supports bit lengths divisible by 8, up to 48.
 *
 * If byte array is not given, creates a new one.
 *
 * Returns the output byte array.
 */
function writeUintLE(bitLength, value, out, offset) {
    if (out === void 0) { out = new Uint8Array(bitLength / 8); }
    if (offset === void 0) { offset = 0; }
    // TODO(dchest): implement support for bitLengths non-divisible by 8
    if (bitLength % 8 !== 0) {
        throw new Error("writeUintLE supports only bitLengths divisible by 8");
    }
    if (!int_1.isSafeInteger(value)) {
        throw new Error("writeUintLE value must be an integer");
    }
    var div = 1;
    for (var i = offset; i < offset + bitLength / 8; i++) {
        out[i] = (value / div) & 0xff;
        div *= 256;
    }
    return out;
}
binary.writeUintLE = writeUintLE;
/**
 * Reads 4 bytes from array starting at offset as big-endian
 * 32-bit floating-point number and returns it.
 */
function readFloat32BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var view = new DataView(array.buffer, array.byteOffset, array.byteLength);
    return view.getFloat32(offset);
}
binary.readFloat32BE = readFloat32BE;
/**
 * Reads 4 bytes from array starting at offset as little-endian
 * 32-bit floating-point number and returns it.
 */
function readFloat32LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var view = new DataView(array.buffer, array.byteOffset, array.byteLength);
    return view.getFloat32(offset, true);
}
binary.readFloat32LE = readFloat32LE;
/**
 * Reads 8 bytes from array starting at offset as big-endian
 * 64-bit floating-point number ("double") and returns it.
 */
function readFloat64BE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var view = new DataView(array.buffer, array.byteOffset, array.byteLength);
    return view.getFloat64(offset);
}
binary.readFloat64BE = readFloat64BE;
/**
 * Reads 8 bytes from array starting at offset as little-endian
 * 64-bit floating-point number ("double") and returns it.
 */
function readFloat64LE(array, offset) {
    if (offset === void 0) { offset = 0; }
    var view = new DataView(array.buffer, array.byteOffset, array.byteLength);
    return view.getFloat64(offset, true);
}
binary.readFloat64LE = readFloat64LE;
/**
 * Writes 4-byte big-endian floating-point representation of value
 * to byte array starting at offset.
 *
 * If byte array is not given, creates a new 4-byte one.
 *
 * Returns the output byte array.
 */
function writeFloat32BE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(4); }
    if (offset === void 0) { offset = 0; }
    var view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setFloat32(offset, value);
    return out;
}
binary.writeFloat32BE = writeFloat32BE;
/**
 * Writes 4-byte little-endian floating-point representation of value
 * to byte array starting at offset.
 *
 * If byte array is not given, creates a new 4-byte one.
 *
 * Returns the output byte array.
 */
function writeFloat32LE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(4); }
    if (offset === void 0) { offset = 0; }
    var view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setFloat32(offset, value, true);
    return out;
}
binary.writeFloat32LE = writeFloat32LE;
/**
 * Writes 8-byte big-endian floating-point representation of value
 * to byte array starting at offset.
 *
 * If byte array is not given, creates a new 8-byte one.
 *
 * Returns the output byte array.
 */
function writeFloat64BE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(8); }
    if (offset === void 0) { offset = 0; }
    var view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setFloat64(offset, value);
    return out;
}
binary.writeFloat64BE = writeFloat64BE;
/**
 * Writes 8-byte little-endian floating-point representation of value
 * to byte array starting at offset.
 *
 * If byte array is not given, creates a new 8-byte one.
 *
 * Returns the output byte array.
 */
function writeFloat64LE(value, out, offset) {
    if (out === void 0) { out = new Uint8Array(8); }
    if (offset === void 0) { offset = 0; }
    var view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setFloat64(offset, value, true);
    return out;
}
binary.writeFloat64LE = writeFloat64LE;

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.randomStringForEntropy = exports.randomString = exports.randomUint32 = exports.randomBytes = exports.defaultRandomSource = void 0;
	const system_1 = system;
	const binary_1 = binary;
	const wipe_1 = wipe$1;
	exports.defaultRandomSource = new system_1.SystemRandomSource();
	function randomBytes(length, prng = exports.defaultRandomSource) {
	    return prng.randomBytes(length);
	}
	exports.randomBytes = randomBytes;
	/**
	 * Returns a uniformly random unsigned 32-bit integer.
	 */
	function randomUint32(prng = exports.defaultRandomSource) {
	    // Generate 4-byte random buffer.
	    const buf = randomBytes(4, prng);
	    // Convert bytes from buffer into a 32-bit integer.
	    // It's not important which byte order to use, since
	    // the result is random.
	    const result = (0, binary_1.readUint32LE)(buf);
	    // Clean the buffer.
	    (0, wipe_1.wipe)(buf);
	    return result;
	}
	exports.randomUint32 = randomUint32;
	/** 62 alphanumeric characters for default charset of randomString() */
	const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	/**
	 * Returns a uniform random string of the given length
	 * with characters from the given charset.
	 *
	 * Charset must not have more than 256 characters.
	 *
	 * Default charset generates case-sensitive alphanumeric
	 * strings (0-9, A-Z, a-z).
	 */
	function randomString(length, charset = ALPHANUMERIC, prng = exports.defaultRandomSource) {
	    if (charset.length < 2) {
	        throw new Error("randomString charset is too short");
	    }
	    if (charset.length > 256) {
	        throw new Error("randomString charset is too long");
	    }
	    let out = '';
	    const charsLen = charset.length;
	    const maxByte = 256 - (256 % charsLen);
	    while (length > 0) {
	        const buf = randomBytes(Math.ceil(length * 256 / maxByte), prng);
	        for (let i = 0; i < buf.length && length > 0; i++) {
	            const randomByte = buf[i];
	            if (randomByte < maxByte) {
	                out += charset.charAt(randomByte % charsLen);
	                length--;
	            }
	        }
	        (0, wipe_1.wipe)(buf);
	    }
	    return out;
	}
	exports.randomString = randomString;
	/**
	 * Returns uniform random string containing at least the given
	 * number of bits of entropy.
	 *
	 * For example, randomStringForEntropy(128) will return a 22-character
	 * alphanumeric string, while randomStringForEntropy(128, "0123456789")
	 * will return a 39-character numeric string, both will contain at
	 * least 128 bits of entropy.
	 *
	 * Default charset generates case-sensitive alphanumeric
	 * strings (0-9, A-Z, a-z).
	 */
	function randomStringForEntropy(bits, charset = ALPHANUMERIC, prng = exports.defaultRandomSource) {
	    const length = Math.ceil(bits / (Math.log(charset.length) / Math.LN2));
	    return randomString(length, charset, prng);
	}
	exports.randomStringForEntropy = randomStringForEntropy;
	
} (random));

var sha512 = {};

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	var binary_1 = binary;
	var wipe_1 = wipe$1;
	exports.DIGEST_LENGTH = 64;
	exports.BLOCK_SIZE = 128;
	/**
	 * SHA-2-512 cryptographic hash algorithm.
	 */
	var SHA512 = /** @class */ (function () {
	    function SHA512() {
	        /** Length of hash output */
	        this.digestLength = exports.DIGEST_LENGTH;
	        /** Block size */
	        this.blockSize = exports.BLOCK_SIZE;
	        // Note: Int32Array is used instead of Uint32Array for performance reasons.
	        this._stateHi = new Int32Array(8); // hash state, high bytes
	        this._stateLo = new Int32Array(8); // hash state, low bytes
	        this._tempHi = new Int32Array(16); // temporary state, high bytes
	        this._tempLo = new Int32Array(16); // temporary state, low bytes
	        this._buffer = new Uint8Array(256); // buffer for data to hash
	        this._bufferLength = 0; // number of bytes in buffer
	        this._bytesHashed = 0; // number of total bytes hashed
	        this._finished = false; // indicates whether the hash was finalized
	        this.reset();
	    }
	    SHA512.prototype._initState = function () {
	        this._stateHi[0] = 0x6a09e667;
	        this._stateHi[1] = 0xbb67ae85;
	        this._stateHi[2] = 0x3c6ef372;
	        this._stateHi[3] = 0xa54ff53a;
	        this._stateHi[4] = 0x510e527f;
	        this._stateHi[5] = 0x9b05688c;
	        this._stateHi[6] = 0x1f83d9ab;
	        this._stateHi[7] = 0x5be0cd19;
	        this._stateLo[0] = 0xf3bcc908;
	        this._stateLo[1] = 0x84caa73b;
	        this._stateLo[2] = 0xfe94f82b;
	        this._stateLo[3] = 0x5f1d36f1;
	        this._stateLo[4] = 0xade682d1;
	        this._stateLo[5] = 0x2b3e6c1f;
	        this._stateLo[6] = 0xfb41bd6b;
	        this._stateLo[7] = 0x137e2179;
	    };
	    /**
	     * Resets hash state making it possible
	     * to re-use this instance to hash other data.
	     */
	    SHA512.prototype.reset = function () {
	        this._initState();
	        this._bufferLength = 0;
	        this._bytesHashed = 0;
	        this._finished = false;
	        return this;
	    };
	    /**
	     * Cleans internal buffers and resets hash state.
	     */
	    SHA512.prototype.clean = function () {
	        wipe_1.wipe(this._buffer);
	        wipe_1.wipe(this._tempHi);
	        wipe_1.wipe(this._tempLo);
	        this.reset();
	    };
	    /**
	     * Updates hash state with the given data.
	     *
	     * Throws error when trying to update already finalized hash:
	     * instance must be reset to update it again.
	     */
	    SHA512.prototype.update = function (data, dataLength) {
	        if (dataLength === void 0) { dataLength = data.length; }
	        if (this._finished) {
	            throw new Error("SHA512: can't update because hash was finished.");
	        }
	        var dataPos = 0;
	        this._bytesHashed += dataLength;
	        if (this._bufferLength > 0) {
	            while (this._bufferLength < exports.BLOCK_SIZE && dataLength > 0) {
	                this._buffer[this._bufferLength++] = data[dataPos++];
	                dataLength--;
	            }
	            if (this._bufferLength === this.blockSize) {
	                hashBlocks(this._tempHi, this._tempLo, this._stateHi, this._stateLo, this._buffer, 0, this.blockSize);
	                this._bufferLength = 0;
	            }
	        }
	        if (dataLength >= this.blockSize) {
	            dataPos = hashBlocks(this._tempHi, this._tempLo, this._stateHi, this._stateLo, data, dataPos, dataLength);
	            dataLength %= this.blockSize;
	        }
	        while (dataLength > 0) {
	            this._buffer[this._bufferLength++] = data[dataPos++];
	            dataLength--;
	        }
	        return this;
	    };
	    /**
	     * Finalizes hash state and puts hash into out.
	     * If hash was already finalized, puts the same value.
	     */
	    SHA512.prototype.finish = function (out) {
	        if (!this._finished) {
	            var bytesHashed = this._bytesHashed;
	            var left = this._bufferLength;
	            var bitLenHi = (bytesHashed / 0x20000000) | 0;
	            var bitLenLo = bytesHashed << 3;
	            var padLength = (bytesHashed % 128 < 112) ? 128 : 256;
	            this._buffer[left] = 0x80;
	            for (var i = left + 1; i < padLength - 8; i++) {
	                this._buffer[i] = 0;
	            }
	            binary_1.writeUint32BE(bitLenHi, this._buffer, padLength - 8);
	            binary_1.writeUint32BE(bitLenLo, this._buffer, padLength - 4);
	            hashBlocks(this._tempHi, this._tempLo, this._stateHi, this._stateLo, this._buffer, 0, padLength);
	            this._finished = true;
	        }
	        for (var i = 0; i < this.digestLength / 8; i++) {
	            binary_1.writeUint32BE(this._stateHi[i], out, i * 8);
	            binary_1.writeUint32BE(this._stateLo[i], out, i * 8 + 4);
	        }
	        return this;
	    };
	    /**
	     * Returns the final hash digest.
	     */
	    SHA512.prototype.digest = function () {
	        var out = new Uint8Array(this.digestLength);
	        this.finish(out);
	        return out;
	    };
	    /**
	     * Function useful for HMAC/PBKDF2 optimization. Returns hash state to be
	     * used with restoreState(). Only chain value is saved, not buffers or
	     * other state variables.
	     */
	    SHA512.prototype.saveState = function () {
	        if (this._finished) {
	            throw new Error("SHA256: cannot save finished state");
	        }
	        return {
	            stateHi: new Int32Array(this._stateHi),
	            stateLo: new Int32Array(this._stateLo),
	            buffer: this._bufferLength > 0 ? new Uint8Array(this._buffer) : undefined,
	            bufferLength: this._bufferLength,
	            bytesHashed: this._bytesHashed
	        };
	    };
	    /**
	     * Function useful for HMAC/PBKDF2 optimization. Restores state saved by
	     * saveState() and sets bytesHashed to the given value.
	     */
	    SHA512.prototype.restoreState = function (savedState) {
	        this._stateHi.set(savedState.stateHi);
	        this._stateLo.set(savedState.stateLo);
	        this._bufferLength = savedState.bufferLength;
	        if (savedState.buffer) {
	            this._buffer.set(savedState.buffer);
	        }
	        this._bytesHashed = savedState.bytesHashed;
	        this._finished = false;
	        return this;
	    };
	    /**
	     * Cleans state returned by saveState().
	     */
	    SHA512.prototype.cleanSavedState = function (savedState) {
	        wipe_1.wipe(savedState.stateHi);
	        wipe_1.wipe(savedState.stateLo);
	        if (savedState.buffer) {
	            wipe_1.wipe(savedState.buffer);
	        }
	        savedState.bufferLength = 0;
	        savedState.bytesHashed = 0;
	    };
	    return SHA512;
	}());
	exports.SHA512 = SHA512;
	// Constants
	var K = new Int32Array([
	    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
	    0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
	    0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
	    0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
	    0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
	    0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
	    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
	    0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
	    0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
	    0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
	    0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
	    0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
	    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
	    0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
	    0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
	    0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
	    0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
	    0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
	    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
	    0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
	    0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
	    0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
	    0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
	    0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
	    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
	    0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
	    0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
	    0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
	    0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
	    0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
	    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
	    0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
	    0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
	    0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
	    0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
	    0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
	    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
	    0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
	    0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
	    0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
	]);
	function hashBlocks(wh, wl, hh, hl, m, pos, len) {
	    var ah0 = hh[0], ah1 = hh[1], ah2 = hh[2], ah3 = hh[3], ah4 = hh[4], ah5 = hh[5], ah6 = hh[6], ah7 = hh[7], al0 = hl[0], al1 = hl[1], al2 = hl[2], al3 = hl[3], al4 = hl[4], al5 = hl[5], al6 = hl[6], al7 = hl[7];
	    var h, l;
	    var th, tl;
	    var a, b, c, d;
	    while (len >= 128) {
	        for (var i = 0; i < 16; i++) {
	            var j = 8 * i + pos;
	            wh[i] = binary_1.readUint32BE(m, j);
	            wl[i] = binary_1.readUint32BE(m, j + 4);
	        }
	        for (var i = 0; i < 80; i++) {
	            var bh0 = ah0;
	            var bh1 = ah1;
	            var bh2 = ah2;
	            var bh3 = ah3;
	            var bh4 = ah4;
	            var bh5 = ah5;
	            var bh6 = ah6;
	            var bh7 = ah7;
	            var bl0 = al0;
	            var bl1 = al1;
	            var bl2 = al2;
	            var bl3 = al3;
	            var bl4 = al4;
	            var bl5 = al5;
	            var bl6 = al6;
	            var bl7 = al7;
	            // add
	            h = ah7;
	            l = al7;
	            a = l & 0xffff;
	            b = l >>> 16;
	            c = h & 0xffff;
	            d = h >>> 16;
	            // Sigma1
	            h = ((ah4 >>> 14) | (al4 << (32 - 14))) ^ ((ah4 >>> 18) |
	                (al4 << (32 - 18))) ^ ((al4 >>> (41 - 32)) | (ah4 << (32 - (41 - 32))));
	            l = ((al4 >>> 14) | (ah4 << (32 - 14))) ^ ((al4 >>> 18) |
	                (ah4 << (32 - 18))) ^ ((ah4 >>> (41 - 32)) | (al4 << (32 - (41 - 32))));
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            // Ch
	            h = (ah4 & ah5) ^ (~ah4 & ah6);
	            l = (al4 & al5) ^ (~al4 & al6);
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            // K
	            h = K[i * 2];
	            l = K[i * 2 + 1];
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            // w
	            h = wh[i % 16];
	            l = wl[i % 16];
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            b += a >>> 16;
	            c += b >>> 16;
	            d += c >>> 16;
	            th = c & 0xffff | d << 16;
	            tl = a & 0xffff | b << 16;
	            // add
	            h = th;
	            l = tl;
	            a = l & 0xffff;
	            b = l >>> 16;
	            c = h & 0xffff;
	            d = h >>> 16;
	            // Sigma0
	            h = ((ah0 >>> 28) | (al0 << (32 - 28))) ^ ((al0 >>> (34 - 32)) |
	                (ah0 << (32 - (34 - 32)))) ^ ((al0 >>> (39 - 32)) | (ah0 << (32 - (39 - 32))));
	            l = ((al0 >>> 28) | (ah0 << (32 - 28))) ^ ((ah0 >>> (34 - 32)) |
	                (al0 << (32 - (34 - 32)))) ^ ((ah0 >>> (39 - 32)) | (al0 << (32 - (39 - 32))));
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            // Maj
	            h = (ah0 & ah1) ^ (ah0 & ah2) ^ (ah1 & ah2);
	            l = (al0 & al1) ^ (al0 & al2) ^ (al1 & al2);
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            b += a >>> 16;
	            c += b >>> 16;
	            d += c >>> 16;
	            bh7 = (c & 0xffff) | (d << 16);
	            bl7 = (a & 0xffff) | (b << 16);
	            // add
	            h = bh3;
	            l = bl3;
	            a = l & 0xffff;
	            b = l >>> 16;
	            c = h & 0xffff;
	            d = h >>> 16;
	            h = th;
	            l = tl;
	            a += l & 0xffff;
	            b += l >>> 16;
	            c += h & 0xffff;
	            d += h >>> 16;
	            b += a >>> 16;
	            c += b >>> 16;
	            d += c >>> 16;
	            bh3 = (c & 0xffff) | (d << 16);
	            bl3 = (a & 0xffff) | (b << 16);
	            ah1 = bh0;
	            ah2 = bh1;
	            ah3 = bh2;
	            ah4 = bh3;
	            ah5 = bh4;
	            ah6 = bh5;
	            ah7 = bh6;
	            ah0 = bh7;
	            al1 = bl0;
	            al2 = bl1;
	            al3 = bl2;
	            al4 = bl3;
	            al5 = bl4;
	            al6 = bl5;
	            al7 = bl6;
	            al0 = bl7;
	            if (i % 16 === 15) {
	                for (var j = 0; j < 16; j++) {
	                    // add
	                    h = wh[j];
	                    l = wl[j];
	                    a = l & 0xffff;
	                    b = l >>> 16;
	                    c = h & 0xffff;
	                    d = h >>> 16;
	                    h = wh[(j + 9) % 16];
	                    l = wl[(j + 9) % 16];
	                    a += l & 0xffff;
	                    b += l >>> 16;
	                    c += h & 0xffff;
	                    d += h >>> 16;
	                    // sigma0
	                    th = wh[(j + 1) % 16];
	                    tl = wl[(j + 1) % 16];
	                    h = ((th >>> 1) | (tl << (32 - 1))) ^ ((th >>> 8) |
	                        (tl << (32 - 8))) ^ (th >>> 7);
	                    l = ((tl >>> 1) | (th << (32 - 1))) ^ ((tl >>> 8) |
	                        (th << (32 - 8))) ^ ((tl >>> 7) | (th << (32 - 7)));
	                    a += l & 0xffff;
	                    b += l >>> 16;
	                    c += h & 0xffff;
	                    d += h >>> 16;
	                    // sigma1
	                    th = wh[(j + 14) % 16];
	                    tl = wl[(j + 14) % 16];
	                    h = ((th >>> 19) | (tl << (32 - 19))) ^ ((tl >>> (61 - 32)) |
	                        (th << (32 - (61 - 32)))) ^ (th >>> 6);
	                    l = ((tl >>> 19) | (th << (32 - 19))) ^ ((th >>> (61 - 32)) |
	                        (tl << (32 - (61 - 32)))) ^ ((tl >>> 6) | (th << (32 - 6)));
	                    a += l & 0xffff;
	                    b += l >>> 16;
	                    c += h & 0xffff;
	                    d += h >>> 16;
	                    b += a >>> 16;
	                    c += b >>> 16;
	                    d += c >>> 16;
	                    wh[j] = (c & 0xffff) | (d << 16);
	                    wl[j] = (a & 0xffff) | (b << 16);
	                }
	            }
	        }
	        // add
	        h = ah0;
	        l = al0;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[0];
	        l = hl[0];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[0] = ah0 = (c & 0xffff) | (d << 16);
	        hl[0] = al0 = (a & 0xffff) | (b << 16);
	        h = ah1;
	        l = al1;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[1];
	        l = hl[1];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[1] = ah1 = (c & 0xffff) | (d << 16);
	        hl[1] = al1 = (a & 0xffff) | (b << 16);
	        h = ah2;
	        l = al2;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[2];
	        l = hl[2];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[2] = ah2 = (c & 0xffff) | (d << 16);
	        hl[2] = al2 = (a & 0xffff) | (b << 16);
	        h = ah3;
	        l = al3;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[3];
	        l = hl[3];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[3] = ah3 = (c & 0xffff) | (d << 16);
	        hl[3] = al3 = (a & 0xffff) | (b << 16);
	        h = ah4;
	        l = al4;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[4];
	        l = hl[4];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[4] = ah4 = (c & 0xffff) | (d << 16);
	        hl[4] = al4 = (a & 0xffff) | (b << 16);
	        h = ah5;
	        l = al5;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[5];
	        l = hl[5];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[5] = ah5 = (c & 0xffff) | (d << 16);
	        hl[5] = al5 = (a & 0xffff) | (b << 16);
	        h = ah6;
	        l = al6;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[6];
	        l = hl[6];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[6] = ah6 = (c & 0xffff) | (d << 16);
	        hl[6] = al6 = (a & 0xffff) | (b << 16);
	        h = ah7;
	        l = al7;
	        a = l & 0xffff;
	        b = l >>> 16;
	        c = h & 0xffff;
	        d = h >>> 16;
	        h = hh[7];
	        l = hl[7];
	        a += l & 0xffff;
	        b += l >>> 16;
	        c += h & 0xffff;
	        d += h >>> 16;
	        b += a >>> 16;
	        c += b >>> 16;
	        d += c >>> 16;
	        hh[7] = ah7 = (c & 0xffff) | (d << 16);
	        hl[7] = al7 = (a & 0xffff) | (b << 16);
	        pos += 128;
	        len -= 128;
	    }
	    return pos;
	}
	function hash(data) {
	    var h = new SHA512();
	    h.update(data);
	    var digest = h.digest();
	    h.clean();
	    return digest;
	}
	exports.hash = hash;
	
} (sha512));

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.convertSecretKeyToX25519 = exports.convertPublicKeyToX25519 = exports.verify = exports.sign = exports.extractPublicKeyFromSecretKey = exports.generateKeyPair = exports.generateKeyPairFromSeed = exports.SEED_LENGTH = exports.SECRET_KEY_LENGTH = exports.PUBLIC_KEY_LENGTH = exports.SIGNATURE_LENGTH = void 0;
	/**
	 * Package ed25519 implements Ed25519 public-key signature algorithm.
	 */
	const random_1 = random;
	const sha512_1 = sha512;
	const wipe_1 = wipe$1;
	exports.SIGNATURE_LENGTH = 64;
	exports.PUBLIC_KEY_LENGTH = 32;
	exports.SECRET_KEY_LENGTH = 64;
	exports.SEED_LENGTH = 32;
	// Returns new zero-filled 16-element GF (Float64Array).
	// If passed an array of numbers, prefills the returned
	// array with them.
	//
	// We use Float64Array, because we need 48-bit numbers
	// for this implementation.
	function gf(init) {
	    const r = new Float64Array(16);
	    if (init) {
	        for (let i = 0; i < init.length; i++) {
	            r[i] = init[i];
	        }
	    }
	    return r;
	}
	// Base point.
	const _9 = new Uint8Array(32);
	_9[0] = 9;
	const gf0 = gf();
	const gf1 = gf([1]);
	const D = gf([
	    0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070,
	    0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203
	]);
	const D2 = gf([
	    0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0,
	    0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406
	]);
	const X = gf([
	    0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c,
	    0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169
	]);
	const Y = gf([
	    0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
	    0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666
	]);
	const I = gf([
	    0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43,
	    0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83
	]);
	function set25519(r, a) {
	    for (let i = 0; i < 16; i++) {
	        r[i] = a[i] | 0;
	    }
	}
	function car25519(o) {
	    let c = 1;
	    for (let i = 0; i < 16; i++) {
	        let v = o[i] + c + 65535;
	        c = Math.floor(v / 65536);
	        o[i] = v - c * 65536;
	    }
	    o[0] += c - 1 + 37 * (c - 1);
	}
	function sel25519(p, q, b) {
	    const c = ~(b - 1);
	    for (let i = 0; i < 16; i++) {
	        const t = c & (p[i] ^ q[i]);
	        p[i] ^= t;
	        q[i] ^= t;
	    }
	}
	function pack25519(o, n) {
	    const m = gf();
	    const t = gf();
	    for (let i = 0; i < 16; i++) {
	        t[i] = n[i];
	    }
	    car25519(t);
	    car25519(t);
	    car25519(t);
	    for (let j = 0; j < 2; j++) {
	        m[0] = t[0] - 0xffed;
	        for (let i = 1; i < 15; i++) {
	            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
	            m[i - 1] &= 0xffff;
	        }
	        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
	        const b = (m[15] >> 16) & 1;
	        m[14] &= 0xffff;
	        sel25519(t, m, 1 - b);
	    }
	    for (let i = 0; i < 16; i++) {
	        o[2 * i] = t[i] & 0xff;
	        o[2 * i + 1] = t[i] >> 8;
	    }
	}
	function verify32(x, y) {
	    let d = 0;
	    for (let i = 0; i < 32; i++) {
	        d |= x[i] ^ y[i];
	    }
	    return (1 & ((d - 1) >>> 8)) - 1;
	}
	function neq25519(a, b) {
	    const c = new Uint8Array(32);
	    const d = new Uint8Array(32);
	    pack25519(c, a);
	    pack25519(d, b);
	    return verify32(c, d);
	}
	function par25519(a) {
	    const d = new Uint8Array(32);
	    pack25519(d, a);
	    return d[0] & 1;
	}
	function unpack25519(o, n) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = n[2 * i] + (n[2 * i + 1] << 8);
	    }
	    o[15] &= 0x7fff;
	}
	function add(o, a, b) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = a[i] + b[i];
	    }
	}
	function sub(o, a, b) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = a[i] - b[i];
	    }
	}
	function mul(o, a, b) {
	    let v, c, t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0, t8 = 0, t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0, t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0, t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0, b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
	    v = a[0];
	    t0 += v * b0;
	    t1 += v * b1;
	    t2 += v * b2;
	    t3 += v * b3;
	    t4 += v * b4;
	    t5 += v * b5;
	    t6 += v * b6;
	    t7 += v * b7;
	    t8 += v * b8;
	    t9 += v * b9;
	    t10 += v * b10;
	    t11 += v * b11;
	    t12 += v * b12;
	    t13 += v * b13;
	    t14 += v * b14;
	    t15 += v * b15;
	    v = a[1];
	    t1 += v * b0;
	    t2 += v * b1;
	    t3 += v * b2;
	    t4 += v * b3;
	    t5 += v * b4;
	    t6 += v * b5;
	    t7 += v * b6;
	    t8 += v * b7;
	    t9 += v * b8;
	    t10 += v * b9;
	    t11 += v * b10;
	    t12 += v * b11;
	    t13 += v * b12;
	    t14 += v * b13;
	    t15 += v * b14;
	    t16 += v * b15;
	    v = a[2];
	    t2 += v * b0;
	    t3 += v * b1;
	    t4 += v * b2;
	    t5 += v * b3;
	    t6 += v * b4;
	    t7 += v * b5;
	    t8 += v * b6;
	    t9 += v * b7;
	    t10 += v * b8;
	    t11 += v * b9;
	    t12 += v * b10;
	    t13 += v * b11;
	    t14 += v * b12;
	    t15 += v * b13;
	    t16 += v * b14;
	    t17 += v * b15;
	    v = a[3];
	    t3 += v * b0;
	    t4 += v * b1;
	    t5 += v * b2;
	    t6 += v * b3;
	    t7 += v * b4;
	    t8 += v * b5;
	    t9 += v * b6;
	    t10 += v * b7;
	    t11 += v * b8;
	    t12 += v * b9;
	    t13 += v * b10;
	    t14 += v * b11;
	    t15 += v * b12;
	    t16 += v * b13;
	    t17 += v * b14;
	    t18 += v * b15;
	    v = a[4];
	    t4 += v * b0;
	    t5 += v * b1;
	    t6 += v * b2;
	    t7 += v * b3;
	    t8 += v * b4;
	    t9 += v * b5;
	    t10 += v * b6;
	    t11 += v * b7;
	    t12 += v * b8;
	    t13 += v * b9;
	    t14 += v * b10;
	    t15 += v * b11;
	    t16 += v * b12;
	    t17 += v * b13;
	    t18 += v * b14;
	    t19 += v * b15;
	    v = a[5];
	    t5 += v * b0;
	    t6 += v * b1;
	    t7 += v * b2;
	    t8 += v * b3;
	    t9 += v * b4;
	    t10 += v * b5;
	    t11 += v * b6;
	    t12 += v * b7;
	    t13 += v * b8;
	    t14 += v * b9;
	    t15 += v * b10;
	    t16 += v * b11;
	    t17 += v * b12;
	    t18 += v * b13;
	    t19 += v * b14;
	    t20 += v * b15;
	    v = a[6];
	    t6 += v * b0;
	    t7 += v * b1;
	    t8 += v * b2;
	    t9 += v * b3;
	    t10 += v * b4;
	    t11 += v * b5;
	    t12 += v * b6;
	    t13 += v * b7;
	    t14 += v * b8;
	    t15 += v * b9;
	    t16 += v * b10;
	    t17 += v * b11;
	    t18 += v * b12;
	    t19 += v * b13;
	    t20 += v * b14;
	    t21 += v * b15;
	    v = a[7];
	    t7 += v * b0;
	    t8 += v * b1;
	    t9 += v * b2;
	    t10 += v * b3;
	    t11 += v * b4;
	    t12 += v * b5;
	    t13 += v * b6;
	    t14 += v * b7;
	    t15 += v * b8;
	    t16 += v * b9;
	    t17 += v * b10;
	    t18 += v * b11;
	    t19 += v * b12;
	    t20 += v * b13;
	    t21 += v * b14;
	    t22 += v * b15;
	    v = a[8];
	    t8 += v * b0;
	    t9 += v * b1;
	    t10 += v * b2;
	    t11 += v * b3;
	    t12 += v * b4;
	    t13 += v * b5;
	    t14 += v * b6;
	    t15 += v * b7;
	    t16 += v * b8;
	    t17 += v * b9;
	    t18 += v * b10;
	    t19 += v * b11;
	    t20 += v * b12;
	    t21 += v * b13;
	    t22 += v * b14;
	    t23 += v * b15;
	    v = a[9];
	    t9 += v * b0;
	    t10 += v * b1;
	    t11 += v * b2;
	    t12 += v * b3;
	    t13 += v * b4;
	    t14 += v * b5;
	    t15 += v * b6;
	    t16 += v * b7;
	    t17 += v * b8;
	    t18 += v * b9;
	    t19 += v * b10;
	    t20 += v * b11;
	    t21 += v * b12;
	    t22 += v * b13;
	    t23 += v * b14;
	    t24 += v * b15;
	    v = a[10];
	    t10 += v * b0;
	    t11 += v * b1;
	    t12 += v * b2;
	    t13 += v * b3;
	    t14 += v * b4;
	    t15 += v * b5;
	    t16 += v * b6;
	    t17 += v * b7;
	    t18 += v * b8;
	    t19 += v * b9;
	    t20 += v * b10;
	    t21 += v * b11;
	    t22 += v * b12;
	    t23 += v * b13;
	    t24 += v * b14;
	    t25 += v * b15;
	    v = a[11];
	    t11 += v * b0;
	    t12 += v * b1;
	    t13 += v * b2;
	    t14 += v * b3;
	    t15 += v * b4;
	    t16 += v * b5;
	    t17 += v * b6;
	    t18 += v * b7;
	    t19 += v * b8;
	    t20 += v * b9;
	    t21 += v * b10;
	    t22 += v * b11;
	    t23 += v * b12;
	    t24 += v * b13;
	    t25 += v * b14;
	    t26 += v * b15;
	    v = a[12];
	    t12 += v * b0;
	    t13 += v * b1;
	    t14 += v * b2;
	    t15 += v * b3;
	    t16 += v * b4;
	    t17 += v * b5;
	    t18 += v * b6;
	    t19 += v * b7;
	    t20 += v * b8;
	    t21 += v * b9;
	    t22 += v * b10;
	    t23 += v * b11;
	    t24 += v * b12;
	    t25 += v * b13;
	    t26 += v * b14;
	    t27 += v * b15;
	    v = a[13];
	    t13 += v * b0;
	    t14 += v * b1;
	    t15 += v * b2;
	    t16 += v * b3;
	    t17 += v * b4;
	    t18 += v * b5;
	    t19 += v * b6;
	    t20 += v * b7;
	    t21 += v * b8;
	    t22 += v * b9;
	    t23 += v * b10;
	    t24 += v * b11;
	    t25 += v * b12;
	    t26 += v * b13;
	    t27 += v * b14;
	    t28 += v * b15;
	    v = a[14];
	    t14 += v * b0;
	    t15 += v * b1;
	    t16 += v * b2;
	    t17 += v * b3;
	    t18 += v * b4;
	    t19 += v * b5;
	    t20 += v * b6;
	    t21 += v * b7;
	    t22 += v * b8;
	    t23 += v * b9;
	    t24 += v * b10;
	    t25 += v * b11;
	    t26 += v * b12;
	    t27 += v * b13;
	    t28 += v * b14;
	    t29 += v * b15;
	    v = a[15];
	    t15 += v * b0;
	    t16 += v * b1;
	    t17 += v * b2;
	    t18 += v * b3;
	    t19 += v * b4;
	    t20 += v * b5;
	    t21 += v * b6;
	    t22 += v * b7;
	    t23 += v * b8;
	    t24 += v * b9;
	    t25 += v * b10;
	    t26 += v * b11;
	    t27 += v * b12;
	    t28 += v * b13;
	    t29 += v * b14;
	    t30 += v * b15;
	    t0 += 38 * t16;
	    t1 += 38 * t17;
	    t2 += 38 * t18;
	    t3 += 38 * t19;
	    t4 += 38 * t20;
	    t5 += 38 * t21;
	    t6 += 38 * t22;
	    t7 += 38 * t23;
	    t8 += 38 * t24;
	    t9 += 38 * t25;
	    t10 += 38 * t26;
	    t11 += 38 * t27;
	    t12 += 38 * t28;
	    t13 += 38 * t29;
	    t14 += 38 * t30;
	    // t15 left as is
	    // first car
	    c = 1;
	    v = t0 + c + 65535;
	    c = Math.floor(v / 65536);
	    t0 = v - c * 65536;
	    v = t1 + c + 65535;
	    c = Math.floor(v / 65536);
	    t1 = v - c * 65536;
	    v = t2 + c + 65535;
	    c = Math.floor(v / 65536);
	    t2 = v - c * 65536;
	    v = t3 + c + 65535;
	    c = Math.floor(v / 65536);
	    t3 = v - c * 65536;
	    v = t4 + c + 65535;
	    c = Math.floor(v / 65536);
	    t4 = v - c * 65536;
	    v = t5 + c + 65535;
	    c = Math.floor(v / 65536);
	    t5 = v - c * 65536;
	    v = t6 + c + 65535;
	    c = Math.floor(v / 65536);
	    t6 = v - c * 65536;
	    v = t7 + c + 65535;
	    c = Math.floor(v / 65536);
	    t7 = v - c * 65536;
	    v = t8 + c + 65535;
	    c = Math.floor(v / 65536);
	    t8 = v - c * 65536;
	    v = t9 + c + 65535;
	    c = Math.floor(v / 65536);
	    t9 = v - c * 65536;
	    v = t10 + c + 65535;
	    c = Math.floor(v / 65536);
	    t10 = v - c * 65536;
	    v = t11 + c + 65535;
	    c = Math.floor(v / 65536);
	    t11 = v - c * 65536;
	    v = t12 + c + 65535;
	    c = Math.floor(v / 65536);
	    t12 = v - c * 65536;
	    v = t13 + c + 65535;
	    c = Math.floor(v / 65536);
	    t13 = v - c * 65536;
	    v = t14 + c + 65535;
	    c = Math.floor(v / 65536);
	    t14 = v - c * 65536;
	    v = t15 + c + 65535;
	    c = Math.floor(v / 65536);
	    t15 = v - c * 65536;
	    t0 += c - 1 + 37 * (c - 1);
	    // second car
	    c = 1;
	    v = t0 + c + 65535;
	    c = Math.floor(v / 65536);
	    t0 = v - c * 65536;
	    v = t1 + c + 65535;
	    c = Math.floor(v / 65536);
	    t1 = v - c * 65536;
	    v = t2 + c + 65535;
	    c = Math.floor(v / 65536);
	    t2 = v - c * 65536;
	    v = t3 + c + 65535;
	    c = Math.floor(v / 65536);
	    t3 = v - c * 65536;
	    v = t4 + c + 65535;
	    c = Math.floor(v / 65536);
	    t4 = v - c * 65536;
	    v = t5 + c + 65535;
	    c = Math.floor(v / 65536);
	    t5 = v - c * 65536;
	    v = t6 + c + 65535;
	    c = Math.floor(v / 65536);
	    t6 = v - c * 65536;
	    v = t7 + c + 65535;
	    c = Math.floor(v / 65536);
	    t7 = v - c * 65536;
	    v = t8 + c + 65535;
	    c = Math.floor(v / 65536);
	    t8 = v - c * 65536;
	    v = t9 + c + 65535;
	    c = Math.floor(v / 65536);
	    t9 = v - c * 65536;
	    v = t10 + c + 65535;
	    c = Math.floor(v / 65536);
	    t10 = v - c * 65536;
	    v = t11 + c + 65535;
	    c = Math.floor(v / 65536);
	    t11 = v - c * 65536;
	    v = t12 + c + 65535;
	    c = Math.floor(v / 65536);
	    t12 = v - c * 65536;
	    v = t13 + c + 65535;
	    c = Math.floor(v / 65536);
	    t13 = v - c * 65536;
	    v = t14 + c + 65535;
	    c = Math.floor(v / 65536);
	    t14 = v - c * 65536;
	    v = t15 + c + 65535;
	    c = Math.floor(v / 65536);
	    t15 = v - c * 65536;
	    t0 += c - 1 + 37 * (c - 1);
	    o[0] = t0;
	    o[1] = t1;
	    o[2] = t2;
	    o[3] = t3;
	    o[4] = t4;
	    o[5] = t5;
	    o[6] = t6;
	    o[7] = t7;
	    o[8] = t8;
	    o[9] = t9;
	    o[10] = t10;
	    o[11] = t11;
	    o[12] = t12;
	    o[13] = t13;
	    o[14] = t14;
	    o[15] = t15;
	}
	function square(o, a) {
	    mul(o, a, a);
	}
	function inv25519(o, i) {
	    const c = gf();
	    let a;
	    for (a = 0; a < 16; a++) {
	        c[a] = i[a];
	    }
	    for (a = 253; a >= 0; a--) {
	        square(c, c);
	        if (a !== 2 && a !== 4) {
	            mul(c, c, i);
	        }
	    }
	    for (a = 0; a < 16; a++) {
	        o[a] = c[a];
	    }
	}
	function pow2523(o, i) {
	    const c = gf();
	    let a;
	    for (a = 0; a < 16; a++) {
	        c[a] = i[a];
	    }
	    for (a = 250; a >= 0; a--) {
	        square(c, c);
	        if (a !== 1) {
	            mul(c, c, i);
	        }
	    }
	    for (a = 0; a < 16; a++) {
	        o[a] = c[a];
	    }
	}
	function edadd(p, q) {
	    const a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf(), g = gf(), h = gf(), t = gf();
	    sub(a, p[1], p[0]);
	    sub(t, q[1], q[0]);
	    mul(a, a, t);
	    add(b, p[0], p[1]);
	    add(t, q[0], q[1]);
	    mul(b, b, t);
	    mul(c, p[3], q[3]);
	    mul(c, c, D2);
	    mul(d, p[2], q[2]);
	    add(d, d, d);
	    sub(e, b, a);
	    sub(f, d, c);
	    add(g, d, c);
	    add(h, b, a);
	    mul(p[0], e, f);
	    mul(p[1], h, g);
	    mul(p[2], g, f);
	    mul(p[3], e, h);
	}
	function cswap(p, q, b) {
	    for (let i = 0; i < 4; i++) {
	        sel25519(p[i], q[i], b);
	    }
	}
	function pack(r, p) {
	    const tx = gf(), ty = gf(), zi = gf();
	    inv25519(zi, p[2]);
	    mul(tx, p[0], zi);
	    mul(ty, p[1], zi);
	    pack25519(r, ty);
	    r[31] ^= par25519(tx) << 7;
	}
	function scalarmult(p, q, s) {
	    set25519(p[0], gf0);
	    set25519(p[1], gf1);
	    set25519(p[2], gf1);
	    set25519(p[3], gf0);
	    for (let i = 255; i >= 0; --i) {
	        const b = (s[(i / 8) | 0] >> (i & 7)) & 1;
	        cswap(p, q, b);
	        edadd(q, p);
	        edadd(p, p);
	        cswap(p, q, b);
	    }
	}
	function scalarbase(p, s) {
	    const q = [gf(), gf(), gf(), gf()];
	    set25519(q[0], X);
	    set25519(q[1], Y);
	    set25519(q[2], gf1);
	    mul(q[3], X, Y);
	    scalarmult(p, q, s);
	}
	// Generates key pair from secret 32-byte seed.
	function generateKeyPairFromSeed(seed) {
	    if (seed.length !== exports.SEED_LENGTH) {
	        throw new Error(`ed25519: seed must be ${exports.SEED_LENGTH} bytes`);
	    }
	    const d = (0, sha512_1.hash)(seed);
	    d[0] &= 248;
	    d[31] &= 127;
	    d[31] |= 64;
	    const publicKey = new Uint8Array(32);
	    const p = [gf(), gf(), gf(), gf()];
	    scalarbase(p, d);
	    pack(publicKey, p);
	    const secretKey = new Uint8Array(64);
	    secretKey.set(seed);
	    secretKey.set(publicKey, 32);
	    return {
	        publicKey,
	        secretKey
	    };
	}
	exports.generateKeyPairFromSeed = generateKeyPairFromSeed;
	function generateKeyPair(prng) {
	    const seed = (0, random_1.randomBytes)(32, prng);
	    const result = generateKeyPairFromSeed(seed);
	    (0, wipe_1.wipe)(seed);
	    return result;
	}
	exports.generateKeyPair = generateKeyPair;
	function extractPublicKeyFromSecretKey(secretKey) {
	    if (secretKey.length !== exports.SECRET_KEY_LENGTH) {
	        throw new Error(`ed25519: secret key must be ${exports.SECRET_KEY_LENGTH} bytes`);
	    }
	    return new Uint8Array(secretKey.subarray(32));
	}
	exports.extractPublicKeyFromSecretKey = extractPublicKeyFromSecretKey;
	const L = new Float64Array([
	    0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2,
	    0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10
	]);
	function modL(r, x) {
	    let carry;
	    let i;
	    let j;
	    let k;
	    for (i = 63; i >= 32; --i) {
	        carry = 0;
	        for (j = i - 32, k = i - 12; j < k; ++j) {
	            x[j] += carry - 16 * x[i] * L[j - (i - 32)];
	            carry = Math.floor((x[j] + 128) / 256);
	            x[j] -= carry * 256;
	        }
	        x[j] += carry;
	        x[i] = 0;
	    }
	    carry = 0;
	    for (j = 0; j < 32; j++) {
	        x[j] += carry - (x[31] >> 4) * L[j];
	        carry = x[j] >> 8;
	        x[j] &= 255;
	    }
	    for (j = 0; j < 32; j++) {
	        x[j] -= carry * L[j];
	    }
	    for (i = 0; i < 32; i++) {
	        x[i + 1] += x[i] >> 8;
	        r[i] = x[i] & 255;
	    }
	}
	function reduce(r) {
	    const x = new Float64Array(64);
	    for (let i = 0; i < 64; i++) {
	        x[i] = r[i];
	    }
	    for (let i = 0; i < 64; i++) {
	        r[i] = 0;
	    }
	    modL(r, x);
	}
	// Returns 64-byte signature of the message under the 64-byte secret key.
	function sign(secretKey, message) {
	    const x = new Float64Array(64);
	    const p = [gf(), gf(), gf(), gf()];
	    const d = (0, sha512_1.hash)(secretKey.subarray(0, 32));
	    d[0] &= 248;
	    d[31] &= 127;
	    d[31] |= 64;
	    const signature = new Uint8Array(64);
	    signature.set(d.subarray(32), 32);
	    const hs = new sha512_1.SHA512();
	    hs.update(signature.subarray(32));
	    hs.update(message);
	    const r = hs.digest();
	    hs.clean();
	    reduce(r);
	    scalarbase(p, r);
	    pack(signature, p);
	    hs.reset();
	    hs.update(signature.subarray(0, 32));
	    hs.update(secretKey.subarray(32));
	    hs.update(message);
	    const h = hs.digest();
	    reduce(h);
	    for (let i = 0; i < 32; i++) {
	        x[i] = r[i];
	    }
	    for (let i = 0; i < 32; i++) {
	        for (let j = 0; j < 32; j++) {
	            x[i + j] += h[i] * d[j];
	        }
	    }
	    modL(signature.subarray(32), x);
	    return signature;
	}
	exports.sign = sign;
	function unpackneg(r, p) {
	    const t = gf(), chk = gf(), num = gf(), den = gf(), den2 = gf(), den4 = gf(), den6 = gf();
	    set25519(r[2], gf1);
	    unpack25519(r[1], p);
	    square(num, r[1]);
	    mul(den, num, D);
	    sub(num, num, r[2]);
	    add(den, r[2], den);
	    square(den2, den);
	    square(den4, den2);
	    mul(den6, den4, den2);
	    mul(t, den6, num);
	    mul(t, t, den);
	    pow2523(t, t);
	    mul(t, t, num);
	    mul(t, t, den);
	    mul(t, t, den);
	    mul(r[0], t, den);
	    square(chk, r[0]);
	    mul(chk, chk, den);
	    if (neq25519(chk, num)) {
	        mul(r[0], r[0], I);
	    }
	    square(chk, r[0]);
	    mul(chk, chk, den);
	    if (neq25519(chk, num)) {
	        return -1;
	    }
	    if (par25519(r[0]) === (p[31] >> 7)) {
	        sub(r[0], gf0, r[0]);
	    }
	    mul(r[3], r[0], r[1]);
	    return 0;
	}
	function verify(publicKey, message, signature) {
	    const t = new Uint8Array(32);
	    const p = [gf(), gf(), gf(), gf()];
	    const q = [gf(), gf(), gf(), gf()];
	    if (signature.length !== exports.SIGNATURE_LENGTH) {
	        throw new Error(`ed25519: signature must be ${exports.SIGNATURE_LENGTH} bytes`);
	    }
	    if (unpackneg(q, publicKey)) {
	        return false;
	    }
	    const hs = new sha512_1.SHA512();
	    hs.update(signature.subarray(0, 32));
	    hs.update(publicKey);
	    hs.update(message);
	    const h = hs.digest();
	    reduce(h);
	    scalarmult(p, q, h);
	    scalarbase(q, signature.subarray(32));
	    edadd(p, q);
	    pack(t, p);
	    if (verify32(signature, t)) {
	        return false;
	    }
	    return true;
	}
	exports.verify = verify;
	/**
	 * Convert Ed25519 public key to X25519 public key.
	 *
	 * Throws if given an invalid public key.
	 */
	function convertPublicKeyToX25519(publicKey) {
	    let q = [gf(), gf(), gf(), gf()];
	    if (unpackneg(q, publicKey)) {
	        throw new Error("Ed25519: invalid public key");
	    }
	    // Formula: montgomeryX = (edwardsY + 1)*inverse(1 - edwardsY) mod p
	    let a = gf();
	    let b = gf();
	    let y = q[1];
	    add(a, gf1, y);
	    sub(b, gf1, y);
	    inv25519(b, b);
	    mul(a, a, b);
	    let z = new Uint8Array(32);
	    pack25519(z, a);
	    return z;
	}
	exports.convertPublicKeyToX25519 = convertPublicKeyToX25519;
	/**
	 *  Convert Ed25519 secret (private) key to X25519 secret key.
	 */
	function convertSecretKeyToX25519(secretKey) {
	    const d = (0, sha512_1.hash)(secretKey.subarray(0, 32));
	    d[0] &= 248;
	    d[31] &= 127;
	    d[31] |= 64;
	    const o = new Uint8Array(d.subarray(0, 32));
	    (0, wipe_1.wipe)(d);
	    return o;
	}
	exports.convertSecretKeyToX25519 = convertSecretKeyToX25519;
	
} (ed25519));

const JWT_IRIDIUM_ALG = "EdDSA";
const JWT_IRIDIUM_TYP = "JWT";
const JWT_DELIMITER = ".";
const JWT_ENCODING = "base64url";
const JSON_ENCODING = "utf8";
const DATA_ENCODING = "utf8";
const DID_DELIMITER = ":";
const DID_PREFIX = "did";
const DID_METHOD = "key";
const MULTICODEC_ED25519_ENCODING = "base58btc";
const MULTICODEC_ED25519_BASE = "z";
const MULTICODEC_ED25519_HEADER = "K36";
const KEY_PAIR_SEED_LENGTH = 32;

function asUint8Array(buf) {
  if (globalThis.Buffer != null) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return buf;
}

function allocUnsafe(size = 0) {
  if (globalThis.Buffer != null && globalThis.Buffer.allocUnsafe != null) {
    return asUint8Array(globalThis.Buffer.allocUnsafe(size));
  }
  return new Uint8Array(size);
}

function concat(arrays, length) {
  if (!length) {
    length = arrays.reduce((acc, curr) => acc + curr.length, 0);
  }
  const output = allocUnsafe(length);
  let offset = 0;
  for (const arr of arrays) {
    output.set(arr, offset);
    offset += arr.length;
  }
  return asUint8Array(output);
}

function base(ALPHABET, name) {
  if (ALPHABET.length >= 255) {
    throw new TypeError('Alphabet too long');
  }
  var BASE_MAP = new Uint8Array(256);
  for (var j = 0; j < BASE_MAP.length; j++) {
    BASE_MAP[j] = 255;
  }
  for (var i = 0; i < ALPHABET.length; i++) {
    var x = ALPHABET.charAt(i);
    var xc = x.charCodeAt(0);
    if (BASE_MAP[xc] !== 255) {
      throw new TypeError(x + ' is ambiguous');
    }
    BASE_MAP[xc] = i;
  }
  var BASE = ALPHABET.length;
  var LEADER = ALPHABET.charAt(0);
  var FACTOR = Math.log(BASE) / Math.log(256);
  var iFACTOR = Math.log(256) / Math.log(BASE);
  function encode(source) {
    if (source instanceof Uint8Array);
    else if (ArrayBuffer.isView(source)) {
      source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    } else if (Array.isArray(source)) {
      source = Uint8Array.from(source);
    }
    if (!(source instanceof Uint8Array)) {
      throw new TypeError('Expected Uint8Array');
    }
    if (source.length === 0) {
      return '';
    }
    var zeroes = 0;
    var length = 0;
    var pbegin = 0;
    var pend = source.length;
    while (pbegin !== pend && source[pbegin] === 0) {
      pbegin++;
      zeroes++;
    }
    var size = (pend - pbegin) * iFACTOR + 1 >>> 0;
    var b58 = new Uint8Array(size);
    while (pbegin !== pend) {
      var carry = source[pbegin];
      var i = 0;
      for (var it1 = size - 1; (carry !== 0 || i < length) && it1 !== -1; it1--, i++) {
        carry += 256 * b58[it1] >>> 0;
        b58[it1] = carry % BASE >>> 0;
        carry = carry / BASE >>> 0;
      }
      if (carry !== 0) {
        throw new Error('Non-zero carry');
      }
      length = i;
      pbegin++;
    }
    var it2 = size - length;
    while (it2 !== size && b58[it2] === 0) {
      it2++;
    }
    var str = LEADER.repeat(zeroes);
    for (; it2 < size; ++it2) {
      str += ALPHABET.charAt(b58[it2]);
    }
    return str;
  }
  function decodeUnsafe(source) {
    if (typeof source !== 'string') {
      throw new TypeError('Expected String');
    }
    if (source.length === 0) {
      return new Uint8Array();
    }
    var psz = 0;
    if (source[psz] === ' ') {
      return;
    }
    var zeroes = 0;
    var length = 0;
    while (source[psz] === LEADER) {
      zeroes++;
      psz++;
    }
    var size = (source.length - psz) * FACTOR + 1 >>> 0;
    var b256 = new Uint8Array(size);
    while (source[psz]) {
      var carry = BASE_MAP[source.charCodeAt(psz)];
      if (carry === 255) {
        return;
      }
      var i = 0;
      for (var it3 = size - 1; (carry !== 0 || i < length) && it3 !== -1; it3--, i++) {
        carry += BASE * b256[it3] >>> 0;
        b256[it3] = carry % 256 >>> 0;
        carry = carry / 256 >>> 0;
      }
      if (carry !== 0) {
        throw new Error('Non-zero carry');
      }
      length = i;
      psz++;
    }
    if (source[psz] === ' ') {
      return;
    }
    var it4 = size - length;
    while (it4 !== size && b256[it4] === 0) {
      it4++;
    }
    var vch = new Uint8Array(zeroes + (size - it4));
    var j = zeroes;
    while (it4 !== size) {
      vch[j++] = b256[it4++];
    }
    return vch;
  }
  function decode(string) {
    var buffer = decodeUnsafe(string);
    if (buffer) {
      return buffer;
    }
    throw new Error(`Non-${ name } character`);
  }
  return {
    encode: encode,
    decodeUnsafe: decodeUnsafe,
    decode: decode
  };
}
var src = base;
var _brrp__multiformats_scope_baseX = src;

const coerce = o => {
  if (o instanceof Uint8Array && o.constructor.name === 'Uint8Array')
    return o;
  if (o instanceof ArrayBuffer)
    return new Uint8Array(o);
  if (ArrayBuffer.isView(o)) {
    return new Uint8Array(o.buffer, o.byteOffset, o.byteLength);
  }
  throw new Error('Unknown type, must be binary type');
};
const fromString$1 = str => new TextEncoder().encode(str);
const toString$1 = b => new TextDecoder().decode(b);

class Encoder {
  constructor(name, prefix, baseEncode) {
    this.name = name;
    this.prefix = prefix;
    this.baseEncode = baseEncode;
  }
  encode(bytes) {
    if (bytes instanceof Uint8Array) {
      return `${ this.prefix }${ this.baseEncode(bytes) }`;
    } else {
      throw Error('Unknown type, must be binary type');
    }
  }
}
class Decoder {
  constructor(name, prefix, baseDecode) {
    this.name = name;
    this.prefix = prefix;
    if (prefix.codePointAt(0) === undefined) {
      throw new Error('Invalid prefix character');
    }
    this.prefixCodePoint = prefix.codePointAt(0);
    this.baseDecode = baseDecode;
  }
  decode(text) {
    if (typeof text === 'string') {
      if (text.codePointAt(0) !== this.prefixCodePoint) {
        throw Error(`Unable to decode multibase string ${ JSON.stringify(text) }, ${ this.name } decoder only supports inputs prefixed with ${ this.prefix }`);
      }
      return this.baseDecode(text.slice(this.prefix.length));
    } else {
      throw Error('Can only multibase decode strings');
    }
  }
  or(decoder) {
    return or$1(this, decoder);
  }
}
class ComposedDecoder {
  constructor(decoders) {
    this.decoders = decoders;
  }
  or(decoder) {
    return or$1(this, decoder);
  }
  decode(input) {
    const prefix = input[0];
    const decoder = this.decoders[prefix];
    if (decoder) {
      return decoder.decode(input);
    } else {
      throw RangeError(`Unable to decode multibase string ${ JSON.stringify(input) }, only inputs prefixed with ${ Object.keys(this.decoders) } are supported`);
    }
  }
}
const or$1 = (left, right) => new ComposedDecoder({
  ...left.decoders || { [left.prefix]: left },
  ...right.decoders || { [right.prefix]: right }
});
class Codec {
  constructor(name, prefix, baseEncode, baseDecode) {
    this.name = name;
    this.prefix = prefix;
    this.baseEncode = baseEncode;
    this.baseDecode = baseDecode;
    this.encoder = new Encoder(name, prefix, baseEncode);
    this.decoder = new Decoder(name, prefix, baseDecode);
  }
  encode(input) {
    return this.encoder.encode(input);
  }
  decode(input) {
    return this.decoder.decode(input);
  }
}
const from = ({name, prefix, encode, decode}) => new Codec(name, prefix, encode, decode);
const baseX = ({prefix, name, alphabet}) => {
  const {encode, decode} = _brrp__multiformats_scope_baseX(alphabet, name);
  return from({
    prefix,
    name,
    encode,
    decode: text => coerce(decode(text))
  });
};
const decode$2 = (string, alphabet, bitsPerChar, name) => {
  const codes = {};
  for (let i = 0; i < alphabet.length; ++i) {
    codes[alphabet[i]] = i;
  }
  let end = string.length;
  while (string[end - 1] === '=') {
    --end;
  }
  const out = new Uint8Array(end * bitsPerChar / 8 | 0);
  let bits = 0;
  let buffer = 0;
  let written = 0;
  for (let i = 0; i < end; ++i) {
    const value = codes[string[i]];
    if (value === undefined) {
      throw new SyntaxError(`Non-${ name } character`);
    }
    buffer = buffer << bitsPerChar | value;
    bits += bitsPerChar;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = 255 & buffer >> bits;
    }
  }
  if (bits >= bitsPerChar || 255 & buffer << 8 - bits) {
    throw new SyntaxError('Unexpected end of data');
  }
  return out;
};
const encode$1 = (data, alphabet, bitsPerChar) => {
  const pad = alphabet[alphabet.length - 1] === '=';
  const mask = (1 << bitsPerChar) - 1;
  let out = '';
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < data.length; ++i) {
    buffer = buffer << 8 | data[i];
    bits += 8;
    while (bits > bitsPerChar) {
      bits -= bitsPerChar;
      out += alphabet[mask & buffer >> bits];
    }
  }
  if (bits) {
    out += alphabet[mask & buffer << bitsPerChar - bits];
  }
  if (pad) {
    while (out.length * bitsPerChar & 7) {
      out += '=';
    }
  }
  return out;
};
const rfc4648 = ({name, prefix, bitsPerChar, alphabet}) => {
  return from({
    prefix,
    name,
    encode(input) {
      return encode$1(input, alphabet, bitsPerChar);
    },
    decode(input) {
      return decode$2(input, alphabet, bitsPerChar, name);
    }
  });
};

const identity = from({
  prefix: '\0',
  name: 'identity',
  encode: buf => toString$1(buf),
  decode: str => fromString$1(str)
});

var identityBase = /*#__PURE__*/Object.freeze({
  __proto__: null,
  identity: identity
});

const base2 = rfc4648({
  prefix: '0',
  name: 'base2',
  alphabet: '01',
  bitsPerChar: 1
});

var base2$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base2: base2
});

const base8 = rfc4648({
  prefix: '7',
  name: 'base8',
  alphabet: '01234567',
  bitsPerChar: 3
});

var base8$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base8: base8
});

const base10 = baseX({
  prefix: '9',
  name: 'base10',
  alphabet: '0123456789'
});

var base10$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base10: base10
});

const base16 = rfc4648({
  prefix: 'f',
  name: 'base16',
  alphabet: '0123456789abcdef',
  bitsPerChar: 4
});
const base16upper = rfc4648({
  prefix: 'F',
  name: 'base16upper',
  alphabet: '0123456789ABCDEF',
  bitsPerChar: 4
});

var base16$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base16: base16,
  base16upper: base16upper
});

const base32 = rfc4648({
  prefix: 'b',
  name: 'base32',
  alphabet: 'abcdefghijklmnopqrstuvwxyz234567',
  bitsPerChar: 5
});
const base32upper = rfc4648({
  prefix: 'B',
  name: 'base32upper',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  bitsPerChar: 5
});
const base32pad = rfc4648({
  prefix: 'c',
  name: 'base32pad',
  alphabet: 'abcdefghijklmnopqrstuvwxyz234567=',
  bitsPerChar: 5
});
const base32padupper = rfc4648({
  prefix: 'C',
  name: 'base32padupper',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=',
  bitsPerChar: 5
});
const base32hex = rfc4648({
  prefix: 'v',
  name: 'base32hex',
  alphabet: '0123456789abcdefghijklmnopqrstuv',
  bitsPerChar: 5
});
const base32hexupper = rfc4648({
  prefix: 'V',
  name: 'base32hexupper',
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV',
  bitsPerChar: 5
});
const base32hexpad = rfc4648({
  prefix: 't',
  name: 'base32hexpad',
  alphabet: '0123456789abcdefghijklmnopqrstuv=',
  bitsPerChar: 5
});
const base32hexpadupper = rfc4648({
  prefix: 'T',
  name: 'base32hexpadupper',
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUV=',
  bitsPerChar: 5
});
const base32z = rfc4648({
  prefix: 'h',
  name: 'base32z',
  alphabet: 'ybndrfg8ejkmcpqxot1uwisza345h769',
  bitsPerChar: 5
});

var base32$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base32: base32,
  base32hex: base32hex,
  base32hexpad: base32hexpad,
  base32hexpadupper: base32hexpadupper,
  base32hexupper: base32hexupper,
  base32pad: base32pad,
  base32padupper: base32padupper,
  base32upper: base32upper,
  base32z: base32z
});

const base36 = baseX({
  prefix: 'k',
  name: 'base36',
  alphabet: '0123456789abcdefghijklmnopqrstuvwxyz'
});
const base36upper = baseX({
  prefix: 'K',
  name: 'base36upper',
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
});

var base36$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base36: base36,
  base36upper: base36upper
});

const base58btc = baseX({
  name: 'base58btc',
  prefix: 'z',
  alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
});
const base58flickr = baseX({
  name: 'base58flickr',
  prefix: 'Z',
  alphabet: '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
});

var base58 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base58btc: base58btc,
  base58flickr: base58flickr
});

const base64 = rfc4648({
  prefix: 'm',
  name: 'base64',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  bitsPerChar: 6
});
const base64pad = rfc4648({
  prefix: 'M',
  name: 'base64pad',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
  bitsPerChar: 6
});
const base64url = rfc4648({
  prefix: 'u',
  name: 'base64url',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  bitsPerChar: 6
});
const base64urlpad = rfc4648({
  prefix: 'U',
  name: 'base64urlpad',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=',
  bitsPerChar: 6
});

var base64$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base64: base64,
  base64pad: base64pad,
  base64url: base64url,
  base64urlpad: base64urlpad
});

const alphabet = Array.from('\uD83D\uDE80\uD83E\uDE90\u2604\uD83D\uDEF0\uD83C\uDF0C\uD83C\uDF11\uD83C\uDF12\uD83C\uDF13\uD83C\uDF14\uD83C\uDF15\uD83C\uDF16\uD83C\uDF17\uD83C\uDF18\uD83C\uDF0D\uD83C\uDF0F\uD83C\uDF0E\uD83D\uDC09\u2600\uD83D\uDCBB\uD83D\uDDA5\uD83D\uDCBE\uD83D\uDCBF\uD83D\uDE02\u2764\uD83D\uDE0D\uD83E\uDD23\uD83D\uDE0A\uD83D\uDE4F\uD83D\uDC95\uD83D\uDE2D\uD83D\uDE18\uD83D\uDC4D\uD83D\uDE05\uD83D\uDC4F\uD83D\uDE01\uD83D\uDD25\uD83E\uDD70\uD83D\uDC94\uD83D\uDC96\uD83D\uDC99\uD83D\uDE22\uD83E\uDD14\uD83D\uDE06\uD83D\uDE44\uD83D\uDCAA\uD83D\uDE09\u263A\uD83D\uDC4C\uD83E\uDD17\uD83D\uDC9C\uD83D\uDE14\uD83D\uDE0E\uD83D\uDE07\uD83C\uDF39\uD83E\uDD26\uD83C\uDF89\uD83D\uDC9E\u270C\u2728\uD83E\uDD37\uD83D\uDE31\uD83D\uDE0C\uD83C\uDF38\uD83D\uDE4C\uD83D\uDE0B\uD83D\uDC97\uD83D\uDC9A\uD83D\uDE0F\uD83D\uDC9B\uD83D\uDE42\uD83D\uDC93\uD83E\uDD29\uD83D\uDE04\uD83D\uDE00\uD83D\uDDA4\uD83D\uDE03\uD83D\uDCAF\uD83D\uDE48\uD83D\uDC47\uD83C\uDFB6\uD83D\uDE12\uD83E\uDD2D\u2763\uD83D\uDE1C\uD83D\uDC8B\uD83D\uDC40\uD83D\uDE2A\uD83D\uDE11\uD83D\uDCA5\uD83D\uDE4B\uD83D\uDE1E\uD83D\uDE29\uD83D\uDE21\uD83E\uDD2A\uD83D\uDC4A\uD83E\uDD73\uD83D\uDE25\uD83E\uDD24\uD83D\uDC49\uD83D\uDC83\uD83D\uDE33\u270B\uD83D\uDE1A\uD83D\uDE1D\uD83D\uDE34\uD83C\uDF1F\uD83D\uDE2C\uD83D\uDE43\uD83C\uDF40\uD83C\uDF37\uD83D\uDE3B\uD83D\uDE13\u2B50\u2705\uD83E\uDD7A\uD83C\uDF08\uD83D\uDE08\uD83E\uDD18\uD83D\uDCA6\u2714\uD83D\uDE23\uD83C\uDFC3\uD83D\uDC90\u2639\uD83C\uDF8A\uD83D\uDC98\uD83D\uDE20\u261D\uD83D\uDE15\uD83C\uDF3A\uD83C\uDF82\uD83C\uDF3B\uD83D\uDE10\uD83D\uDD95\uD83D\uDC9D\uD83D\uDE4A\uD83D\uDE39\uD83D\uDDE3\uD83D\uDCAB\uD83D\uDC80\uD83D\uDC51\uD83C\uDFB5\uD83E\uDD1E\uD83D\uDE1B\uD83D\uDD34\uD83D\uDE24\uD83C\uDF3C\uD83D\uDE2B\u26BD\uD83E\uDD19\u2615\uD83C\uDFC6\uD83E\uDD2B\uD83D\uDC48\uD83D\uDE2E\uD83D\uDE46\uD83C\uDF7B\uD83C\uDF43\uD83D\uDC36\uD83D\uDC81\uD83D\uDE32\uD83C\uDF3F\uD83E\uDDE1\uD83C\uDF81\u26A1\uD83C\uDF1E\uD83C\uDF88\u274C\u270A\uD83D\uDC4B\uD83D\uDE30\uD83E\uDD28\uD83D\uDE36\uD83E\uDD1D\uD83D\uDEB6\uD83D\uDCB0\uD83C\uDF53\uD83D\uDCA2\uD83E\uDD1F\uD83D\uDE41\uD83D\uDEA8\uD83D\uDCA8\uD83E\uDD2C\u2708\uD83C\uDF80\uD83C\uDF7A\uD83E\uDD13\uD83D\uDE19\uD83D\uDC9F\uD83C\uDF31\uD83D\uDE16\uD83D\uDC76\uD83E\uDD74\u25B6\u27A1\u2753\uD83D\uDC8E\uD83D\uDCB8\u2B07\uD83D\uDE28\uD83C\uDF1A\uD83E\uDD8B\uD83D\uDE37\uD83D\uDD7A\u26A0\uD83D\uDE45\uD83D\uDE1F\uD83D\uDE35\uD83D\uDC4E\uD83E\uDD32\uD83E\uDD20\uD83E\uDD27\uD83D\uDCCC\uD83D\uDD35\uD83D\uDC85\uD83E\uDDD0\uD83D\uDC3E\uD83C\uDF52\uD83D\uDE17\uD83E\uDD11\uD83C\uDF0A\uD83E\uDD2F\uD83D\uDC37\u260E\uD83D\uDCA7\uD83D\uDE2F\uD83D\uDC86\uD83D\uDC46\uD83C\uDFA4\uD83D\uDE47\uD83C\uDF51\u2744\uD83C\uDF34\uD83D\uDCA3\uD83D\uDC38\uD83D\uDC8C\uD83D\uDCCD\uD83E\uDD40\uD83E\uDD22\uD83D\uDC45\uD83D\uDCA1\uD83D\uDCA9\uD83D\uDC50\uD83D\uDCF8\uD83D\uDC7B\uD83E\uDD10\uD83E\uDD2E\uD83C\uDFBC\uD83E\uDD75\uD83D\uDEA9\uD83C\uDF4E\uD83C\uDF4A\uD83D\uDC7C\uD83D\uDC8D\uD83D\uDCE3\uD83E\uDD42');
const alphabetBytesToChars = alphabet.reduce((p, c, i) => {
  p[i] = c;
  return p;
}, []);
const alphabetCharsToBytes = alphabet.reduce((p, c, i) => {
  p[c.codePointAt(0)] = i;
  return p;
}, []);
function encode(data) {
  return data.reduce((p, c) => {
    p += alphabetBytesToChars[c];
    return p;
  }, '');
}
function decode$1(str) {
  const byts = [];
  for (const char of str) {
    const byt = alphabetCharsToBytes[char.codePointAt(0)];
    if (byt === undefined) {
      throw new Error(`Non-base256emoji character: ${ char }`);
    }
    byts.push(byt);
  }
  return new Uint8Array(byts);
}
const base256emoji = from({
  prefix: '\uD83D\uDE80',
  name: 'base256emoji',
  encode,
  decode: decode$1
});

var base256emoji$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  base256emoji: base256emoji
});

new TextEncoder();
new TextDecoder();

const bases = {
  ...identityBase,
  ...base2$1,
  ...base8$1,
  ...base10$1,
  ...base16$1,
  ...base32$1,
  ...base36$1,
  ...base58,
  ...base64$1,
  ...base256emoji$1
};

function createCodec(name, prefix, encode, decode) {
  return {
    name,
    prefix,
    encoder: {
      name,
      prefix,
      encode
    },
    decoder: { decode }
  };
}
const string = createCodec('utf8', 'u', buf => {
  const decoder = new TextDecoder('utf8');
  return 'u' + decoder.decode(buf);
}, str => {
  const encoder = new TextEncoder();
  return encoder.encode(str.substring(1));
});
const ascii = createCodec('ascii', 'a', buf => {
  let string = 'a';
  for (let i = 0; i < buf.length; i++) {
    string += String.fromCharCode(buf[i]);
  }
  return string;
}, str => {
  str = str.substring(1);
  const buf = allocUnsafe(str.length);
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
});
const BASES = {
  utf8: string,
  'utf-8': string,
  hex: bases.base16,
  latin1: ascii,
  ascii: ascii,
  binary: ascii,
  ...bases
};

function toString(array, encoding = 'utf8') {
  const base = BASES[encoding];
  if (!base) {
    throw new Error(`Unsupported encoding "${ encoding }"`);
  }
  if ((encoding === 'utf8' || encoding === 'utf-8') && globalThis.Buffer != null && globalThis.Buffer.from != null) {
    return globalThis.Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('utf8');
  }
  return base.encoder.encode(array).substring(1);
}

function fromString(string, encoding = 'utf8') {
  const base = BASES[encoding];
  if (!base) {
    throw new Error(`Unsupported encoding "${ encoding }"`);
  }
  if ((encoding === 'utf8' || encoding === 'utf-8') && globalThis.Buffer != null && globalThis.Buffer.from != null) {
    return asUint8Array(globalThis.Buffer.from(string, 'utf-8'));
  }
  return base.decoder.decode(`${ base.prefix }${ string }`);
}

function encodeJSON(val) {
    return toString(fromString(safeJsonStringify(val), JSON_ENCODING), JWT_ENCODING);
}
function encodeIss(publicKey) {
    const header = fromString(MULTICODEC_ED25519_HEADER, MULTICODEC_ED25519_ENCODING);
    const multicodec = MULTICODEC_ED25519_BASE +
        toString(concat([header, publicKey]), MULTICODEC_ED25519_ENCODING);
    return [DID_PREFIX, DID_METHOD, multicodec].join(DID_DELIMITER);
}
function encodeSig(bytes) {
    return toString(bytes, JWT_ENCODING);
}
function encodeData(params) {
    return fromString([encodeJSON(params.header), encodeJSON(params.payload)].join(JWT_DELIMITER), DATA_ENCODING);
}
function encodeJWT(params) {
    return [
        encodeJSON(params.header),
        encodeJSON(params.payload),
        encodeSig(params.signature),
    ].join(JWT_DELIMITER);
}

function generateKeyPair(seed = random.randomBytes(KEY_PAIR_SEED_LENGTH)) {
    return ed25519.generateKeyPairFromSeed(seed);
}
async function signJWT(sub, aud, ttl, keyPair, iat = cjs$4.fromMiliseconds(Date.now())) {
    const header = { alg: JWT_IRIDIUM_ALG, typ: JWT_IRIDIUM_TYP };
    const iss = encodeIss(keyPair.publicKey);
    const exp = iat + ttl;
    const payload = { iss, sub, aud, iat, exp };
    const data = encodeData({ header, payload });
    const signature = ed25519.sign(keyPair.secretKey, data);
    return encodeJWT({ header, payload, signature });
}

var chacha20poly1305 = {};

var chacha = {};

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(chacha, "__esModule", { value: true });
/**
 * Package chacha implements ChaCha stream cipher.
 */
var binary_1 = binary;
var wipe_1$2 = wipe$1;
// Number of ChaCha rounds (ChaCha20).
var ROUNDS = 20;
// Applies the ChaCha core function to 16-byte input,
// 32-byte key key, and puts the result into 64-byte array out.
function core(out, input, key) {
    var j0 = 0x61707865; // "expa"  -- ChaCha's "sigma" constant
    var j1 = 0x3320646E; // "nd 3"     for 32-byte keys
    var j2 = 0x79622D32; // "2-by"
    var j3 = 0x6B206574; // "te k"
    var j4 = (key[3] << 24) | (key[2] << 16) | (key[1] << 8) | key[0];
    var j5 = (key[7] << 24) | (key[6] << 16) | (key[5] << 8) | key[4];
    var j6 = (key[11] << 24) | (key[10] << 16) | (key[9] << 8) | key[8];
    var j7 = (key[15] << 24) | (key[14] << 16) | (key[13] << 8) | key[12];
    var j8 = (key[19] << 24) | (key[18] << 16) | (key[17] << 8) | key[16];
    var j9 = (key[23] << 24) | (key[22] << 16) | (key[21] << 8) | key[20];
    var j10 = (key[27] << 24) | (key[26] << 16) | (key[25] << 8) | key[24];
    var j11 = (key[31] << 24) | (key[30] << 16) | (key[29] << 8) | key[28];
    var j12 = (input[3] << 24) | (input[2] << 16) | (input[1] << 8) | input[0];
    var j13 = (input[7] << 24) | (input[6] << 16) | (input[5] << 8) | input[4];
    var j14 = (input[11] << 24) | (input[10] << 16) | (input[9] << 8) | input[8];
    var j15 = (input[15] << 24) | (input[14] << 16) | (input[13] << 8) | input[12];
    var x0 = j0;
    var x1 = j1;
    var x2 = j2;
    var x3 = j3;
    var x4 = j4;
    var x5 = j5;
    var x6 = j6;
    var x7 = j7;
    var x8 = j8;
    var x9 = j9;
    var x10 = j10;
    var x11 = j11;
    var x12 = j12;
    var x13 = j13;
    var x14 = j14;
    var x15 = j15;
    for (var i = 0; i < ROUNDS; i += 2) {
        x0 = x0 + x4 | 0;
        x12 ^= x0;
        x12 = x12 >>> (32 - 16) | x12 << 16;
        x8 = x8 + x12 | 0;
        x4 ^= x8;
        x4 = x4 >>> (32 - 12) | x4 << 12;
        x1 = x1 + x5 | 0;
        x13 ^= x1;
        x13 = x13 >>> (32 - 16) | x13 << 16;
        x9 = x9 + x13 | 0;
        x5 ^= x9;
        x5 = x5 >>> (32 - 12) | x5 << 12;
        x2 = x2 + x6 | 0;
        x14 ^= x2;
        x14 = x14 >>> (32 - 16) | x14 << 16;
        x10 = x10 + x14 | 0;
        x6 ^= x10;
        x6 = x6 >>> (32 - 12) | x6 << 12;
        x3 = x3 + x7 | 0;
        x15 ^= x3;
        x15 = x15 >>> (32 - 16) | x15 << 16;
        x11 = x11 + x15 | 0;
        x7 ^= x11;
        x7 = x7 >>> (32 - 12) | x7 << 12;
        x2 = x2 + x6 | 0;
        x14 ^= x2;
        x14 = x14 >>> (32 - 8) | x14 << 8;
        x10 = x10 + x14 | 0;
        x6 ^= x10;
        x6 = x6 >>> (32 - 7) | x6 << 7;
        x3 = x3 + x7 | 0;
        x15 ^= x3;
        x15 = x15 >>> (32 - 8) | x15 << 8;
        x11 = x11 + x15 | 0;
        x7 ^= x11;
        x7 = x7 >>> (32 - 7) | x7 << 7;
        x1 = x1 + x5 | 0;
        x13 ^= x1;
        x13 = x13 >>> (32 - 8) | x13 << 8;
        x9 = x9 + x13 | 0;
        x5 ^= x9;
        x5 = x5 >>> (32 - 7) | x5 << 7;
        x0 = x0 + x4 | 0;
        x12 ^= x0;
        x12 = x12 >>> (32 - 8) | x12 << 8;
        x8 = x8 + x12 | 0;
        x4 ^= x8;
        x4 = x4 >>> (32 - 7) | x4 << 7;
        x0 = x0 + x5 | 0;
        x15 ^= x0;
        x15 = x15 >>> (32 - 16) | x15 << 16;
        x10 = x10 + x15 | 0;
        x5 ^= x10;
        x5 = x5 >>> (32 - 12) | x5 << 12;
        x1 = x1 + x6 | 0;
        x12 ^= x1;
        x12 = x12 >>> (32 - 16) | x12 << 16;
        x11 = x11 + x12 | 0;
        x6 ^= x11;
        x6 = x6 >>> (32 - 12) | x6 << 12;
        x2 = x2 + x7 | 0;
        x13 ^= x2;
        x13 = x13 >>> (32 - 16) | x13 << 16;
        x8 = x8 + x13 | 0;
        x7 ^= x8;
        x7 = x7 >>> (32 - 12) | x7 << 12;
        x3 = x3 + x4 | 0;
        x14 ^= x3;
        x14 = x14 >>> (32 - 16) | x14 << 16;
        x9 = x9 + x14 | 0;
        x4 ^= x9;
        x4 = x4 >>> (32 - 12) | x4 << 12;
        x2 = x2 + x7 | 0;
        x13 ^= x2;
        x13 = x13 >>> (32 - 8) | x13 << 8;
        x8 = x8 + x13 | 0;
        x7 ^= x8;
        x7 = x7 >>> (32 - 7) | x7 << 7;
        x3 = x3 + x4 | 0;
        x14 ^= x3;
        x14 = x14 >>> (32 - 8) | x14 << 8;
        x9 = x9 + x14 | 0;
        x4 ^= x9;
        x4 = x4 >>> (32 - 7) | x4 << 7;
        x1 = x1 + x6 | 0;
        x12 ^= x1;
        x12 = x12 >>> (32 - 8) | x12 << 8;
        x11 = x11 + x12 | 0;
        x6 ^= x11;
        x6 = x6 >>> (32 - 7) | x6 << 7;
        x0 = x0 + x5 | 0;
        x15 ^= x0;
        x15 = x15 >>> (32 - 8) | x15 << 8;
        x10 = x10 + x15 | 0;
        x5 ^= x10;
        x5 = x5 >>> (32 - 7) | x5 << 7;
    }
    binary_1.writeUint32LE(x0 + j0 | 0, out, 0);
    binary_1.writeUint32LE(x1 + j1 | 0, out, 4);
    binary_1.writeUint32LE(x2 + j2 | 0, out, 8);
    binary_1.writeUint32LE(x3 + j3 | 0, out, 12);
    binary_1.writeUint32LE(x4 + j4 | 0, out, 16);
    binary_1.writeUint32LE(x5 + j5 | 0, out, 20);
    binary_1.writeUint32LE(x6 + j6 | 0, out, 24);
    binary_1.writeUint32LE(x7 + j7 | 0, out, 28);
    binary_1.writeUint32LE(x8 + j8 | 0, out, 32);
    binary_1.writeUint32LE(x9 + j9 | 0, out, 36);
    binary_1.writeUint32LE(x10 + j10 | 0, out, 40);
    binary_1.writeUint32LE(x11 + j11 | 0, out, 44);
    binary_1.writeUint32LE(x12 + j12 | 0, out, 48);
    binary_1.writeUint32LE(x13 + j13 | 0, out, 52);
    binary_1.writeUint32LE(x14 + j14 | 0, out, 56);
    binary_1.writeUint32LE(x15 + j15 | 0, out, 60);
}
/**
 * Encrypt src with ChaCha20 stream generated for the given 32-byte key and
 * 8-byte (as in original implementation) or 12-byte (as in RFC7539) nonce and
 * write the result into dst and return it.
 *
 * dst and src may be the same, but otherwise must not overlap.
 *
 * If nonce is 12 bytes, users should not encrypt more than 256 GiB with the
 * same key and nonce, otherwise the stream will repeat. The function will
 * throw error if counter overflows to prevent this.
 *
 * If nonce is 8 bytes, the output is practically unlimited (2^70 bytes, which
 * is more than a million petabytes). However, it is not recommended to
 * generate 8-byte nonces randomly, as the chance of collision is high.
 *
 * Never use the same key and nonce to encrypt more than one message.
 *
 * If nonceInplaceCounterLength is not 0, the nonce is assumed to be a 16-byte
 * array with stream counter in first nonceInplaceCounterLength bytes and nonce
 * in the last remaining bytes. The counter will be incremented inplace for
 * each ChaCha block. This is useful if you need to encrypt one stream of data
 * in chunks.
 */
function streamXOR(key, nonce, src, dst, nonceInplaceCounterLength) {
    if (nonceInplaceCounterLength === void 0) { nonceInplaceCounterLength = 0; }
    // We only support 256-bit keys.
    if (key.length !== 32) {
        throw new Error("ChaCha: key size must be 32 bytes");
    }
    if (dst.length < src.length) {
        throw new Error("ChaCha: destination is shorter than source");
    }
    var nc;
    var counterLength;
    if (nonceInplaceCounterLength === 0) {
        if (nonce.length !== 8 && nonce.length !== 12) {
            throw new Error("ChaCha nonce must be 8 or 12 bytes");
        }
        nc = new Uint8Array(16);
        // First counterLength bytes of nc are counter, starting with zero.
        counterLength = nc.length - nonce.length;
        // Last bytes of nc after counterLength are nonce, set them.
        nc.set(nonce, counterLength);
    }
    else {
        if (nonce.length !== 16) {
            throw new Error("ChaCha nonce with counter must be 16 bytes");
        }
        // This will update passed nonce with counter inplace.
        nc = nonce;
        counterLength = nonceInplaceCounterLength;
    }
    // Allocate temporary space for ChaCha block.
    var block = new Uint8Array(64);
    for (var i = 0; i < src.length; i += 64) {
        // Generate a block.
        core(block, nc, key);
        // XOR block bytes with src into dst.
        for (var j = i; j < i + 64 && j < src.length; j++) {
            dst[j] = src[j] ^ block[j - i];
        }
        // Increment counter.
        incrementCounter(nc, 0, counterLength);
    }
    // Cleanup temporary space.
    wipe_1$2.wipe(block);
    if (nonceInplaceCounterLength === 0) {
        // Cleanup counter.
        wipe_1$2.wipe(nc);
    }
    return dst;
}
chacha.streamXOR = streamXOR;
/**
 * Generate ChaCha20 stream for the given 32-byte key and 8-byte or 12-byte
 * nonce and write it into dst and return it.
 *
 * Never use the same key and nonce to generate more than one stream.
 *
 * If nonceInplaceCounterLength is not 0, it behaves the same with respect to
 * the nonce as described in the streamXOR documentation.
 *
 * stream is like streamXOR with all-zero src.
 */
function stream(key, nonce, dst, nonceInplaceCounterLength) {
    if (nonceInplaceCounterLength === void 0) { nonceInplaceCounterLength = 0; }
    wipe_1$2.wipe(dst);
    return streamXOR(key, nonce, dst, dst, nonceInplaceCounterLength);
}
chacha.stream = stream;
function incrementCounter(counter, pos, len) {
    var carry = 1;
    while (len--) {
        carry = carry + (counter[pos] & 0xff) | 0;
        counter[pos] = carry & 0xff;
        carry >>>= 8;
        pos++;
    }
    if (carry > 0) {
        throw new Error("ChaCha: counter overflow");
    }
}

var poly1305 = {};

var constantTime = {};

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(constantTime, "__esModule", { value: true });
/**
 * Package constant-time provides functions for performing algorithmically constant-time operations.
 */
/**
 * NOTE! Due to the inability to guarantee real constant time evaluation of
 * anything in JavaScript VM, this is module is the best effort.
 */
/**
 * Returns resultIfOne if subject is 1, or resultIfZero if subject is 0.
 *
 * Supports only 32-bit integers, so resultIfOne or resultIfZero are not
 * integers, they'll be converted to them with bitwise operations.
 */
function select(subject, resultIfOne, resultIfZero) {
    return (~(subject - 1) & resultIfOne) | ((subject - 1) & resultIfZero);
}
constantTime.select = select;
/**
 * Returns 1 if a <= b, or 0 if not.
 * Arguments must be positive 32-bit integers less than or equal to 2^31 - 1.
 */
function lessOrEqual(a, b) {
    return (((a | 0) - (b | 0) - 1) >>> 31) & 1;
}
constantTime.lessOrEqual = lessOrEqual;
/**
 * Returns 1 if a and b are of equal length and their contents
 * are equal, or 0 otherwise.
 *
 * Note that unlike in equal(), zero-length inputs are considered
 * the same, so this function will return 1.
 */
function compare(a, b) {
    if (a.length !== b.length) {
        return 0;
    }
    var result = 0;
    for (var i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }
    return (1 & ((result - 1) >>> 8));
}
constantTime.compare = compare;
/**
 * Returns true if a and b are of equal non-zero length,
 * and their contents are equal, or false otherwise.
 *
 * Note that unlike in compare() zero-length inputs are considered
 * _not_ equal, so this function will return false.
 */
function equal(a, b) {
    if (a.length === 0 || b.length === 0) {
        return false;
    }
    return compare(a, b) !== 0;
}
constantTime.equal = equal;

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	/**
	 * Package poly1305 implements Poly1305 one-time message authentication algorithm.
	 */
	var constant_time_1 = constantTime;
	var wipe_1 = wipe$1;
	exports.DIGEST_LENGTH = 16;
	// Port of Andrew Moon's Poly1305-donna-16. Public domain.
	// https://github.com/floodyberry/poly1305-donna
	/**
	 * Poly1305 computes 16-byte authenticator of message using
	 * a one-time 32-byte key.
	 *
	 * Important: key should be used for only one message,
	 * it should never repeat.
	 */
	var Poly1305 = /** @class */ (function () {
	    function Poly1305(key) {
	        this.digestLength = exports.DIGEST_LENGTH;
	        this._buffer = new Uint8Array(16);
	        this._r = new Uint16Array(10);
	        this._h = new Uint16Array(10);
	        this._pad = new Uint16Array(8);
	        this._leftover = 0;
	        this._fin = 0;
	        this._finished = false;
	        var t0 = key[0] | key[1] << 8;
	        this._r[0] = (t0) & 0x1fff;
	        var t1 = key[2] | key[3] << 8;
	        this._r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
	        var t2 = key[4] | key[5] << 8;
	        this._r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03;
	        var t3 = key[6] | key[7] << 8;
	        this._r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
	        var t4 = key[8] | key[9] << 8;
	        this._r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff;
	        this._r[5] = ((t4 >>> 1)) & 0x1ffe;
	        var t5 = key[10] | key[11] << 8;
	        this._r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
	        var t6 = key[12] | key[13] << 8;
	        this._r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81;
	        var t7 = key[14] | key[15] << 8;
	        this._r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
	        this._r[9] = ((t7 >>> 5)) & 0x007f;
	        this._pad[0] = key[16] | key[17] << 8;
	        this._pad[1] = key[18] | key[19] << 8;
	        this._pad[2] = key[20] | key[21] << 8;
	        this._pad[3] = key[22] | key[23] << 8;
	        this._pad[4] = key[24] | key[25] << 8;
	        this._pad[5] = key[26] | key[27] << 8;
	        this._pad[6] = key[28] | key[29] << 8;
	        this._pad[7] = key[30] | key[31] << 8;
	    }
	    Poly1305.prototype._blocks = function (m, mpos, bytes) {
	        var hibit = this._fin ? 0 : 1 << 11;
	        var h0 = this._h[0], h1 = this._h[1], h2 = this._h[2], h3 = this._h[3], h4 = this._h[4], h5 = this._h[5], h6 = this._h[6], h7 = this._h[7], h8 = this._h[8], h9 = this._h[9];
	        var r0 = this._r[0], r1 = this._r[1], r2 = this._r[2], r3 = this._r[3], r4 = this._r[4], r5 = this._r[5], r6 = this._r[6], r7 = this._r[7], r8 = this._r[8], r9 = this._r[9];
	        while (bytes >= 16) {
	            var t0 = m[mpos + 0] | m[mpos + 1] << 8;
	            h0 += (t0) & 0x1fff;
	            var t1 = m[mpos + 2] | m[mpos + 3] << 8;
	            h1 += ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
	            var t2 = m[mpos + 4] | m[mpos + 5] << 8;
	            h2 += ((t1 >>> 10) | (t2 << 6)) & 0x1fff;
	            var t3 = m[mpos + 6] | m[mpos + 7] << 8;
	            h3 += ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
	            var t4 = m[mpos + 8] | m[mpos + 9] << 8;
	            h4 += ((t3 >>> 4) | (t4 << 12)) & 0x1fff;
	            h5 += ((t4 >>> 1)) & 0x1fff;
	            var t5 = m[mpos + 10] | m[mpos + 11] << 8;
	            h6 += ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
	            var t6 = m[mpos + 12] | m[mpos + 13] << 8;
	            h7 += ((t5 >>> 11) | (t6 << 5)) & 0x1fff;
	            var t7 = m[mpos + 14] | m[mpos + 15] << 8;
	            h8 += ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
	            h9 += ((t7 >>> 5)) | hibit;
	            var c = 0;
	            var d0 = c;
	            d0 += h0 * r0;
	            d0 += h1 * (5 * r9);
	            d0 += h2 * (5 * r8);
	            d0 += h3 * (5 * r7);
	            d0 += h4 * (5 * r6);
	            c = (d0 >>> 13);
	            d0 &= 0x1fff;
	            d0 += h5 * (5 * r5);
	            d0 += h6 * (5 * r4);
	            d0 += h7 * (5 * r3);
	            d0 += h8 * (5 * r2);
	            d0 += h9 * (5 * r1);
	            c += (d0 >>> 13);
	            d0 &= 0x1fff;
	            var d1 = c;
	            d1 += h0 * r1;
	            d1 += h1 * r0;
	            d1 += h2 * (5 * r9);
	            d1 += h3 * (5 * r8);
	            d1 += h4 * (5 * r7);
	            c = (d1 >>> 13);
	            d1 &= 0x1fff;
	            d1 += h5 * (5 * r6);
	            d1 += h6 * (5 * r5);
	            d1 += h7 * (5 * r4);
	            d1 += h8 * (5 * r3);
	            d1 += h9 * (5 * r2);
	            c += (d1 >>> 13);
	            d1 &= 0x1fff;
	            var d2 = c;
	            d2 += h0 * r2;
	            d2 += h1 * r1;
	            d2 += h2 * r0;
	            d2 += h3 * (5 * r9);
	            d2 += h4 * (5 * r8);
	            c = (d2 >>> 13);
	            d2 &= 0x1fff;
	            d2 += h5 * (5 * r7);
	            d2 += h6 * (5 * r6);
	            d2 += h7 * (5 * r5);
	            d2 += h8 * (5 * r4);
	            d2 += h9 * (5 * r3);
	            c += (d2 >>> 13);
	            d2 &= 0x1fff;
	            var d3 = c;
	            d3 += h0 * r3;
	            d3 += h1 * r2;
	            d3 += h2 * r1;
	            d3 += h3 * r0;
	            d3 += h4 * (5 * r9);
	            c = (d3 >>> 13);
	            d3 &= 0x1fff;
	            d3 += h5 * (5 * r8);
	            d3 += h6 * (5 * r7);
	            d3 += h7 * (5 * r6);
	            d3 += h8 * (5 * r5);
	            d3 += h9 * (5 * r4);
	            c += (d3 >>> 13);
	            d3 &= 0x1fff;
	            var d4 = c;
	            d4 += h0 * r4;
	            d4 += h1 * r3;
	            d4 += h2 * r2;
	            d4 += h3 * r1;
	            d4 += h4 * r0;
	            c = (d4 >>> 13);
	            d4 &= 0x1fff;
	            d4 += h5 * (5 * r9);
	            d4 += h6 * (5 * r8);
	            d4 += h7 * (5 * r7);
	            d4 += h8 * (5 * r6);
	            d4 += h9 * (5 * r5);
	            c += (d4 >>> 13);
	            d4 &= 0x1fff;
	            var d5 = c;
	            d5 += h0 * r5;
	            d5 += h1 * r4;
	            d5 += h2 * r3;
	            d5 += h3 * r2;
	            d5 += h4 * r1;
	            c = (d5 >>> 13);
	            d5 &= 0x1fff;
	            d5 += h5 * r0;
	            d5 += h6 * (5 * r9);
	            d5 += h7 * (5 * r8);
	            d5 += h8 * (5 * r7);
	            d5 += h9 * (5 * r6);
	            c += (d5 >>> 13);
	            d5 &= 0x1fff;
	            var d6 = c;
	            d6 += h0 * r6;
	            d6 += h1 * r5;
	            d6 += h2 * r4;
	            d6 += h3 * r3;
	            d6 += h4 * r2;
	            c = (d6 >>> 13);
	            d6 &= 0x1fff;
	            d6 += h5 * r1;
	            d6 += h6 * r0;
	            d6 += h7 * (5 * r9);
	            d6 += h8 * (5 * r8);
	            d6 += h9 * (5 * r7);
	            c += (d6 >>> 13);
	            d6 &= 0x1fff;
	            var d7 = c;
	            d7 += h0 * r7;
	            d7 += h1 * r6;
	            d7 += h2 * r5;
	            d7 += h3 * r4;
	            d7 += h4 * r3;
	            c = (d7 >>> 13);
	            d7 &= 0x1fff;
	            d7 += h5 * r2;
	            d7 += h6 * r1;
	            d7 += h7 * r0;
	            d7 += h8 * (5 * r9);
	            d7 += h9 * (5 * r8);
	            c += (d7 >>> 13);
	            d7 &= 0x1fff;
	            var d8 = c;
	            d8 += h0 * r8;
	            d8 += h1 * r7;
	            d8 += h2 * r6;
	            d8 += h3 * r5;
	            d8 += h4 * r4;
	            c = (d8 >>> 13);
	            d8 &= 0x1fff;
	            d8 += h5 * r3;
	            d8 += h6 * r2;
	            d8 += h7 * r1;
	            d8 += h8 * r0;
	            d8 += h9 * (5 * r9);
	            c += (d8 >>> 13);
	            d8 &= 0x1fff;
	            var d9 = c;
	            d9 += h0 * r9;
	            d9 += h1 * r8;
	            d9 += h2 * r7;
	            d9 += h3 * r6;
	            d9 += h4 * r5;
	            c = (d9 >>> 13);
	            d9 &= 0x1fff;
	            d9 += h5 * r4;
	            d9 += h6 * r3;
	            d9 += h7 * r2;
	            d9 += h8 * r1;
	            d9 += h9 * r0;
	            c += (d9 >>> 13);
	            d9 &= 0x1fff;
	            c = (((c << 2) + c)) | 0;
	            c = (c + d0) | 0;
	            d0 = c & 0x1fff;
	            c = (c >>> 13);
	            d1 += c;
	            h0 = d0;
	            h1 = d1;
	            h2 = d2;
	            h3 = d3;
	            h4 = d4;
	            h5 = d5;
	            h6 = d6;
	            h7 = d7;
	            h8 = d8;
	            h9 = d9;
	            mpos += 16;
	            bytes -= 16;
	        }
	        this._h[0] = h0;
	        this._h[1] = h1;
	        this._h[2] = h2;
	        this._h[3] = h3;
	        this._h[4] = h4;
	        this._h[5] = h5;
	        this._h[6] = h6;
	        this._h[7] = h7;
	        this._h[8] = h8;
	        this._h[9] = h9;
	    };
	    Poly1305.prototype.finish = function (mac, macpos) {
	        if (macpos === void 0) { macpos = 0; }
	        var g = new Uint16Array(10);
	        var c;
	        var mask;
	        var f;
	        var i;
	        if (this._leftover) {
	            i = this._leftover;
	            this._buffer[i++] = 1;
	            for (; i < 16; i++) {
	                this._buffer[i] = 0;
	            }
	            this._fin = 1;
	            this._blocks(this._buffer, 0, 16);
	        }
	        c = this._h[1] >>> 13;
	        this._h[1] &= 0x1fff;
	        for (i = 2; i < 10; i++) {
	            this._h[i] += c;
	            c = this._h[i] >>> 13;
	            this._h[i] &= 0x1fff;
	        }
	        this._h[0] += (c * 5);
	        c = this._h[0] >>> 13;
	        this._h[0] &= 0x1fff;
	        this._h[1] += c;
	        c = this._h[1] >>> 13;
	        this._h[1] &= 0x1fff;
	        this._h[2] += c;
	        g[0] = this._h[0] + 5;
	        c = g[0] >>> 13;
	        g[0] &= 0x1fff;
	        for (i = 1; i < 10; i++) {
	            g[i] = this._h[i] + c;
	            c = g[i] >>> 13;
	            g[i] &= 0x1fff;
	        }
	        g[9] -= (1 << 13);
	        mask = (c ^ 1) - 1;
	        for (i = 0; i < 10; i++) {
	            g[i] &= mask;
	        }
	        mask = ~mask;
	        for (i = 0; i < 10; i++) {
	            this._h[i] = (this._h[i] & mask) | g[i];
	        }
	        this._h[0] = ((this._h[0]) | (this._h[1] << 13)) & 0xffff;
	        this._h[1] = ((this._h[1] >>> 3) | (this._h[2] << 10)) & 0xffff;
	        this._h[2] = ((this._h[2] >>> 6) | (this._h[3] << 7)) & 0xffff;
	        this._h[3] = ((this._h[3] >>> 9) | (this._h[4] << 4)) & 0xffff;
	        this._h[4] = ((this._h[4] >>> 12) | (this._h[5] << 1) | (this._h[6] << 14)) & 0xffff;
	        this._h[5] = ((this._h[6] >>> 2) | (this._h[7] << 11)) & 0xffff;
	        this._h[6] = ((this._h[7] >>> 5) | (this._h[8] << 8)) & 0xffff;
	        this._h[7] = ((this._h[8] >>> 8) | (this._h[9] << 5)) & 0xffff;
	        f = this._h[0] + this._pad[0];
	        this._h[0] = f & 0xffff;
	        for (i = 1; i < 8; i++) {
	            f = (((this._h[i] + this._pad[i]) | 0) + (f >>> 16)) | 0;
	            this._h[i] = f & 0xffff;
	        }
	        mac[macpos + 0] = this._h[0] >>> 0;
	        mac[macpos + 1] = this._h[0] >>> 8;
	        mac[macpos + 2] = this._h[1] >>> 0;
	        mac[macpos + 3] = this._h[1] >>> 8;
	        mac[macpos + 4] = this._h[2] >>> 0;
	        mac[macpos + 5] = this._h[2] >>> 8;
	        mac[macpos + 6] = this._h[3] >>> 0;
	        mac[macpos + 7] = this._h[3] >>> 8;
	        mac[macpos + 8] = this._h[4] >>> 0;
	        mac[macpos + 9] = this._h[4] >>> 8;
	        mac[macpos + 10] = this._h[5] >>> 0;
	        mac[macpos + 11] = this._h[5] >>> 8;
	        mac[macpos + 12] = this._h[6] >>> 0;
	        mac[macpos + 13] = this._h[6] >>> 8;
	        mac[macpos + 14] = this._h[7] >>> 0;
	        mac[macpos + 15] = this._h[7] >>> 8;
	        this._finished = true;
	        return this;
	    };
	    Poly1305.prototype.update = function (m) {
	        var mpos = 0;
	        var bytes = m.length;
	        var want;
	        if (this._leftover) {
	            want = (16 - this._leftover);
	            if (want > bytes) {
	                want = bytes;
	            }
	            for (var i = 0; i < want; i++) {
	                this._buffer[this._leftover + i] = m[mpos + i];
	            }
	            bytes -= want;
	            mpos += want;
	            this._leftover += want;
	            if (this._leftover < 16) {
	                return this;
	            }
	            this._blocks(this._buffer, 0, 16);
	            this._leftover = 0;
	        }
	        if (bytes >= 16) {
	            want = bytes - (bytes % 16);
	            this._blocks(m, mpos, want);
	            mpos += want;
	            bytes -= want;
	        }
	        if (bytes) {
	            for (var i = 0; i < bytes; i++) {
	                this._buffer[this._leftover + i] = m[mpos + i];
	            }
	            this._leftover += bytes;
	        }
	        return this;
	    };
	    Poly1305.prototype.digest = function () {
	        // TODO(dchest): it behaves differently than other hashes/HMAC,
	        // because it throws when finished — others just return saved result.
	        if (this._finished) {
	            throw new Error("Poly1305 was finished");
	        }
	        var mac = new Uint8Array(16);
	        this.finish(mac);
	        return mac;
	    };
	    Poly1305.prototype.clean = function () {
	        wipe_1.wipe(this._buffer);
	        wipe_1.wipe(this._r);
	        wipe_1.wipe(this._h);
	        wipe_1.wipe(this._pad);
	        this._leftover = 0;
	        this._fin = 0;
	        this._finished = true; // mark as finished even if not
	        return this;
	    };
	    return Poly1305;
	}());
	exports.Poly1305 = Poly1305;
	/**
	 * Returns 16-byte authenticator of data using a one-time 32-byte key.
	 *
	 * Important: key should be used for only one message, it should never repeat.
	 */
	function oneTimeAuth(key, data) {
	    var h = new Poly1305(key);
	    h.update(data);
	    var digest = h.digest();
	    h.clean();
	    return digest;
	}
	exports.oneTimeAuth = oneTimeAuth;
	/**
	 * Returns true if two authenticators are 16-byte long and equal.
	 * Uses contant-time comparison to avoid leaking timing information.
	 */
	function equal(a, b) {
	    if (a.length !== exports.DIGEST_LENGTH || b.length !== exports.DIGEST_LENGTH) {
	        return false;
	    }
	    return constant_time_1.equal(a, b);
	}
	exports.equal = equal;
	
} (poly1305));

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	var chacha_1 = chacha;
	var poly1305_1 = poly1305;
	var wipe_1 = wipe$1;
	var binary_1 = binary;
	var constant_time_1 = constantTime;
	exports.KEY_LENGTH = 32;
	exports.NONCE_LENGTH = 12;
	exports.TAG_LENGTH = 16;
	var ZEROS = new Uint8Array(16);
	/**
	 * ChaCha20-Poly1305 Authenticated Encryption with Associated Data.
	 *
	 * Defined in RFC7539.
	 */
	var ChaCha20Poly1305 = /** @class */ (function () {
	    /**
	     * Creates a new instance with the given 32-byte key.
	     */
	    function ChaCha20Poly1305(key) {
	        this.nonceLength = exports.NONCE_LENGTH;
	        this.tagLength = exports.TAG_LENGTH;
	        if (key.length !== exports.KEY_LENGTH) {
	            throw new Error("ChaCha20Poly1305 needs 32-byte key");
	        }
	        // Copy key.
	        this._key = new Uint8Array(key);
	    }
	    /**
	     * Encrypts and authenticates plaintext, authenticates associated data,
	     * and returns sealed ciphertext, which includes authentication tag.
	     *
	     * RFC7539 specifies 12 bytes for nonce. It may be this 12-byte nonce
	     * ("IV"), or full 16-byte counter (called "32-bit fixed-common part")
	     * and nonce.
	     *
	     * If dst is given (it must be the size of plaintext + the size of tag
	     * length) the result will be put into it. Dst and plaintext must not
	     * overlap.
	     */
	    ChaCha20Poly1305.prototype.seal = function (nonce, plaintext, associatedData, dst) {
	        if (nonce.length > 16) {
	            throw new Error("ChaCha20Poly1305: incorrect nonce length");
	        }
	        // Allocate space for counter, and set nonce as last bytes of it.
	        var counter = new Uint8Array(16);
	        counter.set(nonce, counter.length - nonce.length);
	        // Generate authentication key by taking first 32-bytes of stream.
	        // We pass full counter, which has 12-byte nonce and 4-byte block counter,
	        // and it will get incremented after generating the block, which is
	        // exactly what we need: we only use the first 32 bytes of 64-byte
	        // ChaCha block and discard the next 32 bytes.
	        var authKey = new Uint8Array(32);
	        chacha_1.stream(this._key, counter, authKey, 4);
	        // Allocate space for sealed ciphertext.
	        var resultLength = plaintext.length + this.tagLength;
	        var result;
	        if (dst) {
	            if (dst.length !== resultLength) {
	                throw new Error("ChaCha20Poly1305: incorrect destination length");
	            }
	            result = dst;
	        }
	        else {
	            result = new Uint8Array(resultLength);
	        }
	        // Encrypt plaintext.
	        chacha_1.streamXOR(this._key, counter, plaintext, result, 4);
	        // Authenticate.
	        // XXX: can "simplify" here: pass full result (which is already padded
	        // due to zeroes prepared for tag), and ciphertext length instead of
	        // subarray of result.
	        this._authenticate(result.subarray(result.length - this.tagLength, result.length), authKey, result.subarray(0, result.length - this.tagLength), associatedData);
	        // Cleanup.
	        wipe_1.wipe(counter);
	        return result;
	    };
	    /**
	     * Authenticates sealed ciphertext (which includes authentication tag) and
	     * associated data, decrypts ciphertext and returns decrypted plaintext.
	     *
	     * RFC7539 specifies 12 bytes for nonce. It may be this 12-byte nonce
	     * ("IV"), or full 16-byte counter (called "32-bit fixed-common part")
	     * and nonce.
	     *
	     * If authentication fails, it returns null.
	     *
	     * If dst is given (it must be of ciphertext length minus tag length),
	     * the result will be put into it. Dst and plaintext must not overlap.
	     */
	    ChaCha20Poly1305.prototype.open = function (nonce, sealed, associatedData, dst) {
	        if (nonce.length > 16) {
	            throw new Error("ChaCha20Poly1305: incorrect nonce length");
	        }
	        // Sealed ciphertext should at least contain tag.
	        if (sealed.length < this.tagLength) {
	            // TODO(dchest): should we throw here instead?
	            return null;
	        }
	        // Allocate space for counter, and set nonce as last bytes of it.
	        var counter = new Uint8Array(16);
	        counter.set(nonce, counter.length - nonce.length);
	        // Generate authentication key by taking first 32-bytes of stream.
	        var authKey = new Uint8Array(32);
	        chacha_1.stream(this._key, counter, authKey, 4);
	        // Authenticate.
	        // XXX: can simplify and avoid allocation: since authenticate()
	        // already allocates tag (from Poly1305.digest(), it can return)
	        // it instead of copying to calculatedTag. But then in seal()
	        // we'll need to copy it.
	        var calculatedTag = new Uint8Array(this.tagLength);
	        this._authenticate(calculatedTag, authKey, sealed.subarray(0, sealed.length - this.tagLength), associatedData);
	        // Constant-time compare tags and return null if they differ.
	        if (!constant_time_1.equal(calculatedTag, sealed.subarray(sealed.length - this.tagLength, sealed.length))) {
	            return null;
	        }
	        // Allocate space for decrypted plaintext.
	        var resultLength = sealed.length - this.tagLength;
	        var result;
	        if (dst) {
	            if (dst.length !== resultLength) {
	                throw new Error("ChaCha20Poly1305: incorrect destination length");
	            }
	            result = dst;
	        }
	        else {
	            result = new Uint8Array(resultLength);
	        }
	        // Decrypt.
	        chacha_1.streamXOR(this._key, counter, sealed.subarray(0, sealed.length - this.tagLength), result, 4);
	        // Cleanup.
	        wipe_1.wipe(counter);
	        return result;
	    };
	    ChaCha20Poly1305.prototype.clean = function () {
	        wipe_1.wipe(this._key);
	        return this;
	    };
	    ChaCha20Poly1305.prototype._authenticate = function (tagOut, authKey, ciphertext, associatedData) {
	        // Initialize Poly1305 with authKey.
	        var h = new poly1305_1.Poly1305(authKey);
	        // Authenticate padded associated data.
	        if (associatedData) {
	            h.update(associatedData);
	            if (associatedData.length % 16 > 0) {
	                h.update(ZEROS.subarray(associatedData.length % 16));
	            }
	        }
	        // Authenticate padded ciphertext.
	        h.update(ciphertext);
	        if (ciphertext.length % 16 > 0) {
	            h.update(ZEROS.subarray(ciphertext.length % 16));
	        }
	        // Authenticate length of associated data.
	        // XXX: can avoid allocation here?
	        var length = new Uint8Array(8);
	        if (associatedData) {
	            binary_1.writeUint64LE(associatedData.length, length);
	        }
	        h.update(length);
	        // Authenticate length of ciphertext.
	        binary_1.writeUint64LE(ciphertext.length, length);
	        h.update(length);
	        // Get tag and copy it into tagOut.
	        var tag = h.digest();
	        for (var i = 0; i < tag.length; i++) {
	            tagOut[i] = tag[i];
	        }
	        // Cleanup.
	        h.clean();
	        wipe_1.wipe(tag);
	        wipe_1.wipe(length);
	    };
	    return ChaCha20Poly1305;
	}());
	exports.ChaCha20Poly1305 = ChaCha20Poly1305;
	
} (chacha20poly1305));

var hkdf = {};

var hmac$1 = {};

var hash = {};

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(hash, "__esModule", { value: true });
function isSerializableHash(h) {
    return (typeof h.saveState !== "undefined" &&
        typeof h.restoreState !== "undefined" &&
        typeof h.cleanSavedState !== "undefined");
}
hash.isSerializableHash = isSerializableHash;

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(hmac$1, "__esModule", { value: true });
/**
 * Package hmac implements HMAC algorithm.
 */
var hash_1 = hash;
var constant_time_1 = constantTime;
var wipe_1$1 = wipe$1;
/**
 *  HMAC implements hash-based message authentication algorithm.
 */
var HMAC = /** @class */ (function () {
    /**
     * Constructs a new HMAC with the given Hash and secret key.
     */
    function HMAC(hash, key) {
        this._finished = false; // true if HMAC was finalized
        // Initialize inner and outer hashes.
        this._inner = new hash();
        this._outer = new hash();
        // Set block and digest sizes for this HMAC
        // instance to values from the hash.
        this.blockSize = this._outer.blockSize;
        this.digestLength = this._outer.digestLength;
        // Pad temporary stores a key (or its hash) padded with zeroes.
        var pad = new Uint8Array(this.blockSize);
        if (key.length > this.blockSize) {
            // If key is bigger than hash block size, it must be
            // hashed and this hash is used as a key instead.
            this._inner.update(key).finish(pad).clean();
        }
        else {
            // Otherwise, copy the key into pad.
            pad.set(key);
        }
        // Now two different keys are derived from padded key
        // by xoring a different byte value to each.
        // To make inner hash key, xor byte 0x36 into pad.
        for (var i = 0; i < pad.length; i++) {
            pad[i] ^= 0x36;
        }
        // Update inner hash with the result.
        this._inner.update(pad);
        // To make outer hash key, xor byte 0x5c into pad.
        // But since we already xored 0x36 there, we must
        // first undo this by xoring it again.
        for (var i = 0; i < pad.length; i++) {
            pad[i] ^= 0x36 ^ 0x5c;
        }
        // Update outer hash with the result.
        this._outer.update(pad);
        // Save states of both hashes, so that we can quickly restore
        // them later in reset() without the need to remember the actual
        // key and perform this initialization again.
        if (hash_1.isSerializableHash(this._inner) && hash_1.isSerializableHash(this._outer)) {
            this._innerKeyedState = this._inner.saveState();
            this._outerKeyedState = this._outer.saveState();
        }
        // Clean pad.
        wipe_1$1.wipe(pad);
    }
    /**
     * Returns HMAC state to the state initialized with key
     * to make it possible to run HMAC over the other data with the same
     * key without creating a new instance.
     */
    HMAC.prototype.reset = function () {
        if (!hash_1.isSerializableHash(this._inner) || !hash_1.isSerializableHash(this._outer)) {
            throw new Error("hmac: can't reset() because hash doesn't implement restoreState()");
        }
        // Restore keyed states of inner and outer hashes.
        this._inner.restoreState(this._innerKeyedState);
        this._outer.restoreState(this._outerKeyedState);
        this._finished = false;
        return this;
    };
    /**
     * Cleans HMAC state.
     */
    HMAC.prototype.clean = function () {
        if (hash_1.isSerializableHash(this._inner)) {
            this._inner.cleanSavedState(this._innerKeyedState);
        }
        if (hash_1.isSerializableHash(this._outer)) {
            this._outer.cleanSavedState(this._outerKeyedState);
        }
        this._inner.clean();
        this._outer.clean();
    };
    /**
     * Updates state with provided data.
     */
    HMAC.prototype.update = function (data) {
        this._inner.update(data);
        return this;
    };
    /**
     * Finalizes HMAC and puts the result in out.
     */
    HMAC.prototype.finish = function (out) {
        if (this._finished) {
            // If HMAC was finalized, outer hash is also finalized,
            // so it produces the same digest it produced when it
            // was finalized.
            this._outer.finish(out);
            return this;
        }
        // Finalize inner hash and store the result temporarily.
        this._inner.finish(out);
        // Update outer hash with digest of inner hash and and finalize it.
        this._outer.update(out.subarray(0, this.digestLength)).finish(out);
        this._finished = true;
        return this;
    };
    /**
     * Returns the computed message authentication code.
     */
    HMAC.prototype.digest = function () {
        var out = new Uint8Array(this.digestLength);
        this.finish(out);
        return out;
    };
    /**
     * Saves HMAC state.
     * This function is needed for PBKDF2 optimization.
     */
    HMAC.prototype.saveState = function () {
        if (!hash_1.isSerializableHash(this._inner)) {
            throw new Error("hmac: can't saveState() because hash doesn't implement it");
        }
        return this._inner.saveState();
    };
    HMAC.prototype.restoreState = function (savedState) {
        if (!hash_1.isSerializableHash(this._inner) || !hash_1.isSerializableHash(this._outer)) {
            throw new Error("hmac: can't restoreState() because hash doesn't implement it");
        }
        this._inner.restoreState(savedState);
        this._outer.restoreState(this._outerKeyedState);
        this._finished = false;
        return this;
    };
    HMAC.prototype.cleanSavedState = function (savedState) {
        if (!hash_1.isSerializableHash(this._inner)) {
            throw new Error("hmac: can't cleanSavedState() because hash doesn't implement it");
        }
        this._inner.cleanSavedState(savedState);
    };
    return HMAC;
}());
hmac$1.HMAC = HMAC;
/**
 * Returns HMAC using the given hash constructor for the key over data.
 */
function hmac(hash, key, data) {
    var h = new HMAC(hash, key);
    h.update(data);
    var digest = h.digest();
    h.clean();
    return digest;
}
hmac$1.hmac = hmac;
/**
 * Returns true if two HMAC digests are equal.
 * Uses constant-time comparison to avoid leaking timing information.
 *
 * Example:
 *
 *    const receivedDigest = ...
 *    const realDigest = hmac(SHA256, key, data);
 *    if (!equal(receivedDigest, realDigest)) {
 *        throw new Error("Authentication error");
 *    }
 */
hmac$1.equal = constant_time_1.equal;

// Copyright (C) 2016 Dmitry Chestnykh
// MIT License. See LICENSE file for details.
Object.defineProperty(hkdf, "__esModule", { value: true });
var hmac_1 = hmac$1;
var wipe_1 = wipe$1;
/**
 * HMAC-based Extract-and-Expand Key Derivation Function.
 *
 * Implements HKDF from RFC5869.
 *
 * Expands the given master key with salt and info into
 * a limited stream of key material.
 */
var HKDF = /** @class */ (function () {
    /**
     * Create a new HKDF instance for the given hash function
     * with the master key, optional salt, and info.
     *
     * - Master key is a high-entropy secret key (not a password).
     * - Salt is a non-secret random value.
     * - Info is application- and/or context-specific information.
     */
    function HKDF(hash, key, salt, info) {
        if (salt === void 0) { salt = new Uint8Array(0); }
        this._counter = new Uint8Array(1); // starts with zero
        this._hash = hash;
        this._info = info;
        // HKDF-Extract uses salt as HMAC key, and key as data.
        var okm = hmac_1.hmac(this._hash, salt, key);
        // Initialize HMAC for expanding with extracted key.
        this._hmac = new hmac_1.HMAC(hash, okm);
        // Allocate buffer.
        this._buffer = new Uint8Array(this._hmac.digestLength);
        this._bufpos = this._buffer.length;
    }
    // Fill buffer with new block of HKDF-Extract output.
    HKDF.prototype._fillBuffer = function () {
        // Increment counter.
        this._counter[0]++;
        var ctr = this._counter[0];
        // Check if counter overflowed.
        if (ctr === 0) {
            throw new Error("hkdf: cannot expand more");
        }
        // Prepare HMAC instance for new data with old key.
        this._hmac.reset();
        // Hash in previous output if it was generated
        // (i.e. counter is greater than 1).
        if (ctr > 1) {
            this._hmac.update(this._buffer);
        }
        // Hash in info if it exists.
        if (this._info) {
            this._hmac.update(this._info);
        }
        // Hash in the counter.
        this._hmac.update(this._counter);
        // Output result to buffer and clean HMAC instance.
        this._hmac.finish(this._buffer);
        // Reset buffer position.
        this._bufpos = 0;
    };
    /**
     * Expand returns next key material of the given length.
     *
     * It throws if expansion limit is reached (which is
     * 254 digests of the underlying HMAC function).
     */
    HKDF.prototype.expand = function (length) {
        var out = new Uint8Array(length);
        for (var i = 0; i < out.length; i++) {
            if (this._bufpos === this._buffer.length) {
                this._fillBuffer();
            }
            out[i] = this._buffer[this._bufpos++];
        }
        return out;
    };
    HKDF.prototype.clean = function () {
        this._hmac.clean();
        wipe_1.wipe(this._buffer);
        wipe_1.wipe(this._counter);
        this._bufpos = 0;
    };
    return HKDF;
}());
var HKDF_1 = hkdf.HKDF = HKDF;

var sha256 = {};

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	var binary_1 = binary;
	var wipe_1 = wipe$1;
	exports.DIGEST_LENGTH = 32;
	exports.BLOCK_SIZE = 64;
	/**
	 * SHA2-256 cryptographic hash algorithm.
	 */
	var SHA256 = /** @class */ (function () {
	    function SHA256() {
	        /** Length of hash output */
	        this.digestLength = exports.DIGEST_LENGTH;
	        /** Block size */
	        this.blockSize = exports.BLOCK_SIZE;
	        // Note: Int32Array is used instead of Uint32Array for performance reasons.
	        this._state = new Int32Array(8); // hash state
	        this._temp = new Int32Array(64); // temporary state
	        this._buffer = new Uint8Array(128); // buffer for data to hash
	        this._bufferLength = 0; // number of bytes in buffer
	        this._bytesHashed = 0; // number of total bytes hashed
	        this._finished = false; // indicates whether the hash was finalized
	        this.reset();
	    }
	    SHA256.prototype._initState = function () {
	        this._state[0] = 0x6a09e667;
	        this._state[1] = 0xbb67ae85;
	        this._state[2] = 0x3c6ef372;
	        this._state[3] = 0xa54ff53a;
	        this._state[4] = 0x510e527f;
	        this._state[5] = 0x9b05688c;
	        this._state[6] = 0x1f83d9ab;
	        this._state[7] = 0x5be0cd19;
	    };
	    /**
	     * Resets hash state making it possible
	     * to re-use this instance to hash other data.
	     */
	    SHA256.prototype.reset = function () {
	        this._initState();
	        this._bufferLength = 0;
	        this._bytesHashed = 0;
	        this._finished = false;
	        return this;
	    };
	    /**
	     * Cleans internal buffers and resets hash state.
	     */
	    SHA256.prototype.clean = function () {
	        wipe_1.wipe(this._buffer);
	        wipe_1.wipe(this._temp);
	        this.reset();
	    };
	    /**
	     * Updates hash state with the given data.
	     *
	     * Throws error when trying to update already finalized hash:
	     * instance must be reset to update it again.
	     */
	    SHA256.prototype.update = function (data, dataLength) {
	        if (dataLength === void 0) { dataLength = data.length; }
	        if (this._finished) {
	            throw new Error("SHA256: can't update because hash was finished.");
	        }
	        var dataPos = 0;
	        this._bytesHashed += dataLength;
	        if (this._bufferLength > 0) {
	            while (this._bufferLength < this.blockSize && dataLength > 0) {
	                this._buffer[this._bufferLength++] = data[dataPos++];
	                dataLength--;
	            }
	            if (this._bufferLength === this.blockSize) {
	                hashBlocks(this._temp, this._state, this._buffer, 0, this.blockSize);
	                this._bufferLength = 0;
	            }
	        }
	        if (dataLength >= this.blockSize) {
	            dataPos = hashBlocks(this._temp, this._state, data, dataPos, dataLength);
	            dataLength %= this.blockSize;
	        }
	        while (dataLength > 0) {
	            this._buffer[this._bufferLength++] = data[dataPos++];
	            dataLength--;
	        }
	        return this;
	    };
	    /**
	     * Finalizes hash state and puts hash into out.
	     * If hash was already finalized, puts the same value.
	     */
	    SHA256.prototype.finish = function (out) {
	        if (!this._finished) {
	            var bytesHashed = this._bytesHashed;
	            var left = this._bufferLength;
	            var bitLenHi = (bytesHashed / 0x20000000) | 0;
	            var bitLenLo = bytesHashed << 3;
	            var padLength = (bytesHashed % 64 < 56) ? 64 : 128;
	            this._buffer[left] = 0x80;
	            for (var i = left + 1; i < padLength - 8; i++) {
	                this._buffer[i] = 0;
	            }
	            binary_1.writeUint32BE(bitLenHi, this._buffer, padLength - 8);
	            binary_1.writeUint32BE(bitLenLo, this._buffer, padLength - 4);
	            hashBlocks(this._temp, this._state, this._buffer, 0, padLength);
	            this._finished = true;
	        }
	        for (var i = 0; i < this.digestLength / 4; i++) {
	            binary_1.writeUint32BE(this._state[i], out, i * 4);
	        }
	        return this;
	    };
	    /**
	     * Returns the final hash digest.
	     */
	    SHA256.prototype.digest = function () {
	        var out = new Uint8Array(this.digestLength);
	        this.finish(out);
	        return out;
	    };
	    /**
	     * Function useful for HMAC/PBKDF2 optimization.
	     * Returns hash state to be used with restoreState().
	     * Only chain value is saved, not buffers or other
	     * state variables.
	     */
	    SHA256.prototype.saveState = function () {
	        if (this._finished) {
	            throw new Error("SHA256: cannot save finished state");
	        }
	        return {
	            state: new Int32Array(this._state),
	            buffer: this._bufferLength > 0 ? new Uint8Array(this._buffer) : undefined,
	            bufferLength: this._bufferLength,
	            bytesHashed: this._bytesHashed
	        };
	    };
	    /**
	     * Function useful for HMAC/PBKDF2 optimization.
	     * Restores state saved by saveState() and sets bytesHashed
	     * to the given value.
	     */
	    SHA256.prototype.restoreState = function (savedState) {
	        this._state.set(savedState.state);
	        this._bufferLength = savedState.bufferLength;
	        if (savedState.buffer) {
	            this._buffer.set(savedState.buffer);
	        }
	        this._bytesHashed = savedState.bytesHashed;
	        this._finished = false;
	        return this;
	    };
	    /**
	     * Cleans state returned by saveState().
	     */
	    SHA256.prototype.cleanSavedState = function (savedState) {
	        wipe_1.wipe(savedState.state);
	        if (savedState.buffer) {
	            wipe_1.wipe(savedState.buffer);
	        }
	        savedState.bufferLength = 0;
	        savedState.bytesHashed = 0;
	    };
	    return SHA256;
	}());
	exports.SHA256 = SHA256;
	// Constants
	var K = new Int32Array([
	    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
	    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
	    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
	    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
	    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
	    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
	    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
	    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
	    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
	    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	]);
	function hashBlocks(w, v, p, pos, len) {
	    while (len >= 64) {
	        var a = v[0];
	        var b = v[1];
	        var c = v[2];
	        var d = v[3];
	        var e = v[4];
	        var f = v[5];
	        var g = v[6];
	        var h = v[7];
	        for (var i = 0; i < 16; i++) {
	            var j = pos + i * 4;
	            w[i] = binary_1.readUint32BE(p, j);
	        }
	        for (var i = 16; i < 64; i++) {
	            var u = w[i - 2];
	            var t1 = (u >>> 17 | u << (32 - 17)) ^ (u >>> 19 | u << (32 - 19)) ^ (u >>> 10);
	            u = w[i - 15];
	            var t2 = (u >>> 7 | u << (32 - 7)) ^ (u >>> 18 | u << (32 - 18)) ^ (u >>> 3);
	            w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
	        }
	        for (var i = 0; i < 64; i++) {
	            var t1 = (((((e >>> 6 | e << (32 - 6)) ^ (e >>> 11 | e << (32 - 11)) ^
	                (e >>> 25 | e << (32 - 25))) + ((e & f) ^ (~e & g))) | 0) +
	                ((h + ((K[i] + w[i]) | 0)) | 0)) | 0;
	            var t2 = (((a >>> 2 | a << (32 - 2)) ^ (a >>> 13 | a << (32 - 13)) ^
	                (a >>> 22 | a << (32 - 22))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
	            h = g;
	            g = f;
	            f = e;
	            e = (d + t1) | 0;
	            d = c;
	            c = b;
	            b = a;
	            a = (t1 + t2) | 0;
	        }
	        v[0] += a;
	        v[1] += b;
	        v[2] += c;
	        v[3] += d;
	        v[4] += e;
	        v[5] += f;
	        v[6] += g;
	        v[7] += h;
	        pos += 64;
	        len -= 64;
	    }
	    return pos;
	}
	function hash(data) {
	    var h = new SHA256();
	    h.update(data);
	    var digest = h.digest();
	    h.clean();
	    return digest;
	}
	exports.hash = hash;
	
} (sha256));

var x25519 = {};

(function (exports) {
	// Copyright (C) 2016 Dmitry Chestnykh
	// MIT License. See LICENSE file for details.
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.sharedKey = exports.generateKeyPair = exports.generateKeyPairFromSeed = exports.scalarMultBase = exports.scalarMult = exports.SHARED_KEY_LENGTH = exports.SECRET_KEY_LENGTH = exports.PUBLIC_KEY_LENGTH = void 0;
	/**
	 * Package x25519 implements X25519 key agreement.
	 */
	const random_1 = random;
	const wipe_1 = wipe$1;
	exports.PUBLIC_KEY_LENGTH = 32;
	exports.SECRET_KEY_LENGTH = 32;
	exports.SHARED_KEY_LENGTH = 32;
	// Returns new zero-filled 16-element GF (Float64Array).
	// If passed an array of numbers, prefills the returned
	// array with them.
	//
	// We use Float64Array, because we need 48-bit numbers
	// for this implementation.
	function gf(init) {
	    const r = new Float64Array(16);
	    if (init) {
	        for (let i = 0; i < init.length; i++) {
	            r[i] = init[i];
	        }
	    }
	    return r;
	}
	// Base point.
	const _9 = new Uint8Array(32);
	_9[0] = 9;
	const _121665 = gf([0xdb41, 1]);
	function car25519(o) {
	    let c = 1;
	    for (let i = 0; i < 16; i++) {
	        let v = o[i] + c + 65535;
	        c = Math.floor(v / 65536);
	        o[i] = v - c * 65536;
	    }
	    o[0] += c - 1 + 37 * (c - 1);
	}
	function sel25519(p, q, b) {
	    const c = ~(b - 1);
	    for (let i = 0; i < 16; i++) {
	        const t = c & (p[i] ^ q[i]);
	        p[i] ^= t;
	        q[i] ^= t;
	    }
	}
	function pack25519(o, n) {
	    const m = gf();
	    const t = gf();
	    for (let i = 0; i < 16; i++) {
	        t[i] = n[i];
	    }
	    car25519(t);
	    car25519(t);
	    car25519(t);
	    for (let j = 0; j < 2; j++) {
	        m[0] = t[0] - 0xffed;
	        for (let i = 1; i < 15; i++) {
	            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
	            m[i - 1] &= 0xffff;
	        }
	        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
	        const b = (m[15] >> 16) & 1;
	        m[14] &= 0xffff;
	        sel25519(t, m, 1 - b);
	    }
	    for (let i = 0; i < 16; i++) {
	        o[2 * i] = t[i] & 0xff;
	        o[2 * i + 1] = t[i] >> 8;
	    }
	}
	function unpack25519(o, n) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = n[2 * i] + (n[2 * i + 1] << 8);
	    }
	    o[15] &= 0x7fff;
	}
	function add(o, a, b) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = a[i] + b[i];
	    }
	}
	function sub(o, a, b) {
	    for (let i = 0; i < 16; i++) {
	        o[i] = a[i] - b[i];
	    }
	}
	function mul(o, a, b) {
	    let v, c, t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0, t8 = 0, t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0, t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0, t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0, b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
	    v = a[0];
	    t0 += v * b0;
	    t1 += v * b1;
	    t2 += v * b2;
	    t3 += v * b3;
	    t4 += v * b4;
	    t5 += v * b5;
	    t6 += v * b6;
	    t7 += v * b7;
	    t8 += v * b8;
	    t9 += v * b9;
	    t10 += v * b10;
	    t11 += v * b11;
	    t12 += v * b12;
	    t13 += v * b13;
	    t14 += v * b14;
	    t15 += v * b15;
	    v = a[1];
	    t1 += v * b0;
	    t2 += v * b1;
	    t3 += v * b2;
	    t4 += v * b3;
	    t5 += v * b4;
	    t6 += v * b5;
	    t7 += v * b6;
	    t8 += v * b7;
	    t9 += v * b8;
	    t10 += v * b9;
	    t11 += v * b10;
	    t12 += v * b11;
	    t13 += v * b12;
	    t14 += v * b13;
	    t15 += v * b14;
	    t16 += v * b15;
	    v = a[2];
	    t2 += v * b0;
	    t3 += v * b1;
	    t4 += v * b2;
	    t5 += v * b3;
	    t6 += v * b4;
	    t7 += v * b5;
	    t8 += v * b6;
	    t9 += v * b7;
	    t10 += v * b8;
	    t11 += v * b9;
	    t12 += v * b10;
	    t13 += v * b11;
	    t14 += v * b12;
	    t15 += v * b13;
	    t16 += v * b14;
	    t17 += v * b15;
	    v = a[3];
	    t3 += v * b0;
	    t4 += v * b1;
	    t5 += v * b2;
	    t6 += v * b3;
	    t7 += v * b4;
	    t8 += v * b5;
	    t9 += v * b6;
	    t10 += v * b7;
	    t11 += v * b8;
	    t12 += v * b9;
	    t13 += v * b10;
	    t14 += v * b11;
	    t15 += v * b12;
	    t16 += v * b13;
	    t17 += v * b14;
	    t18 += v * b15;
	    v = a[4];
	    t4 += v * b0;
	    t5 += v * b1;
	    t6 += v * b2;
	    t7 += v * b3;
	    t8 += v * b4;
	    t9 += v * b5;
	    t10 += v * b6;
	    t11 += v * b7;
	    t12 += v * b8;
	    t13 += v * b9;
	    t14 += v * b10;
	    t15 += v * b11;
	    t16 += v * b12;
	    t17 += v * b13;
	    t18 += v * b14;
	    t19 += v * b15;
	    v = a[5];
	    t5 += v * b0;
	    t6 += v * b1;
	    t7 += v * b2;
	    t8 += v * b3;
	    t9 += v * b4;
	    t10 += v * b5;
	    t11 += v * b6;
	    t12 += v * b7;
	    t13 += v * b8;
	    t14 += v * b9;
	    t15 += v * b10;
	    t16 += v * b11;
	    t17 += v * b12;
	    t18 += v * b13;
	    t19 += v * b14;
	    t20 += v * b15;
	    v = a[6];
	    t6 += v * b0;
	    t7 += v * b1;
	    t8 += v * b2;
	    t9 += v * b3;
	    t10 += v * b4;
	    t11 += v * b5;
	    t12 += v * b6;
	    t13 += v * b7;
	    t14 += v * b8;
	    t15 += v * b9;
	    t16 += v * b10;
	    t17 += v * b11;
	    t18 += v * b12;
	    t19 += v * b13;
	    t20 += v * b14;
	    t21 += v * b15;
	    v = a[7];
	    t7 += v * b0;
	    t8 += v * b1;
	    t9 += v * b2;
	    t10 += v * b3;
	    t11 += v * b4;
	    t12 += v * b5;
	    t13 += v * b6;
	    t14 += v * b7;
	    t15 += v * b8;
	    t16 += v * b9;
	    t17 += v * b10;
	    t18 += v * b11;
	    t19 += v * b12;
	    t20 += v * b13;
	    t21 += v * b14;
	    t22 += v * b15;
	    v = a[8];
	    t8 += v * b0;
	    t9 += v * b1;
	    t10 += v * b2;
	    t11 += v * b3;
	    t12 += v * b4;
	    t13 += v * b5;
	    t14 += v * b6;
	    t15 += v * b7;
	    t16 += v * b8;
	    t17 += v * b9;
	    t18 += v * b10;
	    t19 += v * b11;
	    t20 += v * b12;
	    t21 += v * b13;
	    t22 += v * b14;
	    t23 += v * b15;
	    v = a[9];
	    t9 += v * b0;
	    t10 += v * b1;
	    t11 += v * b2;
	    t12 += v * b3;
	    t13 += v * b4;
	    t14 += v * b5;
	    t15 += v * b6;
	    t16 += v * b7;
	    t17 += v * b8;
	    t18 += v * b9;
	    t19 += v * b10;
	    t20 += v * b11;
	    t21 += v * b12;
	    t22 += v * b13;
	    t23 += v * b14;
	    t24 += v * b15;
	    v = a[10];
	    t10 += v * b0;
	    t11 += v * b1;
	    t12 += v * b2;
	    t13 += v * b3;
	    t14 += v * b4;
	    t15 += v * b5;
	    t16 += v * b6;
	    t17 += v * b7;
	    t18 += v * b8;
	    t19 += v * b9;
	    t20 += v * b10;
	    t21 += v * b11;
	    t22 += v * b12;
	    t23 += v * b13;
	    t24 += v * b14;
	    t25 += v * b15;
	    v = a[11];
	    t11 += v * b0;
	    t12 += v * b1;
	    t13 += v * b2;
	    t14 += v * b3;
	    t15 += v * b4;
	    t16 += v * b5;
	    t17 += v * b6;
	    t18 += v * b7;
	    t19 += v * b8;
	    t20 += v * b9;
	    t21 += v * b10;
	    t22 += v * b11;
	    t23 += v * b12;
	    t24 += v * b13;
	    t25 += v * b14;
	    t26 += v * b15;
	    v = a[12];
	    t12 += v * b0;
	    t13 += v * b1;
	    t14 += v * b2;
	    t15 += v * b3;
	    t16 += v * b4;
	    t17 += v * b5;
	    t18 += v * b6;
	    t19 += v * b7;
	    t20 += v * b8;
	    t21 += v * b9;
	    t22 += v * b10;
	    t23 += v * b11;
	    t24 += v * b12;
	    t25 += v * b13;
	    t26 += v * b14;
	    t27 += v * b15;
	    v = a[13];
	    t13 += v * b0;
	    t14 += v * b1;
	    t15 += v * b2;
	    t16 += v * b3;
	    t17 += v * b4;
	    t18 += v * b5;
	    t19 += v * b6;
	    t20 += v * b7;
	    t21 += v * b8;
	    t22 += v * b9;
	    t23 += v * b10;
	    t24 += v * b11;
	    t25 += v * b12;
	    t26 += v * b13;
	    t27 += v * b14;
	    t28 += v * b15;
	    v = a[14];
	    t14 += v * b0;
	    t15 += v * b1;
	    t16 += v * b2;
	    t17 += v * b3;
	    t18 += v * b4;
	    t19 += v * b5;
	    t20 += v * b6;
	    t21 += v * b7;
	    t22 += v * b8;
	    t23 += v * b9;
	    t24 += v * b10;
	    t25 += v * b11;
	    t26 += v * b12;
	    t27 += v * b13;
	    t28 += v * b14;
	    t29 += v * b15;
	    v = a[15];
	    t15 += v * b0;
	    t16 += v * b1;
	    t17 += v * b2;
	    t18 += v * b3;
	    t19 += v * b4;
	    t20 += v * b5;
	    t21 += v * b6;
	    t22 += v * b7;
	    t23 += v * b8;
	    t24 += v * b9;
	    t25 += v * b10;
	    t26 += v * b11;
	    t27 += v * b12;
	    t28 += v * b13;
	    t29 += v * b14;
	    t30 += v * b15;
	    t0 += 38 * t16;
	    t1 += 38 * t17;
	    t2 += 38 * t18;
	    t3 += 38 * t19;
	    t4 += 38 * t20;
	    t5 += 38 * t21;
	    t6 += 38 * t22;
	    t7 += 38 * t23;
	    t8 += 38 * t24;
	    t9 += 38 * t25;
	    t10 += 38 * t26;
	    t11 += 38 * t27;
	    t12 += 38 * t28;
	    t13 += 38 * t29;
	    t14 += 38 * t30;
	    // t15 left as is
	    // first car
	    c = 1;
	    v = t0 + c + 65535;
	    c = Math.floor(v / 65536);
	    t0 = v - c * 65536;
	    v = t1 + c + 65535;
	    c = Math.floor(v / 65536);
	    t1 = v - c * 65536;
	    v = t2 + c + 65535;
	    c = Math.floor(v / 65536);
	    t2 = v - c * 65536;
	    v = t3 + c + 65535;
	    c = Math.floor(v / 65536);
	    t3 = v - c * 65536;
	    v = t4 + c + 65535;
	    c = Math.floor(v / 65536);
	    t4 = v - c * 65536;
	    v = t5 + c + 65535;
	    c = Math.floor(v / 65536);
	    t5 = v - c * 65536;
	    v = t6 + c + 65535;
	    c = Math.floor(v / 65536);
	    t6 = v - c * 65536;
	    v = t7 + c + 65535;
	    c = Math.floor(v / 65536);
	    t7 = v - c * 65536;
	    v = t8 + c + 65535;
	    c = Math.floor(v / 65536);
	    t8 = v - c * 65536;
	    v = t9 + c + 65535;
	    c = Math.floor(v / 65536);
	    t9 = v - c * 65536;
	    v = t10 + c + 65535;
	    c = Math.floor(v / 65536);
	    t10 = v - c * 65536;
	    v = t11 + c + 65535;
	    c = Math.floor(v / 65536);
	    t11 = v - c * 65536;
	    v = t12 + c + 65535;
	    c = Math.floor(v / 65536);
	    t12 = v - c * 65536;
	    v = t13 + c + 65535;
	    c = Math.floor(v / 65536);
	    t13 = v - c * 65536;
	    v = t14 + c + 65535;
	    c = Math.floor(v / 65536);
	    t14 = v - c * 65536;
	    v = t15 + c + 65535;
	    c = Math.floor(v / 65536);
	    t15 = v - c * 65536;
	    t0 += c - 1 + 37 * (c - 1);
	    // second car
	    c = 1;
	    v = t0 + c + 65535;
	    c = Math.floor(v / 65536);
	    t0 = v - c * 65536;
	    v = t1 + c + 65535;
	    c = Math.floor(v / 65536);
	    t1 = v - c * 65536;
	    v = t2 + c + 65535;
	    c = Math.floor(v / 65536);
	    t2 = v - c * 65536;
	    v = t3 + c + 65535;
	    c = Math.floor(v / 65536);
	    t3 = v - c * 65536;
	    v = t4 + c + 65535;
	    c = Math.floor(v / 65536);
	    t4 = v - c * 65536;
	    v = t5 + c + 65535;
	    c = Math.floor(v / 65536);
	    t5 = v - c * 65536;
	    v = t6 + c + 65535;
	    c = Math.floor(v / 65536);
	    t6 = v - c * 65536;
	    v = t7 + c + 65535;
	    c = Math.floor(v / 65536);
	    t7 = v - c * 65536;
	    v = t8 + c + 65535;
	    c = Math.floor(v / 65536);
	    t8 = v - c * 65536;
	    v = t9 + c + 65535;
	    c = Math.floor(v / 65536);
	    t9 = v - c * 65536;
	    v = t10 + c + 65535;
	    c = Math.floor(v / 65536);
	    t10 = v - c * 65536;
	    v = t11 + c + 65535;
	    c = Math.floor(v / 65536);
	    t11 = v - c * 65536;
	    v = t12 + c + 65535;
	    c = Math.floor(v / 65536);
	    t12 = v - c * 65536;
	    v = t13 + c + 65535;
	    c = Math.floor(v / 65536);
	    t13 = v - c * 65536;
	    v = t14 + c + 65535;
	    c = Math.floor(v / 65536);
	    t14 = v - c * 65536;
	    v = t15 + c + 65535;
	    c = Math.floor(v / 65536);
	    t15 = v - c * 65536;
	    t0 += c - 1 + 37 * (c - 1);
	    o[0] = t0;
	    o[1] = t1;
	    o[2] = t2;
	    o[3] = t3;
	    o[4] = t4;
	    o[5] = t5;
	    o[6] = t6;
	    o[7] = t7;
	    o[8] = t8;
	    o[9] = t9;
	    o[10] = t10;
	    o[11] = t11;
	    o[12] = t12;
	    o[13] = t13;
	    o[14] = t14;
	    o[15] = t15;
	}
	function square(o, a) {
	    mul(o, a, a);
	}
	function inv25519(o, inp) {
	    const c = gf();
	    for (let i = 0; i < 16; i++) {
	        c[i] = inp[i];
	    }
	    for (let i = 253; i >= 0; i--) {
	        square(c, c);
	        if (i !== 2 && i !== 4) {
	            mul(c, c, inp);
	        }
	    }
	    for (let i = 0; i < 16; i++) {
	        o[i] = c[i];
	    }
	}
	function scalarMult(n, p) {
	    const z = new Uint8Array(32);
	    const x = new Float64Array(80);
	    const a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf();
	    for (let i = 0; i < 31; i++) {
	        z[i] = n[i];
	    }
	    z[31] = (n[31] & 127) | 64;
	    z[0] &= 248;
	    unpack25519(x, p);
	    for (let i = 0; i < 16; i++) {
	        b[i] = x[i];
	    }
	    a[0] = d[0] = 1;
	    for (let i = 254; i >= 0; --i) {
	        const r = (z[i >>> 3] >>> (i & 7)) & 1;
	        sel25519(a, b, r);
	        sel25519(c, d, r);
	        add(e, a, c);
	        sub(a, a, c);
	        add(c, b, d);
	        sub(b, b, d);
	        square(d, e);
	        square(f, a);
	        mul(a, c, a);
	        mul(c, b, e);
	        add(e, a, c);
	        sub(a, a, c);
	        square(b, a);
	        sub(c, d, f);
	        mul(a, c, _121665);
	        add(a, a, d);
	        mul(c, c, a);
	        mul(a, d, f);
	        mul(d, b, x);
	        square(b, e);
	        sel25519(a, b, r);
	        sel25519(c, d, r);
	    }
	    for (let i = 0; i < 16; i++) {
	        x[i + 16] = a[i];
	        x[i + 32] = c[i];
	        x[i + 48] = b[i];
	        x[i + 64] = d[i];
	    }
	    const x32 = x.subarray(32);
	    const x16 = x.subarray(16);
	    inv25519(x32, x32);
	    mul(x16, x16, x32);
	    const q = new Uint8Array(32);
	    pack25519(q, x16);
	    return q;
	}
	exports.scalarMult = scalarMult;
	function scalarMultBase(n) {
	    return scalarMult(n, _9);
	}
	exports.scalarMultBase = scalarMultBase;
	function generateKeyPairFromSeed(seed) {
	    if (seed.length !== exports.SECRET_KEY_LENGTH) {
	        throw new Error(`x25519: seed must be ${exports.SECRET_KEY_LENGTH} bytes`);
	    }
	    const secretKey = new Uint8Array(seed);
	    const publicKey = scalarMultBase(secretKey);
	    return {
	        publicKey,
	        secretKey
	    };
	}
	exports.generateKeyPairFromSeed = generateKeyPairFromSeed;
	function generateKeyPair(prng) {
	    const seed = (0, random_1.randomBytes)(32, prng);
	    const result = generateKeyPairFromSeed(seed);
	    (0, wipe_1.wipe)(seed);
	    return result;
	}
	exports.generateKeyPair = generateKeyPair;
	/**
	 * Returns a shared key between our secret key and a peer's public key.
	 *
	 * Throws an error if the given keys are of wrong length.
	 *
	 * If rejectZero is true throws if the calculated shared key is all-zero.
	 * From RFC 7748:
	 *
	 * > Protocol designers using Diffie-Hellman over the curves defined in
	 * > this document must not assume "contributory behavior".  Specially,
	 * > contributory behavior means that both parties' private keys
	 * > contribute to the resulting shared key.  Since curve25519 and
	 * > curve448 have cofactors of 8 and 4 (respectively), an input point of
	 * > small order will eliminate any contribution from the other party's
	 * > private key.  This situation can be detected by checking for the all-
	 * > zero output, which implementations MAY do, as specified in Section 6.
	 * > However, a large number of existing implementations do not do this.
	 *
	 * IMPORTANT: the returned key is a raw result of scalar multiplication.
	 * To use it as a key material, hash it with a cryptographic hash function.
	 */
	function sharedKey(mySecretKey, theirPublicKey, rejectZero = false) {
	    if (mySecretKey.length !== exports.PUBLIC_KEY_LENGTH) {
	        throw new Error("X25519: incorrect secret key length");
	    }
	    if (theirPublicKey.length !== exports.PUBLIC_KEY_LENGTH) {
	        throw new Error("X25519: incorrect public key length");
	    }
	    const result = scalarMult(mySecretKey, theirPublicKey);
	    if (rejectZero) {
	        let zeros = 0;
	        for (let i = 0; i < result.length; i++) {
	            zeros |= result[i];
	        }
	        if (zeros === 0) {
	            throw new Error("X25519: invalid shared key");
	        }
	    }
	    return result;
	}
	exports.sharedKey = sharedKey;
	
} (x25519));

var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var BrowserInfo = /** @class */ (function () {
    function BrowserInfo(name, version, os) {
        this.name = name;
        this.version = version;
        this.os = os;
        this.type = 'browser';
    }
    return BrowserInfo;
}());
var NodeInfo = /** @class */ (function () {
    function NodeInfo(version) {
        this.version = version;
        this.type = 'node';
        this.name = 'node';
        this.os = process.platform;
    }
    return NodeInfo;
}());
var SearchBotDeviceInfo = /** @class */ (function () {
    function SearchBotDeviceInfo(name, version, os, bot) {
        this.name = name;
        this.version = version;
        this.os = os;
        this.bot = bot;
        this.type = 'bot-device';
    }
    return SearchBotDeviceInfo;
}());
var BotInfo = /** @class */ (function () {
    function BotInfo() {
        this.type = 'bot';
        this.bot = true; // NOTE: deprecated test name instead
        this.name = 'bot';
        this.version = null;
        this.os = null;
    }
    return BotInfo;
}());
var ReactNativeInfo = /** @class */ (function () {
    function ReactNativeInfo() {
        this.type = 'react-native';
        this.name = 'react-native';
        this.version = null;
        this.os = null;
    }
    return ReactNativeInfo;
}());
// tslint:disable-next-line:max-line-length
var SEARCHBOX_UA_REGEX = /alexa|bot|crawl(er|ing)|facebookexternalhit|feedburner|google web preview|nagios|postrank|pingdom|slurp|spider|yahoo!|yandex/;
var SEARCHBOT_OS_REGEX = /(nuhk|curl|Googlebot|Yammybot|Openbot|Slurp|MSNBot|Ask\ Jeeves\/Teoma|ia_archiver)/;
var REQUIRED_VERSION_PARTS = 3;
var userAgentRules = [
    ['aol', /AOLShield\/([0-9\._]+)/],
    ['edge', /Edge\/([0-9\._]+)/],
    ['edge-ios', /EdgiOS\/([0-9\._]+)/],
    ['yandexbrowser', /YaBrowser\/([0-9\._]+)/],
    ['kakaotalk', /KAKAOTALK\s([0-9\.]+)/],
    ['samsung', /SamsungBrowser\/([0-9\.]+)/],
    ['silk', /\bSilk\/([0-9._-]+)\b/],
    ['miui', /MiuiBrowser\/([0-9\.]+)$/],
    ['beaker', /BeakerBrowser\/([0-9\.]+)/],
    ['edge-chromium', /EdgA?\/([0-9\.]+)/],
    [
        'chromium-webview',
        /(?!Chrom.*OPR)wv\).*Chrom(?:e|ium)\/([0-9\.]+)(:?\s|$)/,
    ],
    ['chrome', /(?!Chrom.*OPR)Chrom(?:e|ium)\/([0-9\.]+)(:?\s|$)/],
    ['phantomjs', /PhantomJS\/([0-9\.]+)(:?\s|$)/],
    ['crios', /CriOS\/([0-9\.]+)(:?\s|$)/],
    ['firefox', /Firefox\/([0-9\.]+)(?:\s|$)/],
    ['fxios', /FxiOS\/([0-9\.]+)/],
    ['opera-mini', /Opera Mini.*Version\/([0-9\.]+)/],
    ['opera', /Opera\/([0-9\.]+)(?:\s|$)/],
    ['opera', /OPR\/([0-9\.]+)(:?\s|$)/],
    ['pie', /^Microsoft Pocket Internet Explorer\/(\d+\.\d+)$/],
    ['pie', /^Mozilla\/\d\.\d+\s\(compatible;\s(?:MSP?IE|MSInternet Explorer) (\d+\.\d+);.*Windows CE.*\)$/],
    ['netfront', /^Mozilla\/\d\.\d+.*NetFront\/(\d.\d)/],
    ['ie', /Trident\/7\.0.*rv\:([0-9\.]+).*\).*Gecko$/],
    ['ie', /MSIE\s([0-9\.]+);.*Trident\/[4-7].0/],
    ['ie', /MSIE\s(7\.0)/],
    ['bb10', /BB10;\sTouch.*Version\/([0-9\.]+)/],
    ['android', /Android\s([0-9\.]+)/],
    ['ios', /Version\/([0-9\._]+).*Mobile.*Safari.*/],
    ['safari', /Version\/([0-9\._]+).*Safari/],
    ['facebook', /FB[AS]V\/([0-9\.]+)/],
    ['instagram', /Instagram\s([0-9\.]+)/],
    ['ios-webview', /AppleWebKit\/([0-9\.]+).*Mobile/],
    ['ios-webview', /AppleWebKit\/([0-9\.]+).*Gecko\)$/],
    ['curl', /^curl\/([0-9\.]+)$/],
    ['searchbot', SEARCHBOX_UA_REGEX],
];
var operatingSystemRules = [
    ['iOS', /iP(hone|od|ad)/],
    ['Android OS', /Android/],
    ['BlackBerry OS', /BlackBerry|BB10/],
    ['Windows Mobile', /IEMobile/],
    ['Amazon OS', /Kindle/],
    ['Windows 3.11', /Win16/],
    ['Windows 95', /(Windows 95)|(Win95)|(Windows_95)/],
    ['Windows 98', /(Windows 98)|(Win98)/],
    ['Windows 2000', /(Windows NT 5.0)|(Windows 2000)/],
    ['Windows XP', /(Windows NT 5.1)|(Windows XP)/],
    ['Windows Server 2003', /(Windows NT 5.2)/],
    ['Windows Vista', /(Windows NT 6.0)/],
    ['Windows 7', /(Windows NT 6.1)/],
    ['Windows 8', /(Windows NT 6.2)/],
    ['Windows 8.1', /(Windows NT 6.3)/],
    ['Windows 10', /(Windows NT 10.0)/],
    ['Windows ME', /Windows ME/],
    ['Windows CE', /Windows CE|WinCE|Microsoft Pocket Internet Explorer/],
    ['Open BSD', /OpenBSD/],
    ['Sun OS', /SunOS/],
    ['Chrome OS', /CrOS/],
    ['Linux', /(Linux)|(X11)/],
    ['Mac OS', /(Mac_PowerPC)|(Macintosh)/],
    ['QNX', /QNX/],
    ['BeOS', /BeOS/],
    ['OS/2', /OS\/2/],
];
function detect(userAgent) {
    if (!!userAgent) {
        return parseUserAgent(userAgent);
    }
    if (typeof document === 'undefined' &&
        typeof navigator !== 'undefined' &&
        navigator.product === 'ReactNative') {
        return new ReactNativeInfo();
    }
    if (typeof navigator !== 'undefined') {
        return parseUserAgent(navigator.userAgent);
    }
    return getNodeVersion();
}
function matchUserAgent(ua) {
    // opted for using reduce here rather than Array#first with a regex.test call
    // this is primarily because using the reduce we only perform the regex
    // execution once rather than once for the test and for the exec again below
    // probably something that needs to be benchmarked though
    return (ua !== '' &&
        userAgentRules.reduce(function (matched, _a) {
            var browser = _a[0], regex = _a[1];
            if (matched) {
                return matched;
            }
            var uaMatch = regex.exec(ua);
            return !!uaMatch && [browser, uaMatch];
        }, false));
}
function parseUserAgent(ua) {
    var matchedRule = matchUserAgent(ua);
    if (!matchedRule) {
        return null;
    }
    var name = matchedRule[0], match = matchedRule[1];
    if (name === 'searchbot') {
        return new BotInfo();
    }
    // Do not use RegExp for split operation as some browser do not support it (See: http://blog.stevenlevithan.com/archives/cross-browser-split)
    var versionParts = match[1] && match[1].split('.').join('_').split('_').slice(0, 3);
    if (versionParts) {
        if (versionParts.length < REQUIRED_VERSION_PARTS) {
            versionParts = __spreadArray(__spreadArray([], versionParts, true), createVersionParts(REQUIRED_VERSION_PARTS - versionParts.length), true);
        }
    }
    else {
        versionParts = [];
    }
    var version = versionParts.join('.');
    var os = detectOS(ua);
    var searchBotMatch = SEARCHBOT_OS_REGEX.exec(ua);
    if (searchBotMatch && searchBotMatch[1]) {
        return new SearchBotDeviceInfo(name, version, os, searchBotMatch[1]);
    }
    return new BrowserInfo(name, version, os);
}
function detectOS(ua) {
    for (var ii = 0, count = operatingSystemRules.length; ii < count; ii++) {
        var _a = operatingSystemRules[ii], os = _a[0], regex = _a[1];
        var match = regex.exec(ua);
        if (match) {
            return os;
        }
    }
    return null;
}
function getNodeVersion() {
    var isNode = typeof process !== 'undefined' && process.version;
    return isNode ? new NodeInfo(process.version.slice(1)) : null;
}
function createVersionParts(count) {
    var output = [];
    for (var ii = 0; ii < count; ii++) {
        output.push('0');
    }
    return output;
}

var cjs$2 = {};

Object.defineProperty(cjs$2, "__esModule", { value: true });
cjs$2.getLocalStorage = cjs$2.getLocalStorageOrThrow = cjs$2.getCrypto = cjs$2.getCryptoOrThrow = getLocation_1 = cjs$2.getLocation = cjs$2.getLocationOrThrow = getNavigator_1 = cjs$2.getNavigator = cjs$2.getNavigatorOrThrow = getDocument_1 = cjs$2.getDocument = cjs$2.getDocumentOrThrow = cjs$2.getFromWindowOrThrow = cjs$2.getFromWindow = void 0;
function getFromWindow(name) {
    let res = undefined;
    if (typeof window !== "undefined" && typeof window[name] !== "undefined") {
        res = window[name];
    }
    return res;
}
cjs$2.getFromWindow = getFromWindow;
function getFromWindowOrThrow(name) {
    const res = getFromWindow(name);
    if (!res) {
        throw new Error(`${name} is not defined in Window`);
    }
    return res;
}
cjs$2.getFromWindowOrThrow = getFromWindowOrThrow;
function getDocumentOrThrow() {
    return getFromWindowOrThrow("document");
}
cjs$2.getDocumentOrThrow = getDocumentOrThrow;
function getDocument() {
    return getFromWindow("document");
}
var getDocument_1 = cjs$2.getDocument = getDocument;
function getNavigatorOrThrow() {
    return getFromWindowOrThrow("navigator");
}
cjs$2.getNavigatorOrThrow = getNavigatorOrThrow;
function getNavigator() {
    return getFromWindow("navigator");
}
var getNavigator_1 = cjs$2.getNavigator = getNavigator;
function getLocationOrThrow() {
    return getFromWindowOrThrow("location");
}
cjs$2.getLocationOrThrow = getLocationOrThrow;
function getLocation() {
    return getFromWindow("location");
}
var getLocation_1 = cjs$2.getLocation = getLocation;
function getCryptoOrThrow() {
    return getFromWindowOrThrow("crypto");
}
cjs$2.getCryptoOrThrow = getCryptoOrThrow;
function getCrypto() {
    return getFromWindow("crypto");
}
cjs$2.getCrypto = getCrypto;
function getLocalStorageOrThrow() {
    return getFromWindowOrThrow("localStorage");
}
cjs$2.getLocalStorageOrThrow = getLocalStorageOrThrow;
function getLocalStorage() {
    return getFromWindow("localStorage");
}
cjs$2.getLocalStorage = getLocalStorage;

var cjs$1 = {};

Object.defineProperty(cjs$1, "__esModule", { value: true });
var getWindowMetadata_1 = cjs$1.getWindowMetadata = void 0;
const window_getters_1 = cjs$2;
function getWindowMetadata() {
    let doc;
    let loc;
    try {
        doc = window_getters_1.getDocumentOrThrow();
        loc = window_getters_1.getLocationOrThrow();
    }
    catch (e) {
        return null;
    }
    function getIcons() {
        const links = doc.getElementsByTagName("link");
        const icons = [];
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const rel = link.getAttribute("rel");
            if (rel) {
                if (rel.toLowerCase().indexOf("icon") > -1) {
                    const href = link.getAttribute("href");
                    if (href) {
                        if (href.toLowerCase().indexOf("https:") === -1 &&
                            href.toLowerCase().indexOf("http:") === -1 &&
                            href.indexOf("//") !== 0) {
                            let absoluteHref = loc.protocol + "//" + loc.host;
                            if (href.indexOf("/") === 0) {
                                absoluteHref += href;
                            }
                            else {
                                const path = loc.pathname.split("/");
                                path.pop();
                                const finalPath = path.join("/");
                                absoluteHref += finalPath + "/" + href;
                            }
                            icons.push(absoluteHref);
                        }
                        else if (href.indexOf("//") === 0) {
                            const absoluteUrl = loc.protocol + href;
                            icons.push(absoluteUrl);
                        }
                        else {
                            icons.push(href);
                        }
                    }
                }
            }
        }
        return icons;
    }
    function getWindowMetadataOfAny(...args) {
        const metaTags = doc.getElementsByTagName("meta");
        for (let i = 0; i < metaTags.length; i++) {
            const tag = metaTags[i];
            const attributes = ["itemprop", "property", "name"]
                .map((target) => tag.getAttribute(target))
                .filter((attr) => {
                if (attr) {
                    return args.includes(attr);
                }
                return false;
            });
            if (attributes.length && attributes) {
                const content = tag.getAttribute("content");
                if (content) {
                    return content;
                }
            }
        }
        return "";
    }
    function getName() {
        let name = getWindowMetadataOfAny("name", "og:site_name", "og:title", "twitter:title");
        if (!name) {
            name = doc.title;
        }
        return name;
    }
    function getDescription() {
        const description = getWindowMetadataOfAny("description", "og:description", "twitter:description", "keywords");
        return description;
    }
    const name = getName();
    const description = getDescription();
    const url = loc.origin;
    const icons = getIcons();
    const meta = {
        description,
        url,
        icons,
        name,
    };
    return meta;
}
getWindowMetadata_1 = cjs$1.getWindowMetadata = getWindowMetadata;

var queryString = {};

var strictUriEncode = str => encodeURIComponent(str).replace(/[!'()*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);

var token = '%[a-f0-9]{2}';
var singleMatcher = new RegExp('(' + token + ')|([^%]+?)', 'gi');
var multiMatcher = new RegExp('(' + token + ')+', 'gi');

function decodeComponents(components, split) {
	try {
		// Try to decode the entire string first
		return [decodeURIComponent(components.join(''))];
	} catch (err) {
		// Do nothing
	}

	if (components.length === 1) {
		return components;
	}

	split = split || 1;

	// Split the array in 2 parts
	var left = components.slice(0, split);
	var right = components.slice(split);

	return Array.prototype.concat.call([], decodeComponents(left), decodeComponents(right));
}

function decode(input) {
	try {
		return decodeURIComponent(input);
	} catch (err) {
		var tokens = input.match(singleMatcher) || [];

		for (var i = 1; i < tokens.length; i++) {
			input = decodeComponents(tokens, i).join('');

			tokens = input.match(singleMatcher) || [];
		}

		return input;
	}
}

function customDecodeURIComponent(input) {
	// Keep track of all the replacements and prefill the map with the `BOM`
	var replaceMap = {
		'%FE%FF': '\uFFFD\uFFFD',
		'%FF%FE': '\uFFFD\uFFFD'
	};

	var match = multiMatcher.exec(input);
	while (match) {
		try {
			// Decode as big chunks as possible
			replaceMap[match[0]] = decodeURIComponent(match[0]);
		} catch (err) {
			var result = decode(match[0]);

			if (result !== match[0]) {
				replaceMap[match[0]] = result;
			}
		}

		match = multiMatcher.exec(input);
	}

	// Add `%C2` at the end of the map to make sure it does not replace the combinator before everything else
	replaceMap['%C2'] = '\uFFFD';

	var entries = Object.keys(replaceMap);

	for (var i = 0; i < entries.length; i++) {
		// Replace all decoded components
		var key = entries[i];
		input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
	}

	return input;
}

var decodeUriComponent = function (encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
	}

	try {
		encodedURI = encodedURI.replace(/\+/g, ' ');

		// Try the built in decoder first
		return decodeURIComponent(encodedURI);
	} catch (err) {
		// Fallback to a more advanced decoder
		return customDecodeURIComponent(encodedURI);
	}
};

var splitOnFirst = (string, separator) => {
	if (!(typeof string === 'string' && typeof separator === 'string')) {
		throw new TypeError('Expected the arguments to be of type `string`');
	}

	if (separator === '') {
		return [string];
	}

	const separatorIndex = string.indexOf(separator);

	if (separatorIndex === -1) {
		return [string];
	}

	return [
		string.slice(0, separatorIndex),
		string.slice(separatorIndex + separator.length)
	];
};

var filterObj = function (obj, predicate) {
	var ret = {};
	var keys = Object.keys(obj);
	var isArr = Array.isArray(predicate);

	for (var i = 0; i < keys.length; i++) {
		var key = keys[i];
		var val = obj[key];

		if (isArr ? predicate.indexOf(key) !== -1 : predicate(key, val, obj)) {
			ret[key] = val;
		}
	}

	return ret;
};

(function (exports) {
	const strictUriEncode$1 = strictUriEncode;
	const decodeComponent = decodeUriComponent;
	const splitOnFirst$1 = splitOnFirst;
	const filterObject = filterObj;

	const isNullOrUndefined = value => value === null || value === undefined;

	const encodeFragmentIdentifier = Symbol('encodeFragmentIdentifier');

	function encoderForArrayFormat(options) {
		switch (options.arrayFormat) {
			case 'index':
				return key => (result, value) => {
					const index = result.length;

					if (
						value === undefined ||
						(options.skipNull && value === null) ||
						(options.skipEmptyString && value === '')
					) {
						return result;
					}

					if (value === null) {
						return [...result, [encode(key, options), '[', index, ']'].join('')];
					}

					return [
						...result,
						[encode(key, options), '[', encode(index, options), ']=', encode(value, options)].join('')
					];
				};

			case 'bracket':
				return key => (result, value) => {
					if (
						value === undefined ||
						(options.skipNull && value === null) ||
						(options.skipEmptyString && value === '')
					) {
						return result;
					}

					if (value === null) {
						return [...result, [encode(key, options), '[]'].join('')];
					}

					return [...result, [encode(key, options), '[]=', encode(value, options)].join('')];
				};

			case 'colon-list-separator':
				return key => (result, value) => {
					if (
						value === undefined ||
						(options.skipNull && value === null) ||
						(options.skipEmptyString && value === '')
					) {
						return result;
					}

					if (value === null) {
						return [...result, [encode(key, options), ':list='].join('')];
					}

					return [...result, [encode(key, options), ':list=', encode(value, options)].join('')];
				};

			case 'comma':
			case 'separator':
			case 'bracket-separator': {
				const keyValueSep = options.arrayFormat === 'bracket-separator' ?
					'[]=' :
					'=';

				return key => (result, value) => {
					if (
						value === undefined ||
						(options.skipNull && value === null) ||
						(options.skipEmptyString && value === '')
					) {
						return result;
					}

					// Translate null to an empty string so that it doesn't serialize as 'null'
					value = value === null ? '' : value;

					if (result.length === 0) {
						return [[encode(key, options), keyValueSep, encode(value, options)].join('')];
					}

					return [[result, encode(value, options)].join(options.arrayFormatSeparator)];
				};
			}

			default:
				return key => (result, value) => {
					if (
						value === undefined ||
						(options.skipNull && value === null) ||
						(options.skipEmptyString && value === '')
					) {
						return result;
					}

					if (value === null) {
						return [...result, encode(key, options)];
					}

					return [...result, [encode(key, options), '=', encode(value, options)].join('')];
				};
		}
	}

	function parserForArrayFormat(options) {
		let result;

		switch (options.arrayFormat) {
			case 'index':
				return (key, value, accumulator) => {
					result = /\[(\d*)\]$/.exec(key);

					key = key.replace(/\[\d*\]$/, '');

					if (!result) {
						accumulator[key] = value;
						return;
					}

					if (accumulator[key] === undefined) {
						accumulator[key] = {};
					}

					accumulator[key][result[1]] = value;
				};

			case 'bracket':
				return (key, value, accumulator) => {
					result = /(\[\])$/.exec(key);
					key = key.replace(/\[\]$/, '');

					if (!result) {
						accumulator[key] = value;
						return;
					}

					if (accumulator[key] === undefined) {
						accumulator[key] = [value];
						return;
					}

					accumulator[key] = [].concat(accumulator[key], value);
				};

			case 'colon-list-separator':
				return (key, value, accumulator) => {
					result = /(:list)$/.exec(key);
					key = key.replace(/:list$/, '');

					if (!result) {
						accumulator[key] = value;
						return;
					}

					if (accumulator[key] === undefined) {
						accumulator[key] = [value];
						return;
					}

					accumulator[key] = [].concat(accumulator[key], value);
				};

			case 'comma':
			case 'separator':
				return (key, value, accumulator) => {
					const isArray = typeof value === 'string' && value.includes(options.arrayFormatSeparator);
					const isEncodedArray = (typeof value === 'string' && !isArray && decode(value, options).includes(options.arrayFormatSeparator));
					value = isEncodedArray ? decode(value, options) : value;
					const newValue = isArray || isEncodedArray ? value.split(options.arrayFormatSeparator).map(item => decode(item, options)) : value === null ? value : decode(value, options);
					accumulator[key] = newValue;
				};

			case 'bracket-separator':
				return (key, value, accumulator) => {
					const isArray = /(\[\])$/.test(key);
					key = key.replace(/\[\]$/, '');

					if (!isArray) {
						accumulator[key] = value ? decode(value, options) : value;
						return;
					}

					const arrayValue = value === null ?
						[] :
						value.split(options.arrayFormatSeparator).map(item => decode(item, options));

					if (accumulator[key] === undefined) {
						accumulator[key] = arrayValue;
						return;
					}

					accumulator[key] = [].concat(accumulator[key], arrayValue);
				};

			default:
				return (key, value, accumulator) => {
					if (accumulator[key] === undefined) {
						accumulator[key] = value;
						return;
					}

					accumulator[key] = [].concat(accumulator[key], value);
				};
		}
	}

	function validateArrayFormatSeparator(value) {
		if (typeof value !== 'string' || value.length !== 1) {
			throw new TypeError('arrayFormatSeparator must be single character string');
		}
	}

	function encode(value, options) {
		if (options.encode) {
			return options.strict ? strictUriEncode$1(value) : encodeURIComponent(value);
		}

		return value;
	}

	function decode(value, options) {
		if (options.decode) {
			return decodeComponent(value);
		}

		return value;
	}

	function keysSorter(input) {
		if (Array.isArray(input)) {
			return input.sort();
		}

		if (typeof input === 'object') {
			return keysSorter(Object.keys(input))
				.sort((a, b) => Number(a) - Number(b))
				.map(key => input[key]);
		}

		return input;
	}

	function removeHash(input) {
		const hashStart = input.indexOf('#');
		if (hashStart !== -1) {
			input = input.slice(0, hashStart);
		}

		return input;
	}

	function getHash(url) {
		let hash = '';
		const hashStart = url.indexOf('#');
		if (hashStart !== -1) {
			hash = url.slice(hashStart);
		}

		return hash;
	}

	function extract(input) {
		input = removeHash(input);
		const queryStart = input.indexOf('?');
		if (queryStart === -1) {
			return '';
		}

		return input.slice(queryStart + 1);
	}

	function parseValue(value, options) {
		if (options.parseNumbers && !Number.isNaN(Number(value)) && (typeof value === 'string' && value.trim() !== '')) {
			value = Number(value);
		} else if (options.parseBooleans && value !== null && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
			value = value.toLowerCase() === 'true';
		}

		return value;
	}

	function parse(query, options) {
		options = Object.assign({
			decode: true,
			sort: true,
			arrayFormat: 'none',
			arrayFormatSeparator: ',',
			parseNumbers: false,
			parseBooleans: false
		}, options);

		validateArrayFormatSeparator(options.arrayFormatSeparator);

		const formatter = parserForArrayFormat(options);

		// Create an object with no prototype
		const ret = Object.create(null);

		if (typeof query !== 'string') {
			return ret;
		}

		query = query.trim().replace(/^[?#&]/, '');

		if (!query) {
			return ret;
		}

		for (const param of query.split('&')) {
			if (param === '') {
				continue;
			}

			let [key, value] = splitOnFirst$1(options.decode ? param.replace(/\+/g, ' ') : param, '=');

			// Missing `=` should be `null`:
			// http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
			value = value === undefined ? null : ['comma', 'separator', 'bracket-separator'].includes(options.arrayFormat) ? value : decode(value, options);
			formatter(decode(key, options), value, ret);
		}

		for (const key of Object.keys(ret)) {
			const value = ret[key];
			if (typeof value === 'object' && value !== null) {
				for (const k of Object.keys(value)) {
					value[k] = parseValue(value[k], options);
				}
			} else {
				ret[key] = parseValue(value, options);
			}
		}

		if (options.sort === false) {
			return ret;
		}

		return (options.sort === true ? Object.keys(ret).sort() : Object.keys(ret).sort(options.sort)).reduce((result, key) => {
			const value = ret[key];
			if (Boolean(value) && typeof value === 'object' && !Array.isArray(value)) {
				// Sort object keys, not values
				result[key] = keysSorter(value);
			} else {
				result[key] = value;
			}

			return result;
		}, Object.create(null));
	}

	exports.extract = extract;
	exports.parse = parse;

	exports.stringify = (object, options) => {
		if (!object) {
			return '';
		}

		options = Object.assign({
			encode: true,
			strict: true,
			arrayFormat: 'none',
			arrayFormatSeparator: ','
		}, options);

		validateArrayFormatSeparator(options.arrayFormatSeparator);

		const shouldFilter = key => (
			(options.skipNull && isNullOrUndefined(object[key])) ||
			(options.skipEmptyString && object[key] === '')
		);

		const formatter = encoderForArrayFormat(options);

		const objectCopy = {};

		for (const key of Object.keys(object)) {
			if (!shouldFilter(key)) {
				objectCopy[key] = object[key];
			}
		}

		const keys = Object.keys(objectCopy);

		if (options.sort !== false) {
			keys.sort(options.sort);
		}

		return keys.map(key => {
			const value = object[key];

			if (value === undefined) {
				return '';
			}

			if (value === null) {
				return encode(key, options);
			}

			if (Array.isArray(value)) {
				if (value.length === 0 && options.arrayFormat === 'bracket-separator') {
					return encode(key, options) + '[]';
				}

				return value
					.reduce(formatter(key), [])
					.join('&');
			}

			return encode(key, options) + '=' + encode(value, options);
		}).filter(x => x.length > 0).join('&');
	};

	exports.parseUrl = (url, options) => {
		options = Object.assign({
			decode: true
		}, options);

		const [url_, hash] = splitOnFirst$1(url, '#');

		return Object.assign(
			{
				url: url_.split('?')[0] || '',
				query: parse(extract(url), options)
			},
			options && options.parseFragmentIdentifier && hash ? {fragmentIdentifier: decode(hash, options)} : {}
		);
	};

	exports.stringifyUrl = (object, options) => {
		options = Object.assign({
			encode: true,
			strict: true,
			[encodeFragmentIdentifier]: true
		}, options);

		const url = removeHash(object.url).split('?')[0] || '';
		const queryFromUrl = exports.extract(object.url);
		const parsedQueryFromUrl = exports.parse(queryFromUrl, {sort: false});

		const query = Object.assign(parsedQueryFromUrl, object.query);
		let queryString = exports.stringify(query, options);
		if (queryString) {
			queryString = `?${queryString}`;
		}

		let hash = getHash(object.url);
		if (object.fragmentIdentifier) {
			hash = `#${options[encodeFragmentIdentifier] ? encode(object.fragmentIdentifier, options) : object.fragmentIdentifier}`;
		}

		return `${url}${queryString}${hash}`;
	};

	exports.pick = (input, filter, options) => {
		options = Object.assign({
			parseFragmentIdentifier: true,
			[encodeFragmentIdentifier]: false
		}, options);

		const {url, query, fragmentIdentifier} = exports.parseUrl(input, options);
		return exports.stringifyUrl({
			url,
			query: filterObject(query, filter),
			fragmentIdentifier
		}, options);
	};

	exports.exclude = (input, filter, options) => {
		const exclusionFilter = Array.isArray(filter) ? key => !filter.includes(key) : (key, value) => !filter(key, value);

		return exports.pick(input, exclusionFilter, options);
	}; 
} (queryString));

const RELAY_JSONRPC = {
    waku: {
        publish: "waku_publish",
        batchPublish: "waku_batchPublish",
        subscribe: "waku_subscribe",
        batchSubscribe: "waku_batchSubscribe",
        subscription: "waku_subscription",
        unsubscribe: "waku_unsubscribe",
        batchUnsubscribe: "waku_batchUnsubscribe",
    },
    irn: {
        publish: "irn_publish",
        batchPublish: "irn_batchPublish",
        subscribe: "irn_subscribe",
        batchSubscribe: "irn_batchSubscribe",
        subscription: "irn_subscription",
        unsubscribe: "irn_unsubscribe",
        batchUnsubscribe: "irn_batchUnsubscribe",
    },
    iridium: {
        publish: "iridium_publish",
        batchPublish: "iridium_batchPublish",
        subscribe: "iridium_subscribe",
        batchSubscribe: "iridium_batchSubscribe",
        subscription: "iridium_subscription",
        unsubscribe: "iridium_unsubscribe",
        batchUnsubscribe: "iridium_batchUnsubscribe",
    },
};

function M$1(e,n){return e.includes(":")?[e]:n.chains||[]}const J$2="base10",p="base16",L="base64pad",x$1="utf8",Q$2=0,_=1,$n=0,Ie=1,Z$1=12,X$2=32;function jn(){const e=x25519.generateKeyPair();return {privateKey:toString(e.secretKey,p),publicKey:toString(e.publicKey,p)}}function Dn(){const e=random.randomBytes(X$2);return toString(e,p)}function kn(e,n){const t=x25519.sharedKey(fromString(e,p),fromString(n,p)),r=new HKDF_1(sha256.SHA256,t).expand(X$2);return toString(r,p)}function Vn(e){const n=sha256.hash(fromString(e,p));return toString(n,p)}function Mn(e){const n=sha256.hash(fromString(e,x$1));return toString(n,p)}function Pe(e){return fromString(`${e}`,J$2)}function $(e){return Number(toString(e,J$2))}function Kn(e){const n=Pe(typeof e.type<"u"?e.type:Q$2);if($(n)===_&&typeof e.senderPublicKey>"u")throw new Error("Missing sender public key for type 1 envelope");const t=typeof e.senderPublicKey<"u"?fromString(e.senderPublicKey,p):void 0,r=typeof e.iv<"u"?fromString(e.iv,p):random.randomBytes(Z$1),o=new chacha20poly1305.ChaCha20Poly1305(fromString(e.symKey,p)).seal(r,fromString(e.message,x$1));return Te({type:n,sealed:o,iv:r,senderPublicKey:t})}function Ln(e){const n=new chacha20poly1305.ChaCha20Poly1305(fromString(e.symKey,p)),{sealed:t,iv:r}=ee(e.encoded),o=n.open(r,t);if(o===null)throw new Error("Failed to decrypt");return toString(o,x$1)}function Te(e){if($(e.type)===_){if(typeof e.senderPublicKey>"u")throw new Error("Missing sender public key for type 1 envelope");return toString(concat([e.type,e.senderPublicKey,e.iv,e.sealed]),L)}return toString(concat([e.type,e.iv,e.sealed]),L)}function ee(e){const n=fromString(e,L),t=n.slice($n,Ie),r=Ie;if($(t)===_){const l=r+X$2,d=l+Z$1,c=n.slice(r,l),u=n.slice(l,d),a=n.slice(d);return {type:t,sealed:a,iv:u,senderPublicKey:c}}const o=r+Z$1,s=n.slice(r,o),i=n.slice(o);return {type:t,sealed:i,iv:s}}function xn(e,n){const t=ee(e);return Re({type:$(t.type),senderPublicKey:typeof t.senderPublicKey<"u"?toString(t.senderPublicKey,p):void 0,receiverPublicKey:n?.receiverPublicKey})}function Re(e){const n=e?.type||Q$2;if(n===_){if(typeof e?.senderPublicKey>"u")throw new Error("missing sender public key");if(typeof e?.receiverPublicKey>"u")throw new Error("missing receiver public key")}return {type:n,senderPublicKey:e?.senderPublicKey,receiverPublicKey:e?.receiverPublicKey}}function Fn(e){return e.type===_&&typeof e.senderPublicKey=="string"&&typeof e.receiverPublicKey=="string"}var Hn=Object.defineProperty,Ae$1=Object.getOwnPropertySymbols,qn=Object.prototype.hasOwnProperty,Bn=Object.prototype.propertyIsEnumerable,Ue$1=(e,n,t)=>n in e?Hn(e,n,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[n]=t,_e=(e,n)=>{for(var t in n||(n={}))qn.call(n,t)&&Ue$1(e,t,n[t]);if(Ae$1)for(var t of Ae$1(n))Bn.call(n,t)&&Ue$1(e,t,n[t]);return e};const Ce="ReactNative",m={reactNative:"react-native",node:"node",browser:"browser",unknown:"unknown"},je$1="js";function te(){return typeof process<"u"&&typeof process.versions<"u"&&typeof process.versions.node<"u"}function H$1(){return !getDocument_1()&&!!getNavigator_1()&&navigator.product===Ce}function q(){return !te()&&!!getNavigator_1()}function R$1(){return H$1()?m.reactNative:te()?m.node:q()?m.browser:m.unknown}function De(e,n){let t=queryString.parse(e);return t=_e(_e({},t),n),e=queryString.stringify(t),e}function zn(){return getWindowMetadata_1()||{name:"",description:"",url:"",icons:[""]}}function ke$1(){if(R$1()===m.reactNative&&typeof global<"u"&&typeof(global==null?void 0:global.Platform)<"u"){const{OS:t,Version:r}=global.Platform;return [t,r].join("-")}const e=detect();if(e===null)return "unknown";const n=e.os?e.os.replace(" ","").toLowerCase():"unknown";return e.type==="browser"?[n,e.name,e.version].join("-"):[n,e.version].join("-")}function Ve$1(){var e;const n=R$1();return n===m.browser?[n,((e=getLocation_1())==null?void 0:e.host)||"unknown"].join(":"):n}function Me$1(e,n,t){const r=ke$1(),o=Ve$1();return [[e,n].join("-"),[je$1,t].join("-"),r,o].join("/")}function Jn({protocol:e,version:n,relayUrl:t,sdkVersion:r,auth:o,projectId:s,useOnCloseEvent:i}){const l=t.split("?"),d=Me$1(e,n,r),c={auth:o,ua:d,projectId:s,useOnCloseEvent:i||void 0},u=De(l[1]||"",c);return l[0]+"?"+u}function O(e,n){return e.filter(t=>n.includes(t)).length===e.length}function et$1(e){return Object.fromEntries(e.entries())}function nt$1(e){return new Map(Object.entries(e))}function st$1(e=cjs$4.FIVE_MINUTES,n){const t=cjs$4.toMiliseconds(e||cjs$4.FIVE_MINUTES);let r,o,s;return {resolve:i=>{s&&r&&(clearTimeout(s),r(i));},reject:i=>{s&&o&&(clearTimeout(s),o(i));},done:()=>new Promise((i,l)=>{s=setTimeout(()=>{l(new Error(n));},t),r=i,o=l;})}}function it$1(e,n,t){return new Promise(async(r,o)=>{const s=setTimeout(()=>o(new Error(t)),n);try{const i=await e;r(i);}catch(i){o(i);}clearTimeout(s);})}function re(e,n){if(typeof n=="string"&&n.startsWith(`${e}:`))return n;if(e.toLowerCase()==="topic"){if(typeof n!="string")throw new Error('Value must be "string" for expirer target type: topic');return `topic:${n}`}else if(e.toLowerCase()==="id"){if(typeof n!="number")throw new Error('Value must be "number" for expirer target type: id');return `id:${n}`}throw new Error(`Unknown expirer target type: ${e}`)}function ct$1(e){return re("topic",e)}function at$1(e){return re("id",e)}function ut$1(e){const[n,t]=e.split(":"),r={id:void 0,topic:void 0};if(n==="topic"&&typeof t=="string")r.topic=t;else if(n==="id"&&Number.isInteger(Number(t)))r.id=Number(t);else throw new Error(`Invalid target, expected id:number or topic:string, got ${n}:${t}`);return r}function lt$1(e,n){return cjs$4.fromMiliseconds((n||Date.now())+cjs$4.toMiliseconds(e))}function dt$1(e){return Date.now()>=cjs$4.toMiliseconds(e)}function ft$1(e,n){return `${e}${n?`:${n}`:""}`}async function pt$1({id:e,topic:n,wcDeepLink:t}){try{if(!t)return;const r=typeof t=="string"?JSON.parse(t):t;let o=r?.href;if(typeof o!="string")return;o.endsWith("/")&&(o=o.slice(0,-1));const s=`${o}/wc?requestId=${e}&sessionTopic=${n}`,i=R$1();i===m.browser?s.startsWith("https://")?window.open(s,"_blank","noreferrer noopener"):window.open(s,"_self","noreferrer noopener"):i===m.reactNative&&typeof(global==null?void 0:global.Linking)<"u"&&await global.Linking.openURL(s);}catch(r){console.error(r);}}const Fe$1="irn";function mt$1(e){return e?.relay||{protocol:Fe$1}}function yt$1(e){const n=RELAY_JSONRPC[e];if(typeof n>"u")throw new Error(`Relay Protocol not supported: ${e}`);return n}var ht$1=Object.defineProperty,He$1=Object.getOwnPropertySymbols,vt$1=Object.prototype.hasOwnProperty,gt$1=Object.prototype.propertyIsEnumerable,qe$1=(e,n,t)=>n in e?ht$1(e,n,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[n]=t,Et$1=(e,n)=>{for(var t in n||(n={}))vt$1.call(n,t)&&qe$1(e,t,n[t]);if(He$1)for(var t of He$1(n))gt$1.call(n,t)&&qe$1(e,t,n[t]);return e};function Be$1(e,n="-"){const t={},r="relay"+n;return Object.keys(e).forEach(o=>{if(o.startsWith(r)){const s=o.replace(r,""),i=e[o];t[s]=i;}}),t}function bt$1(e){const n=e.indexOf(":"),t=e.indexOf("?")!==-1?e.indexOf("?"):void 0,r=e.substring(0,n),o=e.substring(n+1,t).split("@"),s=typeof t<"u"?e.substring(t):"",i=queryString.parse(s);return {protocol:r,topic:Ge$1(o[0]),version:parseInt(o[1],10),symKey:i.symKey,relay:Be$1(i)}}function Ge$1(e){return e.startsWith("//")?e.substring(2):e}function We$1(e,n="-"){const t="relay",r={};return Object.keys(e).forEach(o=>{const s=t+n+o;e[o]&&(r[s]=e[o]);}),r}function Nt$1(e){return `${e.protocol}:${e.topic}@${e.version}?`+queryString.stringify(Et$1({symKey:e.symKey},We$1(e.relay)))}function A(e){const n=[];return e.forEach(t=>{const[r,o]=t.split(":");n.push(`${r}:${o}`);}),n}function Je$1(e){const n=[];return Object.values(e).forEach(t=>{n.push(...A(t.accounts));}),n}function Qe$1(e,n){const t=[];return Object.values(e).forEach(r=>{A(r.accounts).includes(n)&&t.push(...r.methods);}),t}function Ze$1(e,n){const t=[];return Object.values(e).forEach(r=>{A(r.accounts).includes(n)&&t.push(...r.events);}),t}function At$1(e,n){const t=cn(e,n);if(t)throw new Error(t.message);const r={};for(const[o,s]of Object.entries(e))r[o]={methods:s.methods,events:s.events,chains:s.accounts.map(i=>`${i.split(":")[0]}:${i.split(":")[1]}`)};return r}const _t$1={INVALID_METHOD:{message:"Invalid method.",code:1001},INVALID_EVENT:{message:"Invalid event.",code:1002},INVALID_UPDATE_REQUEST:{message:"Invalid update request.",code:1003},INVALID_EXTEND_REQUEST:{message:"Invalid extend request.",code:1004},INVALID_SESSION_SETTLE_REQUEST:{message:"Invalid session settle request.",code:1005},UNAUTHORIZED_METHOD:{message:"Unauthorized method.",code:3001},UNAUTHORIZED_EVENT:{message:"Unauthorized event.",code:3002},UNAUTHORIZED_UPDATE_REQUEST:{message:"Unauthorized update request.",code:3003},UNAUTHORIZED_EXTEND_REQUEST:{message:"Unauthorized extend request.",code:3004},USER_REJECTED:{message:"User rejected.",code:5e3},USER_REJECTED_CHAINS:{message:"User rejected chains.",code:5001},USER_REJECTED_METHODS:{message:"User rejected methods.",code:5002},USER_REJECTED_EVENTS:{message:"User rejected events.",code:5003},UNSUPPORTED_CHAINS:{message:"Unsupported chains.",code:5100},UNSUPPORTED_METHODS:{message:"Unsupported methods.",code:5101},UNSUPPORTED_EVENTS:{message:"Unsupported events.",code:5102},UNSUPPORTED_ACCOUNTS:{message:"Unsupported accounts.",code:5103},UNSUPPORTED_NAMESPACE_KEY:{message:"Unsupported namespace key.",code:5104},USER_DISCONNECTED:{message:"User disconnected.",code:6e3},SESSION_SETTLEMENT_FAILED:{message:"Session settlement failed.",code:7e3},WC_METHOD_UNSUPPORTED:{message:"Unsupported wc_ method.",code:10001}},Ct$1={NOT_INITIALIZED:{message:"Not initialized.",code:1},NO_MATCHING_KEY:{message:"No matching key.",code:2},RESTORE_WILL_OVERRIDE:{message:"Restore will override.",code:3},RESUBSCRIBED:{message:"Resubscribed.",code:4},MISSING_OR_INVALID:{message:"Missing or invalid.",code:5},EXPIRED:{message:"Expired.",code:6},UNKNOWN_TYPE:{message:"Unknown type.",code:7},MISMATCHED_TOPIC:{message:"Mismatched topic.",code:8},NON_CONFORMING_NAMESPACES:{message:"Non conforming namespaces.",code:9}};function N(e,n){const{message:t,code:r}=Ct$1[e];return {message:n?`${t} ${n}`:t,code:r}}function U$1(e,n){const{message:t,code:r}=_t$1[e];return {message:n?`${t} ${n}`:t,code:r}}function j(e,n){return Array.isArray(e)?typeof n<"u"&&e.length?e.every(n):!0:!1}function B$1(e){return Object.getPrototypeOf(e)===Object.prototype&&Object.keys(e).length}function w$1(e){return typeof e>"u"}function h(e,n){return n&&w$1(e)?!0:typeof e=="string"&&!!e.trim().length}function G$1(e,n){return n&&w$1(e)?!0:typeof e=="number"&&!isNaN(e)}function $t$1(e,n){const{requiredNamespaces:t}=n,r=Object.keys(e.namespaces),o=Object.keys(t);let s=!0;return O(o,r)?(r.forEach(i=>{const{accounts:l,methods:d,events:c}=e.namespaces[i],u=A(l),a=t[i];(!O(M$1(i,a),u)||!O(a.methods,d)||!O(a.events,c))&&(s=!1);}),s):!1}function D$1(e){return h(e,!1)&&e.includes(":")?e.split(":").length===2:!1}function en(e){if(h(e,!1)&&e.includes(":")){const n=e.split(":");if(n.length===3){const t=n[0]+":"+n[1];return !!n[2]&&D$1(t)}}return !1}function jt(e){if(h(e,!1))try{return typeof new URL(e)<"u"}catch{return !1}return !1}function Dt$1(e){var n;return (n=e?.proposer)==null?void 0:n.publicKey}function kt$1(e){return e?.topic}function Vt$1(e,n){let t=null;return h(e?.publicKey,!1)||(t=N("MISSING_OR_INVALID",`${n} controller public key should be a string`)),t}function ie(e){let n=!0;return j(e)?e.length&&(n=e.every(t=>h(t,!1))):n=!1,n}function nn(e,n,t){let r=null;return j(n)&&n.length?n.forEach(o=>{r||D$1(o)||(r=U$1("UNSUPPORTED_CHAINS",`${t}, chain ${o} should be a string and conform to "namespace:chainId" format`));}):D$1(e)||(r=U$1("UNSUPPORTED_CHAINS",`${t}, chains must be defined as "namespace:chainId" e.g. "eip155:1": {...} in the namespace key OR as an array of CAIP-2 chainIds e.g. eip155: { chains: ["eip155:1", "eip155:5"] }`)),r}function tn(e,n,t){let r=null;return Object.entries(e).forEach(([o,s])=>{if(r)return;const i=nn(o,M$1(o,s),`${n} ${t}`);i&&(r=i);}),r}function rn(e,n){let t=null;return j(e)?e.forEach(r=>{t||en(r)||(t=U$1("UNSUPPORTED_ACCOUNTS",`${n}, account ${r} should be a string and conform to "namespace:chainId:address" format`));}):t=U$1("UNSUPPORTED_ACCOUNTS",`${n}, accounts should be an array of strings conforming to "namespace:chainId:address" format`),t}function on(e,n){let t=null;return Object.values(e).forEach(r=>{if(t)return;const o=rn(r?.accounts,`${n} namespace`);o&&(t=o);}),t}function sn(e,n){let t=null;return ie(e?.methods)?ie(e?.events)||(t=U$1("UNSUPPORTED_EVENTS",`${n}, events should be an array of strings or empty array for no events`)):t=U$1("UNSUPPORTED_METHODS",`${n}, methods should be an array of strings or empty array for no methods`),t}function ce$2(e,n){let t=null;return Object.values(e).forEach(r=>{if(t)return;const o=sn(r,`${n}, namespace`);o&&(t=o);}),t}function Mt$1(e,n,t){let r=null;if(e&&B$1(e)){const o=ce$2(e,n);o&&(r=o);const s=tn(e,n,t);s&&(r=s);}else r=N("MISSING_OR_INVALID",`${n}, ${t} should be an object with data`);return r}function cn(e,n){let t=null;if(e&&B$1(e)){const r=ce$2(e,n);r&&(t=r);const o=on(e,n);o&&(t=o);}else t=N("MISSING_OR_INVALID",`${n}, namespaces should be an object with data`);return t}function an(e){return h(e.protocol,!0)}function Kt$1(e,n){let t=!1;return n&&!e?t=!0:e&&j(e)&&e.length&&e.forEach(r=>{t=an(r);}),t}function Lt$1(e){return typeof e=="number"}function xt$1(e){return typeof e<"u"&&typeof e!==null}function Ft$1(e){return !(!e||typeof e!="object"||!e.code||!G$1(e.code,!1)||!e.message||!h(e.message,!1))}function Ht(e){return !(w$1(e)||!h(e.method,!1))}function qt(e){return !(w$1(e)||w$1(e.result)&&w$1(e.error)||!G$1(e.id,!1)||!h(e.jsonrpc,!1))}function Bt$1(e){return !(w$1(e)||!h(e.name,!1))}function Gt(e,n){return !(!D$1(n)||!Je$1(e).includes(n))}function Wt(e,n,t){return h(t,!1)?Qe$1(e,n).includes(t):!1}function zt$1(e,n,t){return h(t,!1)?Ze$1(e,n).includes(t):!1}function un(e,n,t){let r=null;const o=Yt(e),s=Jt(n),i=Object.keys(o),l=Object.keys(s),d=ln(Object.keys(e)),c=ln(Object.keys(n)),u=d.filter(a=>!c.includes(a));return u.length&&(r=N("NON_CONFORMING_NAMESPACES",`${t} namespaces keys don't satisfy requiredNamespaces.
      Required: ${u.toString()}
      Received: ${Object.keys(n).toString()}`)),O(i,l)||(r=N("NON_CONFORMING_NAMESPACES",`${t} namespaces chains don't satisfy required namespaces.
      Required: ${i.toString()}
      Approved: ${l.toString()}`)),Object.keys(n).forEach(a=>{if(!a.includes(":")||r)return;const b=A(n[a].accounts);b.includes(a)||(r=N("NON_CONFORMING_NAMESPACES",`${t} namespaces accounts don't satisfy namespace accounts for ${a}
        Required: ${a}
        Approved: ${b.toString()}`));}),i.forEach(a=>{r||(O(o[a].methods,s[a].methods)?O(o[a].events,s[a].events)||(r=N("NON_CONFORMING_NAMESPACES",`${t} namespaces events don't satisfy namespace events for ${a}`)):r=N("NON_CONFORMING_NAMESPACES",`${t} namespaces methods don't satisfy namespace methods for ${a}`));}),r}function Yt(e){const n={};return Object.keys(e).forEach(t=>{var r;t.includes(":")?n[t]=e[t]:(r=e[t].chains)==null||r.forEach(o=>{n[o]={methods:e[t].methods,events:e[t].events};});}),n}function ln(e){return [...new Set(e.map(n=>n.includes(":")?n.split(":")[0]:n))]}function Jt(e){const n={};return Object.keys(e).forEach(t=>{if(t.includes(":"))n[t]=e[t];else {const r=A(e[t].accounts);r?.forEach(o=>{n[o]={accounts:e[t].accounts.filter(s=>s.includes(`${o}:`)),methods:e[t].methods,events:e[t].events};});}}),n}function Qt(e,n){return G$1(e,!1)&&e<=n.max&&e>=n.min}function Zt(){const e=R$1();return new Promise(n=>{switch(e){case m.browser:n(dn());break;case m.reactNative:n(fn());break;case m.node:n(pn());break;default:n(!0);}})}function dn(){return q()&&navigator?.onLine}async function fn(){if(H$1()&&typeof global<"u"&&global!=null&&global.NetInfo){const e=await(global==null?void 0:global.NetInfo.fetch());return e?.isConnected}return !0}function pn(){return !0}function Xt(e){switch(R$1()){case m.browser:mn(e);break;case m.reactNative:yn(e);break;}}function mn(e){q()&&(window.addEventListener("online",()=>e(!0)),window.addEventListener("offline",()=>e(!1)));}function yn(e){H$1()&&typeof global<"u"&&global!=null&&global.NetInfo&&global?.NetInfo.addEventListener(n=>e(n?.isConnected));}const ae$2={};let er$1 = class er{static get(n){return ae$2[n]}static set(n,t){ae$2[n]=t;}static delete(n){delete ae$2[n];}};

const PARSE_ERROR = "PARSE_ERROR";
const INVALID_REQUEST = "INVALID_REQUEST";
const METHOD_NOT_FOUND = "METHOD_NOT_FOUND";
const INVALID_PARAMS = "INVALID_PARAMS";
const INTERNAL_ERROR = "INTERNAL_ERROR";
const SERVER_ERROR = "SERVER_ERROR";
const RESERVED_ERROR_CODES = [-32700, -32600, -32601, -32602, -32603];
const STANDARD_ERROR_MAP = {
    [PARSE_ERROR]: { code: -32700, message: "Parse error" },
    [INVALID_REQUEST]: { code: -32600, message: "Invalid Request" },
    [METHOD_NOT_FOUND]: { code: -32601, message: "Method not found" },
    [INVALID_PARAMS]: { code: -32602, message: "Invalid params" },
    [INTERNAL_ERROR]: { code: -32603, message: "Internal error" },
    [SERVER_ERROR]: { code: -32000, message: "Server error" },
};
const DEFAULT_ERROR = SERVER_ERROR;

function isReservedErrorCode(code) {
    return RESERVED_ERROR_CODES.includes(code);
}
function getError(type) {
    if (!Object.keys(STANDARD_ERROR_MAP).includes(type)) {
        return STANDARD_ERROR_MAP[DEFAULT_ERROR];
    }
    return STANDARD_ERROR_MAP[type];
}
function getErrorByCode(code) {
    const match = Object.values(STANDARD_ERROR_MAP).find(e => e.code === code);
    if (!match) {
        return STANDARD_ERROR_MAP[DEFAULT_ERROR];
    }
    return match;
}
function parseConnectionError(e, url, type) {
    return e.message.includes("getaddrinfo ENOTFOUND") || e.message.includes("connect ECONNREFUSED")
        ? new Error(`Unavailable ${type} RPC url at ${url}`)
        : e;
}

var cjs = {};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read(arguments[i]));
    return ar;
}

function __spreadArrays() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get __assign () { return __assign; },
  __asyncDelegator: __asyncDelegator,
  __asyncGenerator: __asyncGenerator,
  __asyncValues: __asyncValues,
  __await: __await,
  __awaiter: __awaiter,
  __classPrivateFieldGet: __classPrivateFieldGet,
  __classPrivateFieldSet: __classPrivateFieldSet,
  __createBinding: __createBinding,
  __decorate: __decorate,
  __exportStar: __exportStar,
  __extends: __extends,
  __generator: __generator,
  __importDefault: __importDefault,
  __importStar: __importStar,
  __makeTemplateObject: __makeTemplateObject,
  __metadata: __metadata,
  __param: __param,
  __read: __read,
  __rest: __rest,
  __spread: __spread,
  __spreadArrays: __spreadArrays,
  __values: __values
});

var require$$0 = /*@__PURE__*/getAugmentedNamespace(tslib_es6);

var crypto$1 = {};

var hasRequiredCrypto;

function requireCrypto () {
	if (hasRequiredCrypto) return crypto$1;
	hasRequiredCrypto = 1;
	Object.defineProperty(crypto$1, "__esModule", { value: true });
	crypto$1.isBrowserCryptoAvailable = crypto$1.getSubtleCrypto = crypto$1.getBrowerCrypto = void 0;
	function getBrowerCrypto() {
	    return (commonjsGlobal === null || commonjsGlobal === void 0 ? void 0 : commonjsGlobal.crypto) || (commonjsGlobal === null || commonjsGlobal === void 0 ? void 0 : commonjsGlobal.msCrypto) || {};
	}
	crypto$1.getBrowerCrypto = getBrowerCrypto;
	function getSubtleCrypto() {
	    const browserCrypto = getBrowerCrypto();
	    return browserCrypto.subtle || browserCrypto.webkitSubtle;
	}
	crypto$1.getSubtleCrypto = getSubtleCrypto;
	function isBrowserCryptoAvailable() {
	    return !!getBrowerCrypto() && !!getSubtleCrypto();
	}
	crypto$1.isBrowserCryptoAvailable = isBrowserCryptoAvailable;
	
	return crypto$1;
}

var env = {};

var hasRequiredEnv;

function requireEnv () {
	if (hasRequiredEnv) return env;
	hasRequiredEnv = 1;
	Object.defineProperty(env, "__esModule", { value: true });
	env.isBrowser = env.isNode = env.isReactNative = void 0;
	function isReactNative() {
	    return (typeof document === "undefined" &&
	        typeof navigator !== "undefined" &&
	        navigator.product === "ReactNative");
	}
	env.isReactNative = isReactNative;
	function isNode() {
	    return (typeof process !== "undefined" &&
	        typeof process.versions !== "undefined" &&
	        typeof process.versions.node !== "undefined");
	}
	env.isNode = isNode;
	function isBrowser() {
	    return !isReactNative() && !isNode();
	}
	env.isBrowser = isBrowser;
	
	return env;
}

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = require$$0;
	tslib_1.__exportStar(requireCrypto(), exports);
	tslib_1.__exportStar(requireEnv(), exports);
	
} (cjs));

function payloadId(entropy = 3) {
    const date = Date.now() * Math.pow(10, entropy);
    const extra = Math.floor(Math.random() * Math.pow(10, entropy));
    return date + extra;
}
function getBigIntRpcId(entropy = 6) {
    return BigInt(payloadId(entropy));
}
function formatJsonRpcRequest(method, params, id) {
    return {
        id: id || payloadId(),
        jsonrpc: "2.0",
        method,
        params,
    };
}
function formatJsonRpcResult(id, result) {
    return {
        id,
        jsonrpc: "2.0",
        result,
    };
}
function formatJsonRpcError(id, error, data) {
    return {
        id,
        jsonrpc: "2.0",
        error: formatErrorMessage(error, data),
    };
}
function formatErrorMessage(error, data) {
    if (typeof error === "undefined") {
        return getError(INTERNAL_ERROR);
    }
    if (typeof error === "string") {
        error = Object.assign(Object.assign({}, getError(SERVER_ERROR)), { message: error });
    }
    if (typeof data !== "undefined") {
        error.data = data;
    }
    if (isReservedErrorCode(error.code)) {
        error = getErrorByCode(error.code);
    }
    return error;
}

class IEvents {
}

class IBaseJsonRpcProvider extends IEvents {
    constructor() {
        super();
    }
}
class IJsonRpcProvider extends IBaseJsonRpcProvider {
    constructor(connection) {
        super();
    }
}

const WS_REGEX = "^wss?:";
function getUrlProtocol(url) {
    const matches = url.match(new RegExp(/^\w+:/, "gi"));
    if (!matches || !matches.length)
        return;
    return matches[0];
}
function matchRegexProtocol(url, regex) {
    const protocol = getUrlProtocol(url);
    if (typeof protocol === "undefined")
        return false;
    return new RegExp(regex).test(protocol);
}
function isWsUrl(url) {
    return matchRegexProtocol(url, WS_REGEX);
}
function isLocalhostUrl(url) {
    return new RegExp("wss?://localhost(:d{2,5})?").test(url);
}

function isJsonRpcPayload(payload) {
    return (typeof payload === "object" &&
        "id" in payload &&
        "jsonrpc" in payload &&
        payload.jsonrpc === "2.0");
}
function isJsonRpcRequest(payload) {
    return isJsonRpcPayload(payload) && "method" in payload;
}
function isJsonRpcResponse(payload) {
    return isJsonRpcPayload(payload) && (isJsonRpcResult(payload) || isJsonRpcError(payload));
}
function isJsonRpcResult(payload) {
    return "result" in payload;
}
function isJsonRpcError(payload) {
    return "error" in payload;
}

class JsonRpcProvider extends IJsonRpcProvider {
    constructor(connection) {
        super(connection);
        this.events = new EventEmitter();
        this.hasRegisteredEventListeners = false;
        this.connection = this.setConnection(connection);
        if (this.connection.connected) {
            this.registerEventListeners();
        }
    }
    async connect(connection = this.connection) {
        await this.open(connection);
    }
    async disconnect() {
        await this.close();
    }
    on(event, listener) {
        this.events.on(event, listener);
    }
    once(event, listener) {
        this.events.once(event, listener);
    }
    off(event, listener) {
        this.events.off(event, listener);
    }
    removeListener(event, listener) {
        this.events.removeListener(event, listener);
    }
    async request(request, context) {
        return this.requestStrict(formatJsonRpcRequest(request.method, request.params || [], request.id || getBigIntRpcId().toString()), context);
    }
    async requestStrict(request, context) {
        return new Promise(async (resolve, reject) => {
            if (!this.connection.connected) {
                try {
                    await this.open();
                }
                catch (e) {
                    reject(e);
                }
            }
            this.events.on(`${request.id}`, response => {
                if (isJsonRpcError(response)) {
                    reject(response.error);
                }
                else {
                    resolve(response.result);
                }
            });
            try {
                await this.connection.send(request, context);
            }
            catch (e) {
                reject(e);
            }
        });
    }
    setConnection(connection = this.connection) {
        return connection;
    }
    onPayload(payload) {
        this.events.emit("payload", payload);
        if (isJsonRpcResponse(payload)) {
            this.events.emit(`${payload.id}`, payload);
        }
        else {
            this.events.emit("message", {
                type: payload.method,
                data: payload.params,
            });
        }
    }
    onClose(event) {
        if (event && event.code === 3000) {
            this.events.emit("error", new Error(`WebSocket connection closed abnormally with code: ${event.code} ${event.reason ? `(${event.reason})` : ""}`));
        }
        this.events.emit("disconnect");
    }
    async open(connection = this.connection) {
        if (this.connection === connection && this.connection.connected)
            return;
        if (this.connection.connected)
            this.close();
        if (typeof connection === "string") {
            await this.connection.open(connection);
            connection = this.connection;
        }
        this.connection = this.setConnection(connection);
        await this.connection.open();
        this.registerEventListeners();
        this.events.emit("connect");
    }
    async close() {
        await this.connection.close();
    }
    registerEventListeners() {
        if (this.hasRegisteredEventListeners)
            return;
        this.connection.on("payload", (payload) => this.onPayload(payload));
        this.connection.on("close", (event) => this.onClose(event));
        this.connection.on("error", (error) => this.events.emit("error", error));
        this.connection.on("register_error", (error) => this.onClose());
        this.hasRegisteredEventListeners = true;
    }
}

const resolveWebSocketImplementation = () => {
    if (typeof WebSocket !== "undefined") {
        return WebSocket;
    }
    else if (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") {
        return global.WebSocket;
    }
    else if (typeof window !== "undefined" && typeof window.WebSocket !== "undefined") {
        return window.WebSocket;
    }
    else if (typeof self !== "undefined" && typeof self.WebSocket !== "undefined") {
        return self.WebSocket;
    }
    return require("ws");
};
const hasBuiltInWebSocket = () => typeof WebSocket !== "undefined" ||
    (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") ||
    (typeof window !== "undefined" && typeof window.WebSocket !== "undefined") ||
    (typeof self !== "undefined" && typeof self.WebSocket !== "undefined");
const truncateQuery = (wssUrl) => wssUrl.split("?")[0];

const EVENT_EMITTER_MAX_LISTENERS_DEFAULT = 10;
const WS = resolveWebSocketImplementation();
class WsConnection {
    constructor(url) {
        this.url = url;
        this.events = new EventEmitter();
        this.registering = false;
        if (!isWsUrl(url)) {
            throw new Error(`Provided URL is not compatible with WebSocket connection: ${url}`);
        }
        this.url = url;
    }
    get connected() {
        return typeof this.socket !== "undefined";
    }
    get connecting() {
        return this.registering;
    }
    on(event, listener) {
        this.events.on(event, listener);
    }
    once(event, listener) {
        this.events.once(event, listener);
    }
    off(event, listener) {
        this.events.off(event, listener);
    }
    removeListener(event, listener) {
        this.events.removeListener(event, listener);
    }
    async open(url = this.url) {
        await this.register(url);
    }
    async close() {
        return new Promise((resolve, reject) => {
            if (typeof this.socket === "undefined") {
                reject(new Error("Connection already closed"));
                return;
            }
            this.socket.onclose = event => {
                this.onClose(event);
                resolve();
            };
            this.socket.close();
        });
    }
    async send(payload, context) {
        if (typeof this.socket === "undefined") {
            this.socket = await this.register();
        }
        try {
            this.socket.send(safeJsonStringify(payload));
        }
        catch (e) {
            this.onError(payload.id, e);
        }
    }
    register(url = this.url) {
        if (!isWsUrl(url)) {
            throw new Error(`Provided URL is not compatible with WebSocket connection: ${url}`);
        }
        if (this.registering) {
            const currentMaxListeners = this.events.getMaxListeners();
            if (this.events.listenerCount("register_error") >= currentMaxListeners ||
                this.events.listenerCount("open") >= currentMaxListeners) {
                this.events.setMaxListeners(currentMaxListeners + 1);
            }
            return new Promise((resolve, reject) => {
                this.events.once("register_error", error => {
                    this.resetMaxListeners();
                    reject(error);
                });
                this.events.once("open", () => {
                    this.resetMaxListeners();
                    if (typeof this.socket === "undefined") {
                        return reject(new Error("WebSocket connection is missing or invalid"));
                    }
                    resolve(this.socket);
                });
            });
        }
        this.url = url;
        this.registering = true;
        return new Promise((resolve, reject) => {
            const opts = !cjs.isReactNative() ? { rejectUnauthorized: !isLocalhostUrl(url) } : undefined;
            const socket = new WS(url, [], opts);
            if (hasBuiltInWebSocket()) {
                socket.onerror = (event) => {
                    const errorEvent = event;
                    reject(this.emitError(errorEvent.error));
                };
            }
            else {
                socket.on("error", (errorEvent) => {
                    reject(this.emitError(errorEvent));
                });
            }
            socket.onopen = () => {
                this.onOpen(socket);
                resolve(socket);
            };
        });
    }
    onOpen(socket) {
        socket.onmessage = (event) => this.onPayload(event);
        socket.onclose = event => this.onClose(event);
        this.socket = socket;
        this.registering = false;
        this.events.emit("open");
    }
    onClose(event) {
        this.socket = undefined;
        this.registering = false;
        this.events.emit("close", event);
    }
    onPayload(e) {
        if (typeof e.data === "undefined")
            return;
        const payload = typeof e.data === "string" ? safeJsonParse(e.data) : e.data;
        this.events.emit("payload", payload);
    }
    onError(id, e) {
        const error = this.parseError(e);
        const message = error.message || error.toString();
        const payload = formatJsonRpcError(id, message);
        this.events.emit("payload", payload);
    }
    parseError(e, url = this.url) {
        return parseConnectionError(e, truncateQuery(url), "WS");
    }
    resetMaxListeners() {
        if (this.events.getMaxListeners() > EVENT_EMITTER_MAX_LISTENERS_DEFAULT) {
            this.events.setMaxListeners(EVENT_EMITTER_MAX_LISTENERS_DEFAULT);
        }
    }
    emitError(errorEvent) {
        const error = this.parseError(new Error((errorEvent === null || errorEvent === void 0 ? void 0 : errorEvent.message) || `WebSocket connection failed for host: ${truncateQuery(this.url)}`));
        this.events.emit("register_error", error);
        return error;
    }
}

var lodash_isequal = {exports: {}};

/**
 * Lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright JS Foundation and other contributors <https://js.foundation/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */
lodash_isequal.exports;

(function (module, exports) {
	/** Used as the size to enable large array optimizations. */
	var LARGE_ARRAY_SIZE = 200;

	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED = '__lodash_hash_undefined__';

	/** Used to compose bitmasks for value comparisons. */
	var COMPARE_PARTIAL_FLAG = 1,
	    COMPARE_UNORDERED_FLAG = 2;

	/** Used as references for various `Number` constants. */
	var MAX_SAFE_INTEGER = 9007199254740991;

	/** `Object#toString` result references. */
	var argsTag = '[object Arguments]',
	    arrayTag = '[object Array]',
	    asyncTag = '[object AsyncFunction]',
	    boolTag = '[object Boolean]',
	    dateTag = '[object Date]',
	    errorTag = '[object Error]',
	    funcTag = '[object Function]',
	    genTag = '[object GeneratorFunction]',
	    mapTag = '[object Map]',
	    numberTag = '[object Number]',
	    nullTag = '[object Null]',
	    objectTag = '[object Object]',
	    promiseTag = '[object Promise]',
	    proxyTag = '[object Proxy]',
	    regexpTag = '[object RegExp]',
	    setTag = '[object Set]',
	    stringTag = '[object String]',
	    symbolTag = '[object Symbol]',
	    undefinedTag = '[object Undefined]',
	    weakMapTag = '[object WeakMap]';

	var arrayBufferTag = '[object ArrayBuffer]',
	    dataViewTag = '[object DataView]',
	    float32Tag = '[object Float32Array]',
	    float64Tag = '[object Float64Array]',
	    int8Tag = '[object Int8Array]',
	    int16Tag = '[object Int16Array]',
	    int32Tag = '[object Int32Array]',
	    uint8Tag = '[object Uint8Array]',
	    uint8ClampedTag = '[object Uint8ClampedArray]',
	    uint16Tag = '[object Uint16Array]',
	    uint32Tag = '[object Uint32Array]';

	/**
	 * Used to match `RegExp`
	 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
	 */
	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

	/** Used to detect host constructors (Safari). */
	var reIsHostCtor = /^\[object .+?Constructor\]$/;

	/** Used to detect unsigned integer values. */
	var reIsUint = /^(?:0|[1-9]\d*)$/;

	/** Used to identify `toStringTag` values of typed arrays. */
	var typedArrayTags = {};
	typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
	typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
	typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
	typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
	typedArrayTags[uint32Tag] = true;
	typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
	typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
	typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
	typedArrayTags[errorTag] = typedArrayTags[funcTag] =
	typedArrayTags[mapTag] = typedArrayTags[numberTag] =
	typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
	typedArrayTags[setTag] = typedArrayTags[stringTag] =
	typedArrayTags[weakMapTag] = false;

	/** Detect free variable `global` from Node.js. */
	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

	/** Detect free variable `self`. */
	var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

	/** Used as a reference to the global object. */
	var root = freeGlobal || freeSelf || Function('return this')();

	/** Detect free variable `exports`. */
	var freeExports = exports && !exports.nodeType && exports;

	/** Detect free variable `module`. */
	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;

	/** Detect free variable `process` from Node.js. */
	var freeProcess = moduleExports && freeGlobal.process;

	/** Used to access faster Node.js helpers. */
	var nodeUtil = (function() {
	  try {
	    return freeProcess && freeProcess.binding && freeProcess.binding('util');
	  } catch (e) {}
	}());

	/* Node.js helper references. */
	var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

	/**
	 * A specialized version of `_.filter` for arrays without support for
	 * iteratee shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} predicate The function invoked per iteration.
	 * @returns {Array} Returns the new filtered array.
	 */
	function arrayFilter(array, predicate) {
	  var index = -1,
	      length = array == null ? 0 : array.length,
	      resIndex = 0,
	      result = [];

	  while (++index < length) {
	    var value = array[index];
	    if (predicate(value, index, array)) {
	      result[resIndex++] = value;
	    }
	  }
	  return result;
	}

	/**
	 * Appends the elements of `values` to `array`.
	 *
	 * @private
	 * @param {Array} array The array to modify.
	 * @param {Array} values The values to append.
	 * @returns {Array} Returns `array`.
	 */
	function arrayPush(array, values) {
	  var index = -1,
	      length = values.length,
	      offset = array.length;

	  while (++index < length) {
	    array[offset + index] = values[index];
	  }
	  return array;
	}

	/**
	 * A specialized version of `_.some` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} predicate The function invoked per iteration.
	 * @returns {boolean} Returns `true` if any element passes the predicate check,
	 *  else `false`.
	 */
	function arraySome(array, predicate) {
	  var index = -1,
	      length = array == null ? 0 : array.length;

	  while (++index < length) {
	    if (predicate(array[index], index, array)) {
	      return true;
	    }
	  }
	  return false;
	}

	/**
	 * The base implementation of `_.times` without support for iteratee shorthands
	 * or max array length checks.
	 *
	 * @private
	 * @param {number} n The number of times to invoke `iteratee`.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the array of results.
	 */
	function baseTimes(n, iteratee) {
	  var index = -1,
	      result = Array(n);

	  while (++index < n) {
	    result[index] = iteratee(index);
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.unary` without support for storing metadata.
	 *
	 * @private
	 * @param {Function} func The function to cap arguments for.
	 * @returns {Function} Returns the new capped function.
	 */
	function baseUnary(func) {
	  return function(value) {
	    return func(value);
	  };
	}

	/**
	 * Checks if a `cache` value for `key` exists.
	 *
	 * @private
	 * @param {Object} cache The cache to query.
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function cacheHas(cache, key) {
	  return cache.has(key);
	}

	/**
	 * Gets the value at `key` of `object`.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {string} key The key of the property to get.
	 * @returns {*} Returns the property value.
	 */
	function getValue(object, key) {
	  return object == null ? undefined : object[key];
	}

	/**
	 * Converts `map` to its key-value pairs.
	 *
	 * @private
	 * @param {Object} map The map to convert.
	 * @returns {Array} Returns the key-value pairs.
	 */
	function mapToArray(map) {
	  var index = -1,
	      result = Array(map.size);

	  map.forEach(function(value, key) {
	    result[++index] = [key, value];
	  });
	  return result;
	}

	/**
	 * Creates a unary function that invokes `func` with its argument transformed.
	 *
	 * @private
	 * @param {Function} func The function to wrap.
	 * @param {Function} transform The argument transform.
	 * @returns {Function} Returns the new function.
	 */
	function overArg(func, transform) {
	  return function(arg) {
	    return func(transform(arg));
	  };
	}

	/**
	 * Converts `set` to an array of its values.
	 *
	 * @private
	 * @param {Object} set The set to convert.
	 * @returns {Array} Returns the values.
	 */
	function setToArray(set) {
	  var index = -1,
	      result = Array(set.size);

	  set.forEach(function(value) {
	    result[++index] = value;
	  });
	  return result;
	}

	/** Used for built-in method references. */
	var arrayProto = Array.prototype,
	    funcProto = Function.prototype,
	    objectProto = Object.prototype;

	/** Used to detect overreaching core-js shims. */
	var coreJsData = root['__core-js_shared__'];

	/** Used to resolve the decompiled source of functions. */
	var funcToString = funcProto.toString;

	/** Used to check objects for own properties. */
	var hasOwnProperty = objectProto.hasOwnProperty;

	/** Used to detect methods masquerading as native. */
	var maskSrcKey = (function() {
	  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
	  return uid ? ('Symbol(src)_1.' + uid) : '';
	}());

	/**
	 * Used to resolve the
	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	 * of values.
	 */
	var nativeObjectToString = objectProto.toString;

	/** Used to detect if a method is native. */
	var reIsNative = RegExp('^' +
	  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
	  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
	);

	/** Built-in value references. */
	var Buffer = moduleExports ? root.Buffer : undefined,
	    Symbol = root.Symbol,
	    Uint8Array = root.Uint8Array,
	    propertyIsEnumerable = objectProto.propertyIsEnumerable,
	    splice = arrayProto.splice,
	    symToStringTag = Symbol ? Symbol.toStringTag : undefined;

	/* Built-in method references for those with the same name as other `lodash` methods. */
	var nativeGetSymbols = Object.getOwnPropertySymbols,
	    nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
	    nativeKeys = overArg(Object.keys, Object);

	/* Built-in method references that are verified to be native. */
	var DataView = getNative(root, 'DataView'),
	    Map = getNative(root, 'Map'),
	    Promise = getNative(root, 'Promise'),
	    Set = getNative(root, 'Set'),
	    WeakMap = getNative(root, 'WeakMap'),
	    nativeCreate = getNative(Object, 'create');

	/** Used to detect maps, sets, and weakmaps. */
	var dataViewCtorString = toSource(DataView),
	    mapCtorString = toSource(Map),
	    promiseCtorString = toSource(Promise),
	    setCtorString = toSource(Set),
	    weakMapCtorString = toSource(WeakMap);

	/** Used to convert symbols to primitives and strings. */
	var symbolProto = Symbol ? Symbol.prototype : undefined,
	    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

	/**
	 * Creates a hash object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Hash(entries) {
	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the hash.
	 *
	 * @private
	 * @name clear
	 * @memberOf Hash
	 */
	function hashClear() {
	  this.__data__ = nativeCreate ? nativeCreate(null) : {};
	  this.size = 0;
	}

	/**
	 * Removes `key` and its value from the hash.
	 *
	 * @private
	 * @name delete
	 * @memberOf Hash
	 * @param {Object} hash The hash to modify.
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function hashDelete(key) {
	  var result = this.has(key) && delete this.__data__[key];
	  this.size -= result ? 1 : 0;
	  return result;
	}

	/**
	 * Gets the hash value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Hash
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function hashGet(key) {
	  var data = this.__data__;
	  if (nativeCreate) {
	    var result = data[key];
	    return result === HASH_UNDEFINED ? undefined : result;
	  }
	  return hasOwnProperty.call(data, key) ? data[key] : undefined;
	}

	/**
	 * Checks if a hash value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Hash
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function hashHas(key) {
	  var data = this.__data__;
	  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
	}

	/**
	 * Sets the hash `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Hash
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the hash instance.
	 */
	function hashSet(key, value) {
	  var data = this.__data__;
	  this.size += this.has(key) ? 0 : 1;
	  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
	  return this;
	}

	// Add methods to `Hash`.
	Hash.prototype.clear = hashClear;
	Hash.prototype['delete'] = hashDelete;
	Hash.prototype.get = hashGet;
	Hash.prototype.has = hashHas;
	Hash.prototype.set = hashSet;

	/**
	 * Creates an list cache object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function ListCache(entries) {
	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the list cache.
	 *
	 * @private
	 * @name clear
	 * @memberOf ListCache
	 */
	function listCacheClear() {
	  this.__data__ = [];
	  this.size = 0;
	}

	/**
	 * Removes `key` and its value from the list cache.
	 *
	 * @private
	 * @name delete
	 * @memberOf ListCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function listCacheDelete(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    return false;
	  }
	  var lastIndex = data.length - 1;
	  if (index == lastIndex) {
	    data.pop();
	  } else {
	    splice.call(data, index, 1);
	  }
	  --this.size;
	  return true;
	}

	/**
	 * Gets the list cache value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf ListCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function listCacheGet(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  return index < 0 ? undefined : data[index][1];
	}

	/**
	 * Checks if a list cache value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf ListCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function listCacheHas(key) {
	  return assocIndexOf(this.__data__, key) > -1;
	}

	/**
	 * Sets the list cache `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf ListCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the list cache instance.
	 */
	function listCacheSet(key, value) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    ++this.size;
	    data.push([key, value]);
	  } else {
	    data[index][1] = value;
	  }
	  return this;
	}

	// Add methods to `ListCache`.
	ListCache.prototype.clear = listCacheClear;
	ListCache.prototype['delete'] = listCacheDelete;
	ListCache.prototype.get = listCacheGet;
	ListCache.prototype.has = listCacheHas;
	ListCache.prototype.set = listCacheSet;

	/**
	 * Creates a map cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function MapCache(entries) {
	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the map.
	 *
	 * @private
	 * @name clear
	 * @memberOf MapCache
	 */
	function mapCacheClear() {
	  this.size = 0;
	  this.__data__ = {
	    'hash': new Hash,
	    'map': new (Map || ListCache),
	    'string': new Hash
	  };
	}

	/**
	 * Removes `key` and its value from the map.
	 *
	 * @private
	 * @name delete
	 * @memberOf MapCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function mapCacheDelete(key) {
	  var result = getMapData(this, key)['delete'](key);
	  this.size -= result ? 1 : 0;
	  return result;
	}

	/**
	 * Gets the map value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf MapCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function mapCacheGet(key) {
	  return getMapData(this, key).get(key);
	}

	/**
	 * Checks if a map value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf MapCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function mapCacheHas(key) {
	  return getMapData(this, key).has(key);
	}

	/**
	 * Sets the map `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf MapCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the map cache instance.
	 */
	function mapCacheSet(key, value) {
	  var data = getMapData(this, key),
	      size = data.size;

	  data.set(key, value);
	  this.size += data.size == size ? 0 : 1;
	  return this;
	}

	// Add methods to `MapCache`.
	MapCache.prototype.clear = mapCacheClear;
	MapCache.prototype['delete'] = mapCacheDelete;
	MapCache.prototype.get = mapCacheGet;
	MapCache.prototype.has = mapCacheHas;
	MapCache.prototype.set = mapCacheSet;

	/**
	 *
	 * Creates an array cache object to store unique values.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [values] The values to cache.
	 */
	function SetCache(values) {
	  var index = -1,
	      length = values == null ? 0 : values.length;

	  this.__data__ = new MapCache;
	  while (++index < length) {
	    this.add(values[index]);
	  }
	}

	/**
	 * Adds `value` to the array cache.
	 *
	 * @private
	 * @name add
	 * @memberOf SetCache
	 * @alias push
	 * @param {*} value The value to cache.
	 * @returns {Object} Returns the cache instance.
	 */
	function setCacheAdd(value) {
	  this.__data__.set(value, HASH_UNDEFINED);
	  return this;
	}

	/**
	 * Checks if `value` is in the array cache.
	 *
	 * @private
	 * @name has
	 * @memberOf SetCache
	 * @param {*} value The value to search for.
	 * @returns {number} Returns `true` if `value` is found, else `false`.
	 */
	function setCacheHas(value) {
	  return this.__data__.has(value);
	}

	// Add methods to `SetCache`.
	SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
	SetCache.prototype.has = setCacheHas;

	/**
	 * Creates a stack cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Stack(entries) {
	  var data = this.__data__ = new ListCache(entries);
	  this.size = data.size;
	}

	/**
	 * Removes all key-value entries from the stack.
	 *
	 * @private
	 * @name clear
	 * @memberOf Stack
	 */
	function stackClear() {
	  this.__data__ = new ListCache;
	  this.size = 0;
	}

	/**
	 * Removes `key` and its value from the stack.
	 *
	 * @private
	 * @name delete
	 * @memberOf Stack
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function stackDelete(key) {
	  var data = this.__data__,
	      result = data['delete'](key);

	  this.size = data.size;
	  return result;
	}

	/**
	 * Gets the stack value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Stack
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function stackGet(key) {
	  return this.__data__.get(key);
	}

	/**
	 * Checks if a stack value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Stack
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function stackHas(key) {
	  return this.__data__.has(key);
	}

	/**
	 * Sets the stack `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Stack
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the stack cache instance.
	 */
	function stackSet(key, value) {
	  var data = this.__data__;
	  if (data instanceof ListCache) {
	    var pairs = data.__data__;
	    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
	      pairs.push([key, value]);
	      this.size = ++data.size;
	      return this;
	    }
	    data = this.__data__ = new MapCache(pairs);
	  }
	  data.set(key, value);
	  this.size = data.size;
	  return this;
	}

	// Add methods to `Stack`.
	Stack.prototype.clear = stackClear;
	Stack.prototype['delete'] = stackDelete;
	Stack.prototype.get = stackGet;
	Stack.prototype.has = stackHas;
	Stack.prototype.set = stackSet;

	/**
	 * Creates an array of the enumerable property names of the array-like `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @param {boolean} inherited Specify returning inherited property names.
	 * @returns {Array} Returns the array of property names.
	 */
	function arrayLikeKeys(value, inherited) {
	  var isArr = isArray(value),
	      isArg = !isArr && isArguments(value),
	      isBuff = !isArr && !isArg && isBuffer(value),
	      isType = !isArr && !isArg && !isBuff && isTypedArray(value),
	      skipIndexes = isArr || isArg || isBuff || isType,
	      result = skipIndexes ? baseTimes(value.length, String) : [],
	      length = result.length;

	  for (var key in value) {
	    if ((inherited || hasOwnProperty.call(value, key)) &&
	        !(skipIndexes && (
	           // Safari 9 has enumerable `arguments.length` in strict mode.
	           key == 'length' ||
	           // Node.js 0.10 has enumerable non-index properties on buffers.
	           (isBuff && (key == 'offset' || key == 'parent')) ||
	           // PhantomJS 2 has enumerable non-index properties on typed arrays.
	           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
	           // Skip index properties.
	           isIndex(key, length)
	        ))) {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * Gets the index at which the `key` is found in `array` of key-value pairs.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} key The key to search for.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function assocIndexOf(array, key) {
	  var length = array.length;
	  while (length--) {
	    if (eq(array[length][0], key)) {
	      return length;
	    }
	  }
	  return -1;
	}

	/**
	 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
	 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
	 * symbols of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Function} keysFunc The function to get the keys of `object`.
	 * @param {Function} symbolsFunc The function to get the symbols of `object`.
	 * @returns {Array} Returns the array of property names and symbols.
	 */
	function baseGetAllKeys(object, keysFunc, symbolsFunc) {
	  var result = keysFunc(object);
	  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
	}

	/**
	 * The base implementation of `getTag` without fallbacks for buggy environments.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	function baseGetTag(value) {
	  if (value == null) {
	    return value === undefined ? undefinedTag : nullTag;
	  }
	  return (symToStringTag && symToStringTag in Object(value))
	    ? getRawTag(value)
	    : objectToString(value);
	}

	/**
	 * The base implementation of `_.isArguments`.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
	 */
	function baseIsArguments(value) {
	  return isObjectLike(value) && baseGetTag(value) == argsTag;
	}

	/**
	 * The base implementation of `_.isEqual` which supports partial comparisons
	 * and tracks traversed objects.
	 *
	 * @private
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @param {boolean} bitmask The bitmask flags.
	 *  1 - Unordered comparison
	 *  2 - Partial comparison
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 */
	function baseIsEqual(value, other, bitmask, customizer, stack) {
	  if (value === other) {
	    return true;
	  }
	  if (value == null || other == null || (!isObjectLike(value) && !isObjectLike(other))) {
	    return value !== value && other !== other;
	  }
	  return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
	}

	/**
	 * A specialized version of `baseIsEqual` for arrays and objects which performs
	 * deep comparisons and tracks traversed objects enabling objects with circular
	 * references to be compared.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
	  var objIsArr = isArray(object),
	      othIsArr = isArray(other),
	      objTag = objIsArr ? arrayTag : getTag(object),
	      othTag = othIsArr ? arrayTag : getTag(other);

	  objTag = objTag == argsTag ? objectTag : objTag;
	  othTag = othTag == argsTag ? objectTag : othTag;

	  var objIsObj = objTag == objectTag,
	      othIsObj = othTag == objectTag,
	      isSameTag = objTag == othTag;

	  if (isSameTag && isBuffer(object)) {
	    if (!isBuffer(other)) {
	      return false;
	    }
	    objIsArr = true;
	    objIsObj = false;
	  }
	  if (isSameTag && !objIsObj) {
	    stack || (stack = new Stack);
	    return (objIsArr || isTypedArray(object))
	      ? equalArrays(object, other, bitmask, customizer, equalFunc, stack)
	      : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
	  }
	  if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
	    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
	        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

	    if (objIsWrapped || othIsWrapped) {
	      var objUnwrapped = objIsWrapped ? object.value() : object,
	          othUnwrapped = othIsWrapped ? other.value() : other;

	      stack || (stack = new Stack);
	      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
	    }
	  }
	  if (!isSameTag) {
	    return false;
	  }
	  stack || (stack = new Stack);
	  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
	}

	/**
	 * The base implementation of `_.isNative` without bad shim checks.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a native function,
	 *  else `false`.
	 */
	function baseIsNative(value) {
	  if (!isObject(value) || isMasked(value)) {
	    return false;
	  }
	  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
	  return pattern.test(toSource(value));
	}

	/**
	 * The base implementation of `_.isTypedArray` without Node.js optimizations.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 */
	function baseIsTypedArray(value) {
	  return isObjectLike(value) &&
	    isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
	}

	/**
	 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 */
	function baseKeys(object) {
	  if (!isPrototype(object)) {
	    return nativeKeys(object);
	  }
	  var result = [];
	  for (var key in Object(object)) {
	    if (hasOwnProperty.call(object, key) && key != 'constructor') {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for arrays with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Array} array The array to compare.
	 * @param {Array} other The other array to compare.
	 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Object} stack Tracks traversed `array` and `other` objects.
	 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
	 */
	function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
	  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
	      arrLength = array.length,
	      othLength = other.length;

	  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
	    return false;
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(array);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var index = -1,
	      result = true,
	      seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new SetCache : undefined;

	  stack.set(array, other);
	  stack.set(other, array);

	  // Ignore non-index properties.
	  while (++index < arrLength) {
	    var arrValue = array[index],
	        othValue = other[index];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, arrValue, index, other, array, stack)
	        : customizer(arrValue, othValue, index, array, other, stack);
	    }
	    if (compared !== undefined) {
	      if (compared) {
	        continue;
	      }
	      result = false;
	      break;
	    }
	    // Recursively compare arrays (susceptible to call stack limits).
	    if (seen) {
	      if (!arraySome(other, function(othValue, othIndex) {
	            if (!cacheHas(seen, othIndex) &&
	                (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
	              return seen.push(othIndex);
	            }
	          })) {
	        result = false;
	        break;
	      }
	    } else if (!(
	          arrValue === othValue ||
	            equalFunc(arrValue, othValue, bitmask, customizer, stack)
	        )) {
	      result = false;
	      break;
	    }
	  }
	  stack['delete'](array);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for comparing objects of
	 * the same `toStringTag`.
	 *
	 * **Note:** This function only supports comparing values with tags of
	 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {string} tag The `toStringTag` of the objects to compare.
	 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
	  switch (tag) {
	    case dataViewTag:
	      if ((object.byteLength != other.byteLength) ||
	          (object.byteOffset != other.byteOffset)) {
	        return false;
	      }
	      object = object.buffer;
	      other = other.buffer;

	    case arrayBufferTag:
	      if ((object.byteLength != other.byteLength) ||
	          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
	        return false;
	      }
	      return true;

	    case boolTag:
	    case dateTag:
	    case numberTag:
	      // Coerce booleans to `1` or `0` and dates to milliseconds.
	      // Invalid dates are coerced to `NaN`.
	      return eq(+object, +other);

	    case errorTag:
	      return object.name == other.name && object.message == other.message;

	    case regexpTag:
	    case stringTag:
	      // Coerce regexes to strings and treat strings, primitives and objects,
	      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
	      // for more details.
	      return object == (other + '');

	    case mapTag:
	      var convert = mapToArray;

	    case setTag:
	      var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
	      convert || (convert = setToArray);

	      if (object.size != other.size && !isPartial) {
	        return false;
	      }
	      // Assume cyclic values are equal.
	      var stacked = stack.get(object);
	      if (stacked) {
	        return stacked == other;
	      }
	      bitmask |= COMPARE_UNORDERED_FLAG;

	      // Recursively compare objects (susceptible to call stack limits).
	      stack.set(object, other);
	      var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
	      stack['delete'](object);
	      return result;

	    case symbolTag:
	      if (symbolValueOf) {
	        return symbolValueOf.call(object) == symbolValueOf.call(other);
	      }
	  }
	  return false;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for objects with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
	  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
	      objProps = getAllKeys(object),
	      objLength = objProps.length,
	      othProps = getAllKeys(other),
	      othLength = othProps.length;

	  if (objLength != othLength && !isPartial) {
	    return false;
	  }
	  var index = objLength;
	  while (index--) {
	    var key = objProps[index];
	    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
	      return false;
	    }
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(object);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var result = true;
	  stack.set(object, other);
	  stack.set(other, object);

	  var skipCtor = isPartial;
	  while (++index < objLength) {
	    key = objProps[index];
	    var objValue = object[key],
	        othValue = other[key];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, objValue, key, other, object, stack)
	        : customizer(objValue, othValue, key, object, other, stack);
	    }
	    // Recursively compare objects (susceptible to call stack limits).
	    if (!(compared === undefined
	          ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
	          : compared
	        )) {
	      result = false;
	      break;
	    }
	    skipCtor || (skipCtor = key == 'constructor');
	  }
	  if (result && !skipCtor) {
	    var objCtor = object.constructor,
	        othCtor = other.constructor;

	    // Non `Object` object instances with different constructors are not equal.
	    if (objCtor != othCtor &&
	        ('constructor' in object && 'constructor' in other) &&
	        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
	          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
	      result = false;
	    }
	  }
	  stack['delete'](object);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * Creates an array of own enumerable property names and symbols of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names and symbols.
	 */
	function getAllKeys(object) {
	  return baseGetAllKeys(object, keys, getSymbols);
	}

	/**
	 * Gets the data for `map`.
	 *
	 * @private
	 * @param {Object} map The map to query.
	 * @param {string} key The reference key.
	 * @returns {*} Returns the map data.
	 */
	function getMapData(map, key) {
	  var data = map.__data__;
	  return isKeyable(key)
	    ? data[typeof key == 'string' ? 'string' : 'hash']
	    : data.map;
	}

	/**
	 * Gets the native function at `key` of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {string} key The key of the method to get.
	 * @returns {*} Returns the function if it's native, else `undefined`.
	 */
	function getNative(object, key) {
	  var value = getValue(object, key);
	  return baseIsNative(value) ? value : undefined;
	}

	/**
	 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the raw `toStringTag`.
	 */
	function getRawTag(value) {
	  var isOwn = hasOwnProperty.call(value, symToStringTag),
	      tag = value[symToStringTag];

	  try {
	    value[symToStringTag] = undefined;
	    var unmasked = true;
	  } catch (e) {}

	  var result = nativeObjectToString.call(value);
	  if (unmasked) {
	    if (isOwn) {
	      value[symToStringTag] = tag;
	    } else {
	      delete value[symToStringTag];
	    }
	  }
	  return result;
	}

	/**
	 * Creates an array of the own enumerable symbols of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of symbols.
	 */
	var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
	  if (object == null) {
	    return [];
	  }
	  object = Object(object);
	  return arrayFilter(nativeGetSymbols(object), function(symbol) {
	    return propertyIsEnumerable.call(object, symbol);
	  });
	};

	/**
	 * Gets the `toStringTag` of `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	var getTag = baseGetTag;

	// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
	if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
	    (Map && getTag(new Map) != mapTag) ||
	    (Promise && getTag(Promise.resolve()) != promiseTag) ||
	    (Set && getTag(new Set) != setTag) ||
	    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
	  getTag = function(value) {
	    var result = baseGetTag(value),
	        Ctor = result == objectTag ? value.constructor : undefined,
	        ctorString = Ctor ? toSource(Ctor) : '';

	    if (ctorString) {
	      switch (ctorString) {
	        case dataViewCtorString: return dataViewTag;
	        case mapCtorString: return mapTag;
	        case promiseCtorString: return promiseTag;
	        case setCtorString: return setTag;
	        case weakMapCtorString: return weakMapTag;
	      }
	    }
	    return result;
	  };
	}

	/**
	 * Checks if `value` is a valid array-like index.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
	 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
	 */
	function isIndex(value, length) {
	  length = length == null ? MAX_SAFE_INTEGER : length;
	  return !!length &&
	    (typeof value == 'number' || reIsUint.test(value)) &&
	    (value > -1 && value % 1 == 0 && value < length);
	}

	/**
	 * Checks if `value` is suitable for use as unique object key.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
	 */
	function isKeyable(value) {
	  var type = typeof value;
	  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
	    ? (value !== '__proto__')
	    : (value === null);
	}

	/**
	 * Checks if `func` has its source masked.
	 *
	 * @private
	 * @param {Function} func The function to check.
	 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
	 */
	function isMasked(func) {
	  return !!maskSrcKey && (maskSrcKey in func);
	}

	/**
	 * Checks if `value` is likely a prototype object.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
	 */
	function isPrototype(value) {
	  var Ctor = value && value.constructor,
	      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

	  return value === proto;
	}

	/**
	 * Converts `value` to a string using `Object.prototype.toString`.
	 *
	 * @private
	 * @param {*} value The value to convert.
	 * @returns {string} Returns the converted string.
	 */
	function objectToString(value) {
	  return nativeObjectToString.call(value);
	}

	/**
	 * Converts `func` to its source code.
	 *
	 * @private
	 * @param {Function} func The function to convert.
	 * @returns {string} Returns the source code.
	 */
	function toSource(func) {
	  if (func != null) {
	    try {
	      return funcToString.call(func);
	    } catch (e) {}
	    try {
	      return (func + '');
	    } catch (e) {}
	  }
	  return '';
	}

	/**
	 * Performs a
	 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	 * comparison between two values to determine if they are equivalent.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 * var other = { 'a': 1 };
	 *
	 * _.eq(object, object);
	 * // => true
	 *
	 * _.eq(object, other);
	 * // => false
	 *
	 * _.eq('a', 'a');
	 * // => true
	 *
	 * _.eq('a', Object('a'));
	 * // => false
	 *
	 * _.eq(NaN, NaN);
	 * // => true
	 */
	function eq(value, other) {
	  return value === other || (value !== value && other !== other);
	}

	/**
	 * Checks if `value` is likely an `arguments` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
	 *  else `false`.
	 * @example
	 *
	 * _.isArguments(function() { return arguments; }());
	 * // => true
	 *
	 * _.isArguments([1, 2, 3]);
	 * // => false
	 */
	var isArguments = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
	  return isObjectLike(value) && hasOwnProperty.call(value, 'callee') &&
	    !propertyIsEnumerable.call(value, 'callee');
	};

	/**
	 * Checks if `value` is classified as an `Array` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
	 * @example
	 *
	 * _.isArray([1, 2, 3]);
	 * // => true
	 *
	 * _.isArray(document.body.children);
	 * // => false
	 *
	 * _.isArray('abc');
	 * // => false
	 *
	 * _.isArray(_.noop);
	 * // => false
	 */
	var isArray = Array.isArray;

	/**
	 * Checks if `value` is array-like. A value is considered array-like if it's
	 * not a function and has a `value.length` that's an integer greater than or
	 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
	 * @example
	 *
	 * _.isArrayLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isArrayLike(document.body.children);
	 * // => true
	 *
	 * _.isArrayLike('abc');
	 * // => true
	 *
	 * _.isArrayLike(_.noop);
	 * // => false
	 */
	function isArrayLike(value) {
	  return value != null && isLength(value.length) && !isFunction(value);
	}

	/**
	 * Checks if `value` is a buffer.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.3.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
	 * @example
	 *
	 * _.isBuffer(new Buffer(2));
	 * // => true
	 *
	 * _.isBuffer(new Uint8Array(2));
	 * // => false
	 */
	var isBuffer = nativeIsBuffer || stubFalse;

	/**
	 * Performs a deep comparison between two values to determine if they are
	 * equivalent.
	 *
	 * **Note:** This method supports comparing arrays, array buffers, booleans,
	 * date objects, error objects, maps, numbers, `Object` objects, regexes,
	 * sets, strings, symbols, and typed arrays. `Object` objects are compared
	 * by their own, not inherited, enumerable properties. Functions and DOM
	 * nodes are compared by strict equality, i.e. `===`.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 * var other = { 'a': 1 };
	 *
	 * _.isEqual(object, other);
	 * // => true
	 *
	 * object === other;
	 * // => false
	 */
	function isEqual(value, other) {
	  return baseIsEqual(value, other);
	}

	/**
	 * Checks if `value` is classified as a `Function` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
	 * @example
	 *
	 * _.isFunction(_);
	 * // => true
	 *
	 * _.isFunction(/abc/);
	 * // => false
	 */
	function isFunction(value) {
	  if (!isObject(value)) {
	    return false;
	  }
	  // The use of `Object#toString` avoids issues with the `typeof` operator
	  // in Safari 9 which returns 'object' for typed arrays and other constructors.
	  var tag = baseGetTag(value);
	  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
	}

	/**
	 * Checks if `value` is a valid array-like length.
	 *
	 * **Note:** This method is loosely based on
	 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
	 * @example
	 *
	 * _.isLength(3);
	 * // => true
	 *
	 * _.isLength(Number.MIN_VALUE);
	 * // => false
	 *
	 * _.isLength(Infinity);
	 * // => false
	 *
	 * _.isLength('3');
	 * // => false
	 */
	function isLength(value) {
	  return typeof value == 'number' &&
	    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
	}

	/**
	 * Checks if `value` is the
	 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
	 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
	 * @example
	 *
	 * _.isObject({});
	 * // => true
	 *
	 * _.isObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isObject(_.noop);
	 * // => true
	 *
	 * _.isObject(null);
	 * // => false
	 */
	function isObject(value) {
	  var type = typeof value;
	  return value != null && (type == 'object' || type == 'function');
	}

	/**
	 * Checks if `value` is object-like. A value is object-like if it's not `null`
	 * and has a `typeof` result of "object".
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
	 * @example
	 *
	 * _.isObjectLike({});
	 * // => true
	 *
	 * _.isObjectLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isObjectLike(_.noop);
	 * // => false
	 *
	 * _.isObjectLike(null);
	 * // => false
	 */
	function isObjectLike(value) {
	  return value != null && typeof value == 'object';
	}

	/**
	 * Checks if `value` is classified as a typed array.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 * @example
	 *
	 * _.isTypedArray(new Uint8Array);
	 * // => true
	 *
	 * _.isTypedArray([]);
	 * // => false
	 */
	var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

	/**
	 * Creates an array of the own enumerable property names of `object`.
	 *
	 * **Note:** Non-object values are coerced to objects. See the
	 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
	 * for more details.
	 *
	 * @static
	 * @since 0.1.0
	 * @memberOf _
	 * @category Object
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 * @example
	 *
	 * function Foo() {
	 *   this.a = 1;
	 *   this.b = 2;
	 * }
	 *
	 * Foo.prototype.c = 3;
	 *
	 * _.keys(new Foo);
	 * // => ['a', 'b'] (iteration order is not guaranteed)
	 *
	 * _.keys('hi');
	 * // => ['0', '1']
	 */
	function keys(object) {
	  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
	}

	/**
	 * This method returns a new empty array.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.13.0
	 * @category Util
	 * @returns {Array} Returns the new empty array.
	 * @example
	 *
	 * var arrays = _.times(2, _.stubArray);
	 *
	 * console.log(arrays);
	 * // => [[], []]
	 *
	 * console.log(arrays[0] === arrays[1]);
	 * // => false
	 */
	function stubArray() {
	  return [];
	}

	/**
	 * This method returns `false`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.13.0
	 * @category Util
	 * @returns {boolean} Returns `false`.
	 * @example
	 *
	 * _.times(2, _.stubFalse);
	 * // => [false, false]
	 */
	function stubFalse() {
	  return false;
	}

	module.exports = isEqual; 
} (lodash_isequal, lodash_isequal.exports));

var lodash_isequalExports = lodash_isequal.exports;
var Mi = /*@__PURE__*/getDefaultExportFromCjs(lodash_isequalExports);

function ki(r,e){if(r.length>=255)throw new TypeError("Alphabet too long");for(var t=new Uint8Array(256),i=0;i<t.length;i++)t[i]=255;for(var s=0;s<r.length;s++){var n=r.charAt(s),a=n.charCodeAt(0);if(t[a]!==255)throw new TypeError(n+" is ambiguous");t[a]=s;}var o=r.length,h=r.charAt(0),l=Math.log(o)/Math.log(256),d=Math.log(256)/Math.log(o);function p(c){if(c instanceof Uint8Array||(ArrayBuffer.isView(c)?c=new Uint8Array(c.buffer,c.byteOffset,c.byteLength):Array.isArray(c)&&(c=Uint8Array.from(c))),!(c instanceof Uint8Array))throw new TypeError("Expected Uint8Array");if(c.length===0)return "";for(var b=0,z=0,v=0,_=c.length;v!==_&&c[v]===0;)v++,b++;for(var T=(_-v)*d+1>>>0,m=new Uint8Array(T);v!==_;){for(var S=c[v],A=0,I=T-1;(S!==0||A<z)&&I!==-1;I--,A++)S+=256*m[I]>>>0,m[I]=S%o>>>0,S=S/o>>>0;if(S!==0)throw new Error("Non-zero carry");z=A,v++;}for(var O=T-z;O!==T&&m[O]===0;)O++;for(var V=h.repeat(b);O<T;++O)V+=r.charAt(m[O]);return V}function y(c){if(typeof c!="string")throw new TypeError("Expected String");if(c.length===0)return new Uint8Array;var b=0;if(c[b]!==" "){for(var z=0,v=0;c[b]===h;)z++,b++;for(var _=(c.length-b)*l+1>>>0,T=new Uint8Array(_);c[b];){var m=t[c.charCodeAt(b)];if(m===255)return;for(var S=0,A=_-1;(m!==0||S<v)&&A!==-1;A--,S++)m+=o*T[A]>>>0,T[A]=m%256>>>0,m=m/256>>>0;if(m!==0)throw new Error("Non-zero carry");v=S,b++;}if(c[b]!==" "){for(var I=_-v;I!==_&&T[I]===0;)I++;for(var O=new Uint8Array(z+(_-I)),V=z;I!==_;)O[V++]=T[I++];return O}}}function $(c){var b=y(c);if(b)return b;throw new Error(`Non-${e} character`)}return {encode:p,decodeUnsafe:y,decode:$}}var Ki=ki,Bi=Ki;const Ae=r=>{if(r instanceof Uint8Array&&r.constructor.name==="Uint8Array")return r;if(r instanceof ArrayBuffer)return new Uint8Array(r);if(ArrayBuffer.isView(r))return new Uint8Array(r.buffer,r.byteOffset,r.byteLength);throw new Error("Unknown type, must be binary type")},Vi=r=>new TextEncoder().encode(r),qi=r=>new TextDecoder().decode(r);class ji{constructor(e,t,i){this.name=e,this.prefix=t,this.baseEncode=i;}encode(e){if(e instanceof Uint8Array)return `${this.prefix}${this.baseEncode(e)}`;throw Error("Unknown type, must be binary type")}}class Yi{constructor(e,t,i){if(this.name=e,this.prefix=t,t.codePointAt(0)===void 0)throw new Error("Invalid prefix character");this.prefixCodePoint=t.codePointAt(0),this.baseDecode=i;}decode(e){if(typeof e=="string"){if(e.codePointAt(0)!==this.prefixCodePoint)throw Error(`Unable to decode multibase string ${JSON.stringify(e)}, ${this.name} decoder only supports inputs prefixed with ${this.prefix}`);return this.baseDecode(e.slice(this.prefix.length))}else throw Error("Can only multibase decode strings")}or(e){return ze(this,e)}}class Gi{constructor(e){this.decoders=e;}or(e){return ze(this,e)}decode(e){const t=e[0],i=this.decoders[t];if(i)return i.decode(e);throw RangeError(`Unable to decode multibase string ${JSON.stringify(e)}, only inputs prefixed with ${Object.keys(this.decoders)} are supported`)}}const ze=(r,e)=>new Gi({...r.decoders||{[r.prefix]:r},...e.decoders||{[e.prefix]:e}});class Hi{constructor(e,t,i,s){this.name=e,this.prefix=t,this.baseEncode=i,this.baseDecode=s,this.encoder=new ji(e,t,i),this.decoder=new Yi(e,t,s);}encode(e){return this.encoder.encode(e)}decode(e){return this.decoder.decode(e)}}const J$1=({name:r,prefix:e,encode:t,decode:i})=>new Hi(r,e,t,i),K=({prefix:r,name:e,alphabet:t})=>{const{encode:i,decode:s}=Bi(t,e);return J$1({prefix:r,name:e,encode:i,decode:n=>Ae(s(n))})},Ji=(r,e,t,i)=>{const s={};for(let d=0;d<e.length;++d)s[e[d]]=d;let n=r.length;for(;r[n-1]==="=";)--n;const a=new Uint8Array(n*t/8|0);let o=0,h=0,l=0;for(let d=0;d<n;++d){const p=s[r[d]];if(p===void 0)throw new SyntaxError(`Non-${i} character`);h=h<<t|p,o+=t,o>=8&&(o-=8,a[l++]=255&h>>o);}if(o>=t||255&h<<8-o)throw new SyntaxError("Unexpected end of data");return a},Wi=(r,e,t)=>{const i=e[e.length-1]==="=",s=(1<<t)-1;let n="",a=0,o=0;for(let h=0;h<r.length;++h)for(o=o<<8|r[h],a+=8;a>t;)a-=t,n+=e[s&o>>a];if(a&&(n+=e[s&o<<t-a]),i)for(;n.length*t&7;)n+="=";return n},g$1=({name:r,prefix:e,bitsPerChar:t,alphabet:i})=>J$1({prefix:e,name:r,encode(s){return Wi(s,i,t)},decode(s){return Ji(s,i,t,r)}}),Xi=J$1({prefix:"\0",name:"identity",encode:r=>qi(r),decode:r=>Vi(r)});var Qi=Object.freeze({__proto__:null,identity:Xi});const Zi=g$1({prefix:"0",name:"base2",alphabet:"01",bitsPerChar:1});var es=Object.freeze({__proto__:null,base2:Zi});const ts=g$1({prefix:"7",name:"base8",alphabet:"01234567",bitsPerChar:3});var is=Object.freeze({__proto__:null,base8:ts});const ss=K({prefix:"9",name:"base10",alphabet:"0123456789"});var rs$1=Object.freeze({__proto__:null,base10:ss});const ns$1=g$1({prefix:"f",name:"base16",alphabet:"0123456789abcdef",bitsPerChar:4}),as$1=g$1({prefix:"F",name:"base16upper",alphabet:"0123456789ABCDEF",bitsPerChar:4});var os$1=Object.freeze({__proto__:null,base16:ns$1,base16upper:as$1});const hs$1=g$1({prefix:"b",name:"base32",alphabet:"abcdefghijklmnopqrstuvwxyz234567",bitsPerChar:5}),cs$1=g$1({prefix:"B",name:"base32upper",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",bitsPerChar:5}),us=g$1({prefix:"c",name:"base32pad",alphabet:"abcdefghijklmnopqrstuvwxyz234567=",bitsPerChar:5}),ls$1=g$1({prefix:"C",name:"base32padupper",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=",bitsPerChar:5}),ds$1=g$1({prefix:"v",name:"base32hex",alphabet:"0123456789abcdefghijklmnopqrstuv",bitsPerChar:5}),gs=g$1({prefix:"V",name:"base32hexupper",alphabet:"0123456789ABCDEFGHIJKLMNOPQRSTUV",bitsPerChar:5}),ps$1=g$1({prefix:"t",name:"base32hexpad",alphabet:"0123456789abcdefghijklmnopqrstuv=",bitsPerChar:5}),Ds=g$1({prefix:"T",name:"base32hexpadupper",alphabet:"0123456789ABCDEFGHIJKLMNOPQRSTUV=",bitsPerChar:5}),ys=g$1({prefix:"h",name:"base32z",alphabet:"ybndrfg8ejkmcpqxot1uwisza345h769",bitsPerChar:5});var bs=Object.freeze({__proto__:null,base32:hs$1,base32upper:cs$1,base32pad:us,base32padupper:ls$1,base32hex:ds$1,base32hexupper:gs,base32hexpad:ps$1,base32hexpadupper:Ds,base32z:ys});const ms=K({prefix:"k",name:"base36",alphabet:"0123456789abcdefghijklmnopqrstuvwxyz"}),fs=K({prefix:"K",name:"base36upper",alphabet:"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"});var Es=Object.freeze({__proto__:null,base36:ms,base36upper:fs});const ws=K({name:"base58btc",prefix:"z",alphabet:"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"}),vs=K({name:"base58flickr",prefix:"Z",alphabet:"123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"});var Is=Object.freeze({__proto__:null,base58btc:ws,base58flickr:vs});const Cs=g$1({prefix:"m",name:"base64",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",bitsPerChar:6}),Rs=g$1({prefix:"M",name:"base64pad",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",bitsPerChar:6}),_s=g$1({prefix:"u",name:"base64url",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",bitsPerChar:6}),Ts=g$1({prefix:"U",name:"base64urlpad",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=",bitsPerChar:6});var Ss=Object.freeze({__proto__:null,base64:Cs,base64pad:Rs,base64url:_s,base64urlpad:Ts});const Ne=Array.from("\u{1F680}\u{1FA90}\u2604\u{1F6F0}\u{1F30C}\u{1F311}\u{1F312}\u{1F313}\u{1F314}\u{1F315}\u{1F316}\u{1F317}\u{1F318}\u{1F30D}\u{1F30F}\u{1F30E}\u{1F409}\u2600\u{1F4BB}\u{1F5A5}\u{1F4BE}\u{1F4BF}\u{1F602}\u2764\u{1F60D}\u{1F923}\u{1F60A}\u{1F64F}\u{1F495}\u{1F62D}\u{1F618}\u{1F44D}\u{1F605}\u{1F44F}\u{1F601}\u{1F525}\u{1F970}\u{1F494}\u{1F496}\u{1F499}\u{1F622}\u{1F914}\u{1F606}\u{1F644}\u{1F4AA}\u{1F609}\u263A\u{1F44C}\u{1F917}\u{1F49C}\u{1F614}\u{1F60E}\u{1F607}\u{1F339}\u{1F926}\u{1F389}\u{1F49E}\u270C\u2728\u{1F937}\u{1F631}\u{1F60C}\u{1F338}\u{1F64C}\u{1F60B}\u{1F497}\u{1F49A}\u{1F60F}\u{1F49B}\u{1F642}\u{1F493}\u{1F929}\u{1F604}\u{1F600}\u{1F5A4}\u{1F603}\u{1F4AF}\u{1F648}\u{1F447}\u{1F3B6}\u{1F612}\u{1F92D}\u2763\u{1F61C}\u{1F48B}\u{1F440}\u{1F62A}\u{1F611}\u{1F4A5}\u{1F64B}\u{1F61E}\u{1F629}\u{1F621}\u{1F92A}\u{1F44A}\u{1F973}\u{1F625}\u{1F924}\u{1F449}\u{1F483}\u{1F633}\u270B\u{1F61A}\u{1F61D}\u{1F634}\u{1F31F}\u{1F62C}\u{1F643}\u{1F340}\u{1F337}\u{1F63B}\u{1F613}\u2B50\u2705\u{1F97A}\u{1F308}\u{1F608}\u{1F918}\u{1F4A6}\u2714\u{1F623}\u{1F3C3}\u{1F490}\u2639\u{1F38A}\u{1F498}\u{1F620}\u261D\u{1F615}\u{1F33A}\u{1F382}\u{1F33B}\u{1F610}\u{1F595}\u{1F49D}\u{1F64A}\u{1F639}\u{1F5E3}\u{1F4AB}\u{1F480}\u{1F451}\u{1F3B5}\u{1F91E}\u{1F61B}\u{1F534}\u{1F624}\u{1F33C}\u{1F62B}\u26BD\u{1F919}\u2615\u{1F3C6}\u{1F92B}\u{1F448}\u{1F62E}\u{1F646}\u{1F37B}\u{1F343}\u{1F436}\u{1F481}\u{1F632}\u{1F33F}\u{1F9E1}\u{1F381}\u26A1\u{1F31E}\u{1F388}\u274C\u270A\u{1F44B}\u{1F630}\u{1F928}\u{1F636}\u{1F91D}\u{1F6B6}\u{1F4B0}\u{1F353}\u{1F4A2}\u{1F91F}\u{1F641}\u{1F6A8}\u{1F4A8}\u{1F92C}\u2708\u{1F380}\u{1F37A}\u{1F913}\u{1F619}\u{1F49F}\u{1F331}\u{1F616}\u{1F476}\u{1F974}\u25B6\u27A1\u2753\u{1F48E}\u{1F4B8}\u2B07\u{1F628}\u{1F31A}\u{1F98B}\u{1F637}\u{1F57A}\u26A0\u{1F645}\u{1F61F}\u{1F635}\u{1F44E}\u{1F932}\u{1F920}\u{1F927}\u{1F4CC}\u{1F535}\u{1F485}\u{1F9D0}\u{1F43E}\u{1F352}\u{1F617}\u{1F911}\u{1F30A}\u{1F92F}\u{1F437}\u260E\u{1F4A7}\u{1F62F}\u{1F486}\u{1F446}\u{1F3A4}\u{1F647}\u{1F351}\u2744\u{1F334}\u{1F4A3}\u{1F438}\u{1F48C}\u{1F4CD}\u{1F940}\u{1F922}\u{1F445}\u{1F4A1}\u{1F4A9}\u{1F450}\u{1F4F8}\u{1F47B}\u{1F910}\u{1F92E}\u{1F3BC}\u{1F975}\u{1F6A9}\u{1F34E}\u{1F34A}\u{1F47C}\u{1F48D}\u{1F4E3}\u{1F942}"),Ps=Ne.reduce((r,e,t)=>(r[t]=e,r),[]),Os=Ne.reduce((r,e,t)=>(r[e.codePointAt(0)]=t,r),[]);function xs(r){return r.reduce((e,t)=>(e+=Ps[t],e),"")}function As(r){const e=[];for(const t of r){const i=Os[t.codePointAt(0)];if(i===void 0)throw new Error(`Non-base256emoji character: ${t}`);e.push(i);}return new Uint8Array(e)}const zs=J$1({prefix:"\u{1F680}",name:"base256emoji",encode:xs,decode:As});var Ns=Object.freeze({__proto__:null,base256emoji:zs}),Ls=Ue,Le=128,Us=127,Fs=~Us,$s=Math.pow(2,31);function Ue(r,e,t){e=e||[],t=t||0;for(var i=t;r>=$s;)e[t++]=r&255|Le,r/=128;for(;r&Fs;)e[t++]=r&255|Le,r>>>=7;return e[t]=r|0,Ue.bytes=t-i+1,e}var Ms=ae$1,ks=128,Fe=127;function ae$1(r,i){var t=0,i=i||0,s=0,n=i,a,o=r.length;do{if(n>=o)throw ae$1.bytes=0,new RangeError("Could not decode varint");a=r[n++],t+=s<28?(a&Fe)<<s:(a&Fe)*Math.pow(2,s),s+=7;}while(a>=ks);return ae$1.bytes=n-i,t}var Ks=Math.pow(2,7),Bs=Math.pow(2,14),Vs=Math.pow(2,21),qs=Math.pow(2,28),js=Math.pow(2,35),Ys=Math.pow(2,42),Gs=Math.pow(2,49),Hs=Math.pow(2,56),Js=Math.pow(2,63),Ws=function(r){return r<Ks?1:r<Bs?2:r<Vs?3:r<qs?4:r<js?5:r<Ys?6:r<Gs?7:r<Hs?8:r<Js?9:10},Xs={encode:Ls,decode:Ms,encodingLength:Ws},$e=Xs;const Me=(r,e,t=0)=>($e.encode(r,e,t),e),ke=r=>$e.encodingLength(r),oe$1=(r,e)=>{const t=e.byteLength,i=ke(r),s=i+ke(t),n=new Uint8Array(s+t);return Me(r,n,0),Me(t,n,i),n.set(e,s),new Qs(r,t,e,n)};class Qs{constructor(e,t,i,s){this.code=e,this.size=t,this.digest=i,this.bytes=s;}}const Ke=({name:r,code:e,encode:t})=>new Zs(r,e,t);class Zs{constructor(e,t,i){this.name=e,this.code=t,this.encode=i;}digest(e){if(e instanceof Uint8Array){const t=this.encode(e);return t instanceof Uint8Array?oe$1(this.code,t):t.then(i=>oe$1(this.code,i))}else throw Error("Unknown type, must be binary type")}}const Be=r=>async e=>new Uint8Array(await crypto.subtle.digest(r,e)),er=Ke({name:"sha2-256",code:18,encode:Be("SHA-256")}),tr=Ke({name:"sha2-512",code:19,encode:Be("SHA-512")});var ir=Object.freeze({__proto__:null,sha256:er,sha512:tr});const Ve=0,sr="identity",qe=Ae,rr=r=>oe$1(Ve,qe(r)),nr={code:Ve,name:sr,encode:qe,digest:rr};var ar=Object.freeze({__proto__:null,identity:nr});new TextEncoder,new TextDecoder;const je={...Qi,...es,...is,...rs$1,...os$1,...bs,...Es,...Is,...Ss,...Ns};({...ir,...ar});function Ye(r){return globalThis.Buffer!=null?new Uint8Array(r.buffer,r.byteOffset,r.byteLength):r}function or(r=0){return globalThis.Buffer!=null&&globalThis.Buffer.allocUnsafe!=null?Ye(globalThis.Buffer.allocUnsafe(r)):new Uint8Array(r)}function Ge(r,e,t,i){return {name:r,prefix:e,encoder:{name:r,prefix:e,encode:t},decoder:{decode:i}}}const He=Ge("utf8","u",r=>"u"+new TextDecoder("utf8").decode(r),r=>new TextEncoder().encode(r.substring(1))),he$1=Ge("ascii","a",r=>{let e="a";for(let t=0;t<r.length;t++)e+=String.fromCharCode(r[t]);return e},r=>{r=r.substring(1);const e=or(r.length);for(let t=0;t<r.length;t++)e[t]=r.charCodeAt(t);return e}),hr={utf8:He,"utf-8":He,hex:je.base16,latin1:he$1,ascii:he$1,binary:he$1,...je};function cr(r,e="utf8"){const t=hr[e];if(!t)throw new Error(`Unsupported encoding "${e}"`);return (e==="utf8"||e==="utf-8")&&globalThis.Buffer!=null&&globalThis.Buffer.from!=null?Ye(globalThis.Buffer.from(r,"utf-8")):t.decoder.decode(`${t.prefix}${r}`)}const ce$1="wc",Je=2,W="core",x=`${ce$1}@2:${W}:`,We={name:W,logger:"error"},Xe={database:":memory:"},Qe="crypto",ue="client_ed25519_seed",Ze=cjs$4.ONE_DAY,et="keychain",tt="0.3",it="messages",st="0.3",rt=cjs$4.SIX_HOURS,nt="publisher",at="irn",ot="error",le$1="wss://relay.walletconnect.com",de$1="wss://relay.walletconnect.org",ht="relayer",D={message:"relayer_message",message_ack:"relayer_message_ack",connect:"relayer_connect",disconnect:"relayer_disconnect",error:"relayer_error",connection_stalled:"relayer_connection_stalled",transport_closed:"relayer_transport_closed",publish:"relayer_publish"},ct="_subscription",P={payload:"payload",connect:"connect",disconnect:"disconnect",error:"error"},ut=cjs$4.ONE_SECOND,lt="2.10.0",dt=1e4,gt="0.3",pt="WALLETCONNECT_CLIENT_ID",C$1={created:"subscription_created",deleted:"subscription_deleted",expired:"subscription_expired",disabled:"subscription_disabled",sync:"subscription_sync",resubscribed:"subscription_resubscribed"},Dt="subscription",yt="0.3",bt=cjs$4.FIVE_SECONDS*1e3,mt="pairing",ft="0.3",F$1={wc_pairingDelete:{req:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1e3},res:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1001}},wc_pairingPing:{req:{ttl:cjs$4.THIRTY_SECONDS,prompt:!1,tag:1002},res:{ttl:cjs$4.THIRTY_SECONDS,prompt:!1,tag:1003}},unregistered_method:{req:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:0},res:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:0}}},R={created:"history_created",updated:"history_updated",deleted:"history_deleted",sync:"history_sync"},Et="history",wt="0.3",vt="expirer",w={created:"expirer_created",deleted:"expirer_deleted",expired:"expirer_expired",sync:"expirer_sync"},It="0.3",X$1="verify-api",Q$1="https://verify.walletconnect.com",ge="https://verify.walletconnect.org";class Ct{constructor(e,t){this.core=e,this.logger=t,this.keychain=new Map,this.name=et,this.version=tt,this.initialized=!1,this.storagePrefix=x,this.init=async()=>{if(!this.initialized){const i=await this.getKeyChain();typeof i<"u"&&(this.keychain=i),this.initialized=!0;}},this.has=i=>(this.isInitialized(),this.keychain.has(i)),this.set=async(i,s)=>{this.isInitialized(),this.keychain.set(i,s),await this.persist();},this.get=i=>{this.isInitialized();const s=this.keychain.get(i);if(typeof s>"u"){const{message:n}=N("NO_MATCHING_KEY",`${this.name}: ${i}`);throw new Error(n)}return s},this.del=async i=>{this.isInitialized(),this.keychain.delete(i),await this.persist();},this.core=e,this.logger=cjs$3.generateChildLogger(t,this.name);}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}async setKeyChain(e){await this.core.storage.setItem(this.storageKey,et$1(e));}async getKeyChain(){const e=await this.core.storage.getItem(this.storageKey);return typeof e<"u"?nt$1(e):void 0}async persist(){await this.setKeyChain(this.keychain);}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class Rt{constructor(e,t,i){this.core=e,this.logger=t,this.name=Qe,this.initialized=!1,this.init=async()=>{this.initialized||(await this.keychain.init(),this.initialized=!0);},this.hasKeys=s=>(this.isInitialized(),this.keychain.has(s)),this.getClientId=async()=>{this.isInitialized();const s=await this.getClientSeed(),n=generateKeyPair(s);return encodeIss(n.publicKey)},this.generateKeyPair=()=>{this.isInitialized();const s=jn();return this.setPrivateKey(s.publicKey,s.privateKey)},this.signJWT=async s=>{this.isInitialized();const n=await this.getClientSeed(),a=generateKeyPair(n),o=Dn(),h=Ze;return await signJWT(o,s,h,a)},this.generateSharedKey=(s,n,a)=>{this.isInitialized();const o=this.getPrivateKey(s),h=kn(o,n);return this.setSymKey(h,a)},this.setSymKey=async(s,n)=>{this.isInitialized();const a=n||Vn(s);return await this.keychain.set(a,s),a},this.deleteKeyPair=async s=>{this.isInitialized(),await this.keychain.del(s);},this.deleteSymKey=async s=>{this.isInitialized(),await this.keychain.del(s);},this.encode=async(s,n,a)=>{this.isInitialized();const o=Re(a),h=safeJsonStringify(n);if(Fn(o)){const y=o.senderPublicKey,$=o.receiverPublicKey;s=await this.generateSharedKey(y,$);}const l=this.getSymKey(s),{type:d,senderPublicKey:p}=o;return Kn({type:d,symKey:l,message:h,senderPublicKey:p})},this.decode=async(s,n,a)=>{this.isInitialized();const o=xn(n,a);if(Fn(o)){const h=o.receiverPublicKey,l=o.senderPublicKey;s=await this.generateSharedKey(h,l);}try{const h=this.getSymKey(s),l=Ln({symKey:h,encoded:n});return safeJsonParse(l)}catch(h){this.logger.error(`Failed to decode message from topic: '${s}', clientId: '${await this.getClientId()}'`),this.logger.error(h);}},this.getPayloadType=s=>{const n=ee(s);return $(n.type)},this.getPayloadSenderPublicKey=s=>{const n=ee(s);return n.senderPublicKey?toString(n.senderPublicKey,p):void 0},this.core=e,this.logger=cjs$3.generateChildLogger(t,this.name),this.keychain=i||new Ct(this.core,this.logger);}get context(){return cjs$3.getLoggerContext(this.logger)}async setPrivateKey(e,t){return await this.keychain.set(e,t),e}getPrivateKey(e){return this.keychain.get(e)}async getClientSeed(){let e="";try{e=this.keychain.get(ue);}catch{e=Dn(),await this.keychain.set(ue,e);}return cr(e,"base16")}getSymKey(e){return this.keychain.get(e)}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class _t extends a{constructor(e,t){super(e,t),this.logger=e,this.core=t,this.messages=new Map,this.name=it,this.version=st,this.initialized=!1,this.storagePrefix=x,this.init=async()=>{if(!this.initialized){this.logger.trace("Initialized");try{const i=await this.getRelayerMessages();typeof i<"u"&&(this.messages=i),this.logger.debug(`Successfully Restored records for ${this.name}`),this.logger.trace({type:"method",method:"restore",size:this.messages.size});}catch(i){this.logger.debug(`Failed to Restore records for ${this.name}`),this.logger.error(i);}finally{this.initialized=!0;}}},this.set=async(i,s)=>{this.isInitialized();const n=Mn(s);let a=this.messages.get(i);return typeof a>"u"&&(a={}),typeof a[n]<"u"||(a[n]=s,this.messages.set(i,a),await this.persist()),n},this.get=i=>{this.isInitialized();let s=this.messages.get(i);return typeof s>"u"&&(s={}),s},this.has=(i,s)=>{this.isInitialized();const n=this.get(i),a=Mn(s);return typeof n[a]<"u"},this.del=async i=>{this.isInitialized(),this.messages.delete(i),await this.persist();},this.logger=cjs$3.generateChildLogger(e,this.name),this.core=t;}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}async setRelayerMessages(e){await this.core.storage.setItem(this.storageKey,et$1(e));}async getRelayerMessages(){const e=await this.core.storage.getItem(this.storageKey);return typeof e<"u"?nt$1(e):void 0}async persist(){await this.setRelayerMessages(this.messages);}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class pr extends u{constructor(e,t){super(e,t),this.relayer=e,this.logger=t,this.events=new EventEmitter,this.name=nt,this.queue=new Map,this.publishTimeout=cjs$4.toMiliseconds(cjs$4.TEN_SECONDS),this.needsTransportRestart=!1,this.publish=async(i,s,n)=>{var a;this.logger.debug("Publishing Payload"),this.logger.trace({type:"method",method:"publish",params:{topic:i,message:s,opts:n}});try{const o=n?.ttl||rt,h=mt$1(n),l=n?.prompt||!1,d=n?.tag||0,p=n?.id||getBigIntRpcId().toString(),y={topic:i,message:s,opts:{ttl:o,relay:h,prompt:l,tag:d,id:p}},$=setTimeout(()=>this.queue.set(p,y),this.publishTimeout);try{await await it$1(this.rpcPublish(i,s,o,h,l,d,p),this.publishTimeout,"Failed to publish payload, please try again."),this.removeRequestFromQueue(p),this.relayer.events.emit(D.publish,y);}catch(c){if(this.logger.debug("Publishing Payload stalled"),this.needsTransportRestart=!0,(a=n?.internal)!=null&&a.throwOnFailedPublish)throw this.removeRequestFromQueue(p),c;return}finally{clearTimeout($);}this.logger.debug("Successfully Published Payload"),this.logger.trace({type:"method",method:"publish",params:{topic:i,message:s,opts:n}});}catch(o){throw this.logger.debug("Failed to Publish Payload"),this.logger.error(o),o}},this.on=(i,s)=>{this.events.on(i,s);},this.once=(i,s)=>{this.events.once(i,s);},this.off=(i,s)=>{this.events.off(i,s);},this.removeListener=(i,s)=>{this.events.removeListener(i,s);},this.relayer=e,this.logger=cjs$3.generateChildLogger(t,this.name),this.registerEventListeners();}get context(){return cjs$3.getLoggerContext(this.logger)}rpcPublish(e,t,i,s,n,a,o){var h,l,d,p;const y={method:yt$1(s.protocol).publish,params:{topic:e,message:t,ttl:i,prompt:n,tag:a},id:o};return w$1((h=y.params)==null?void 0:h.prompt)&&((l=y.params)==null||delete l.prompt),w$1((d=y.params)==null?void 0:d.tag)&&((p=y.params)==null||delete p.tag),this.logger.debug("Outgoing Relay Payload"),this.logger.trace({type:"message",direction:"outgoing",request:y}),this.relayer.request(y)}removeRequestFromQueue(e){this.queue.delete(e);}checkQueue(){this.queue.forEach(async e=>{const{topic:t,message:i,opts:s}=e;await this.publish(t,i,s);});}registerEventListeners(){this.relayer.core.heartbeat.on(cjs$5.HEARTBEAT_EVENTS.pulse,()=>{if(this.needsTransportRestart){this.needsTransportRestart=!1,this.relayer.events.emit(D.connection_stalled);return}this.checkQueue();}),this.relayer.on(D.message_ack,e=>{this.removeRequestFromQueue(e.id.toString());});}}class Dr{constructor(){this.map=new Map,this.set=(e,t)=>{const i=this.get(e);this.exists(e,t)||this.map.set(e,[...i,t]);},this.get=e=>this.map.get(e)||[],this.exists=(e,t)=>this.get(e).includes(t),this.delete=(e,t)=>{if(typeof t>"u"){this.map.delete(e);return}if(!this.map.has(e))return;const i=this.get(e);if(!this.exists(e,t))return;const s=i.filter(n=>n!==t);if(!s.length){this.map.delete(e);return}this.map.set(e,s);},this.clear=()=>{this.map.clear();};}get topics(){return Array.from(this.map.keys())}}var yr=Object.defineProperty,br=Object.defineProperties,mr=Object.getOwnPropertyDescriptors,Tt=Object.getOwnPropertySymbols,fr=Object.prototype.hasOwnProperty,Er=Object.prototype.propertyIsEnumerable,St=(r,e,t)=>e in r?yr(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t,B=(r,e)=>{for(var t in e||(e={}))fr.call(e,t)&&St(r,t,e[t]);if(Tt)for(var t of Tt(e))Er.call(e,t)&&St(r,t,e[t]);return r},pe$1=(r,e)=>br(r,mr(e));class Pt extends d{constructor(e,t){super(e,t),this.relayer=e,this.logger=t,this.subscriptions=new Map,this.topicMap=new Dr,this.events=new EventEmitter,this.name=Dt,this.version=yt,this.pending=new Map,this.cached=[],this.initialized=!1,this.pendingSubscriptionWatchLabel="pending_sub_watch_label",this.pollingInterval=20,this.storagePrefix=x,this.subscribeTimeout=1e4,this.restartInProgress=!1,this.batchSubscribeTopicsLimit=500,this.init=async()=>{this.initialized||(this.logger.trace("Initialized"),this.registerEventListeners(),this.clientId=await this.relayer.core.crypto.getClientId());},this.subscribe=async(i,s)=>{await this.restartToComplete(),this.isInitialized(),this.logger.debug("Subscribing Topic"),this.logger.trace({type:"method",method:"subscribe",params:{topic:i,opts:s}});try{const n=mt$1(s),a={topic:i,relay:n};this.pending.set(i,a);const o=await this.rpcSubscribe(i,n);return this.onSubscribe(o,a),this.logger.debug("Successfully Subscribed Topic"),this.logger.trace({type:"method",method:"subscribe",params:{topic:i,opts:s}}),o}catch(n){throw this.logger.debug("Failed to Subscribe Topic"),this.logger.error(n),n}},this.unsubscribe=async(i,s)=>{await this.restartToComplete(),this.isInitialized(),typeof s?.id<"u"?await this.unsubscribeById(i,s.id,s):await this.unsubscribeByTopic(i,s);},this.isSubscribed=async i=>this.topics.includes(i)?!0:await new Promise((s,n)=>{const a=new cjs$4.Watch;a.start(this.pendingSubscriptionWatchLabel);const o=setInterval(()=>{!this.pending.has(i)&&this.topics.includes(i)&&(clearInterval(o),a.stop(this.pendingSubscriptionWatchLabel),s(!0)),a.elapsed(this.pendingSubscriptionWatchLabel)>=bt&&(clearInterval(o),a.stop(this.pendingSubscriptionWatchLabel),n(new Error("Subscription resolution timeout")));},this.pollingInterval);}).catch(()=>!1),this.on=(i,s)=>{this.events.on(i,s);},this.once=(i,s)=>{this.events.once(i,s);},this.off=(i,s)=>{this.events.off(i,s);},this.removeListener=(i,s)=>{this.events.removeListener(i,s);},this.restart=async()=>{this.restartInProgress=!0,await this.restore(),await this.reset(),this.restartInProgress=!1;},this.relayer=e,this.logger=cjs$3.generateChildLogger(t,this.name),this.clientId="";}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}get length(){return this.subscriptions.size}get ids(){return Array.from(this.subscriptions.keys())}get values(){return Array.from(this.subscriptions.values())}get topics(){return this.topicMap.topics}hasSubscription(e,t){let i=!1;try{i=this.getSubscription(e).topic===t;}catch{}return i}onEnable(){this.cached=[],this.initialized=!0;}onDisable(){this.cached=this.values,this.subscriptions.clear(),this.topicMap.clear();}async unsubscribeByTopic(e,t){const i=this.topicMap.get(e);await Promise.all(i.map(async s=>await this.unsubscribeById(e,s,t)));}async unsubscribeById(e,t,i){this.logger.debug("Unsubscribing Topic"),this.logger.trace({type:"method",method:"unsubscribe",params:{topic:e,id:t,opts:i}});try{const s=mt$1(i);await this.rpcUnsubscribe(e,t,s);const n=U$1("USER_DISCONNECTED",`${this.name}, ${e}`);await this.onUnsubscribe(e,t,n),this.logger.debug("Successfully Unsubscribed Topic"),this.logger.trace({type:"method",method:"unsubscribe",params:{topic:e,id:t,opts:i}});}catch(s){throw this.logger.debug("Failed to Unsubscribe Topic"),this.logger.error(s),s}}async rpcSubscribe(e,t){const i={method:yt$1(t.protocol).subscribe,params:{topic:e}};this.logger.debug("Outgoing Relay Payload"),this.logger.trace({type:"payload",direction:"outgoing",request:i});try{await await it$1(this.relayer.request(i),this.subscribeTimeout);}catch{this.logger.debug("Outgoing Relay Subscribe Payload stalled"),this.relayer.events.emit(D.connection_stalled);}return Mn(e+this.clientId)}async rpcBatchSubscribe(e){if(!e.length)return;const t=e[0].relay,i={method:yt$1(t.protocol).batchSubscribe,params:{topics:e.map(s=>s.topic)}};this.logger.debug("Outgoing Relay Payload"),this.logger.trace({type:"payload",direction:"outgoing",request:i});try{return await await it$1(this.relayer.request(i),this.subscribeTimeout)}catch{this.logger.debug("Outgoing Relay Payload stalled"),this.relayer.events.emit(D.connection_stalled);}}rpcUnsubscribe(e,t,i){const s={method:yt$1(i.protocol).unsubscribe,params:{topic:e,id:t}};return this.logger.debug("Outgoing Relay Payload"),this.logger.trace({type:"payload",direction:"outgoing",request:s}),this.relayer.request(s)}onSubscribe(e,t){this.setSubscription(e,pe$1(B({},t),{id:e})),this.pending.delete(t.topic);}onBatchSubscribe(e){e.length&&e.forEach(t=>{this.setSubscription(t.id,B({},t)),this.pending.delete(t.topic);});}async onUnsubscribe(e,t,i){this.events.removeAllListeners(t),this.hasSubscription(t,e)&&this.deleteSubscription(t,i),await this.relayer.messages.del(e);}async setRelayerSubscriptions(e){await this.relayer.core.storage.setItem(this.storageKey,e);}async getRelayerSubscriptions(){return await this.relayer.core.storage.getItem(this.storageKey)}setSubscription(e,t){this.subscriptions.has(e)||(this.logger.debug("Setting subscription"),this.logger.trace({type:"method",method:"setSubscription",id:e,subscription:t}),this.addSubscription(e,t));}addSubscription(e,t){this.subscriptions.set(e,B({},t)),this.topicMap.set(t.topic,e),this.events.emit(C$1.created,t);}getSubscription(e){this.logger.debug("Getting subscription"),this.logger.trace({type:"method",method:"getSubscription",id:e});const t=this.subscriptions.get(e);if(!t){const{message:i}=N("NO_MATCHING_KEY",`${this.name}: ${e}`);throw new Error(i)}return t}deleteSubscription(e,t){this.logger.debug("Deleting subscription"),this.logger.trace({type:"method",method:"deleteSubscription",id:e,reason:t});const i=this.getSubscription(e);this.subscriptions.delete(e),this.topicMap.delete(i.topic,e),this.events.emit(C$1.deleted,pe$1(B({},i),{reason:t}));}async persist(){await this.setRelayerSubscriptions(this.values),this.events.emit(C$1.sync);}async reset(){if(this.cached.length){const e=Math.ceil(this.cached.length/this.batchSubscribeTopicsLimit);for(let t=0;t<e;t++){const i=this.cached.splice(0,this.batchSubscribeTopicsLimit);await this.batchSubscribe(i);}}this.events.emit(C$1.resubscribed);}async restore(){try{const e=await this.getRelayerSubscriptions();if(typeof e>"u"||!e.length)return;if(this.subscriptions.size){const{message:t}=N("RESTORE_WILL_OVERRIDE",this.name);throw this.logger.error(t),this.logger.error(`${this.name}: ${JSON.stringify(this.values)}`),new Error(t)}this.cached=e,this.logger.debug(`Successfully Restored subscriptions for ${this.name}`),this.logger.trace({type:"method",method:"restore",subscriptions:this.values});}catch(e){this.logger.debug(`Failed to Restore subscriptions for ${this.name}`),this.logger.error(e);}}async batchSubscribe(e){if(!e.length)return;const t=await this.rpcBatchSubscribe(e);j(t)&&this.onBatchSubscribe(t.map((i,s)=>pe$1(B({},e[s]),{id:i})));}async onConnect(){this.restartInProgress||(await this.restart(),this.onEnable());}onDisconnect(){this.onDisable();}async checkPending(){if(!this.initialized||this.relayer.transportExplicitlyClosed)return;const e=[];this.pending.forEach(t=>{e.push(t);}),await this.batchSubscribe(e);}registerEventListeners(){this.relayer.core.heartbeat.on(cjs$5.HEARTBEAT_EVENTS.pulse,async()=>{await this.checkPending();}),this.relayer.on(D.connect,async()=>{await this.onConnect();}),this.relayer.on(D.disconnect,()=>{this.onDisconnect();}),this.events.on(C$1.created,async e=>{const t=C$1.created;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,data:e}),await this.persist();}),this.events.on(C$1.deleted,async e=>{const t=C$1.deleted;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,data:e}),await this.persist();});}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}async restartToComplete(){this.restartInProgress&&await new Promise(e=>{const t=setInterval(()=>{this.restartInProgress||(clearInterval(t),e());},this.pollingInterval);});}}var wr=Object.defineProperty,Ot=Object.getOwnPropertySymbols,vr=Object.prototype.hasOwnProperty,Ir=Object.prototype.propertyIsEnumerable,xt=(r,e,t)=>e in r?wr(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t,Cr=(r,e)=>{for(var t in e||(e={}))vr.call(e,t)&&xt(r,t,e[t]);if(Ot)for(var t of Ot(e))Ir.call(e,t)&&xt(r,t,e[t]);return r};class At extends g$2{constructor(e){super(e),this.protocol="wc",this.version=2,this.events=new EventEmitter,this.name=ht,this.transportExplicitlyClosed=!1,this.initialized=!1,this.connectionAttemptInProgress=!1,this.connectionStatusPollingInterval=20,this.staleConnectionErrors=["socket hang up","socket stalled"],this.hasExperiencedNetworkDisruption=!1,this.request=async t=>{this.logger.debug("Publishing Request Payload");try{return await this.toEstablishConnection(),await this.provider.request(t)}catch(i){throw this.logger.debug("Failed to Publish Request"),this.logger.error(i),i}},this.onPayloadHandler=t=>{this.onProviderPayload(t);},this.onConnectHandler=()=>{this.events.emit(D.connect);},this.onDisconnectHandler=()=>{this.onProviderDisconnect();},this.onProviderErrorHandler=t=>{this.logger.error(t),this.events.emit(D.error,t);},this.registerProviderListeners=()=>{this.provider.on(P.payload,this.onPayloadHandler),this.provider.on(P.connect,this.onConnectHandler),this.provider.on(P.disconnect,this.onDisconnectHandler),this.provider.on(P.error,this.onProviderErrorHandler);},this.core=e.core,this.logger=typeof e.logger<"u"&&typeof e.logger!="string"?cjs$3.generateChildLogger(e.logger,this.name):cjs$3.pino(cjs$3.getDefaultLoggerOptions({level:e.logger||ot})),this.messages=new _t(this.logger,e.core),this.subscriber=new Pt(this,this.logger),this.publisher=new pr(this,this.logger),this.relayUrl=e?.relayUrl||le$1,this.projectId=e.projectId,this.provider={};}async init(){this.logger.trace("Initialized"),this.registerEventListeners(),await this.createProvider(),await Promise.all([this.messages.init(),this.subscriber.init()]);try{await this.transportOpen();}catch{this.logger.warn(`Connection via ${this.relayUrl} failed, attempting to connect via failover domain ${de$1}...`),await this.restartTransport(de$1);}this.initialized=!0,setTimeout(async()=>{this.subscriber.topics.length===0&&(this.logger.info("No topics subscribed to after init, closing transport"),await this.transportClose(),this.transportExplicitlyClosed=!1);},dt);}get context(){return cjs$3.getLoggerContext(this.logger)}get connected(){return this.provider.connection.connected}get connecting(){return this.provider.connection.connecting}async publish(e,t,i){this.isInitialized(),await this.publisher.publish(e,t,i),await this.recordMessageEvent({topic:e,message:t,publishedAt:Date.now()});}async subscribe(e,t){var i;this.isInitialized();let s=((i=this.subscriber.topicMap.get(e))==null?void 0:i[0])||"";return s||(await Promise.all([new Promise(n=>{this.subscriber.once(C$1.created,a=>{a.topic===e&&n();});}),new Promise(async n=>{s=await this.subscriber.subscribe(e,t),n();})]),s)}async unsubscribe(e,t){this.isInitialized(),await this.subscriber.unsubscribe(e,t);}on(e,t){this.events.on(e,t);}once(e,t){this.events.once(e,t);}off(e,t){this.events.off(e,t);}removeListener(e,t){this.events.removeListener(e,t);}async transportClose(){this.transportExplicitlyClosed=!0,this.hasExperiencedNetworkDisruption&&this.connected?await it$1(this.provider.disconnect(),1e3,"provider.disconnect()").catch(()=>this.onProviderDisconnect()):this.connected&&await this.provider.disconnect();}async transportOpen(e){if(this.transportExplicitlyClosed=!1,await this.confirmOnlineStateOrThrow(),!this.connectionAttemptInProgress){e&&e!==this.relayUrl&&(this.relayUrl=e,await this.transportClose(),await this.createProvider()),this.connectionAttemptInProgress=!0;try{await Promise.all([new Promise(t=>{if(!this.initialized)return t();this.subscriber.once(C$1.resubscribed,()=>{t();});}),new Promise(async(t,i)=>{try{await it$1(this.provider.connect(),1e4,`Socket stalled when trying to connect to ${this.relayUrl}`);}catch(s){i(s);return}t();})]);}catch(t){this.logger.error(t);const i=t;if(!this.isConnectionStalled(i.message))throw t;this.provider.events.emit(P.disconnect);}finally{this.connectionAttemptInProgress=!1,this.hasExperiencedNetworkDisruption=!1;}}}async restartTransport(e){await this.confirmOnlineStateOrThrow(),!this.connectionAttemptInProgress&&(this.relayUrl=e||this.relayUrl,await this.transportClose(),await this.createProvider(),await this.transportOpen());}async confirmOnlineStateOrThrow(){if(!await Zt())throw new Error("No internet connection detected. Please restart your network and try again.")}isConnectionStalled(e){return this.staleConnectionErrors.some(t=>e.includes(t))}async createProvider(){this.provider.connection&&this.unregisterProviderListeners();const e=await this.core.crypto.signJWT(this.relayUrl);this.provider=new JsonRpcProvider(new WsConnection(Jn({sdkVersion:lt,protocol:this.protocol,version:this.version,relayUrl:this.relayUrl,projectId:this.projectId,auth:e,useOnCloseEvent:!0}))),this.registerProviderListeners();}async recordMessageEvent(e){const{topic:t,message:i}=e;await this.messages.set(t,i);}async shouldIgnoreMessageEvent(e){const{topic:t,message:i}=e;if(!i||i.length===0)return this.logger.debug(`Ignoring invalid/empty message: ${i}`),!0;if(!await this.subscriber.isSubscribed(t))return this.logger.debug(`Ignoring message for non-subscribed topic ${t}`),!0;const s=this.messages.has(t,i);return s&&this.logger.debug(`Ignoring duplicate message: ${i}`),s}async onProviderPayload(e){if(this.logger.debug("Incoming Relay Payload"),this.logger.trace({type:"payload",direction:"incoming",payload:e}),isJsonRpcRequest(e)){if(!e.method.endsWith(ct))return;const t=e.params,{topic:i,message:s,publishedAt:n}=t.data,a={topic:i,message:s,publishedAt:n};this.logger.debug("Emitting Relayer Payload"),this.logger.trace(Cr({type:"event",event:t.id},a)),this.events.emit(t.id,a),await this.acknowledgePayload(e),await this.onMessageEvent(a);}else isJsonRpcResponse(e)&&this.events.emit(D.message_ack,e);}async onMessageEvent(e){await this.shouldIgnoreMessageEvent(e)||(this.events.emit(D.message,e),await this.recordMessageEvent(e));}async acknowledgePayload(e){const t=formatJsonRpcResult(e.id,!0);await this.provider.connection.send(t);}unregisterProviderListeners(){this.provider.off(P.payload,this.onPayloadHandler),this.provider.off(P.connect,this.onConnectHandler),this.provider.off(P.disconnect,this.onDisconnectHandler),this.provider.off(P.error,this.onProviderErrorHandler);}async registerEventListeners(){this.events.on(D.connection_stalled,()=>{this.restartTransport().catch(t=>this.logger.error(t));});let e=await Zt();Xt(async t=>{this.initialized&&e!==t&&(e=t,t?await this.restartTransport().catch(i=>this.logger.error(i)):(this.hasExperiencedNetworkDisruption=!0,await this.transportClose().catch(i=>this.logger.error(i))));});}onProviderDisconnect(){this.events.emit(D.disconnect),this.attemptToReconnect();}attemptToReconnect(){this.transportExplicitlyClosed||(this.logger.info("attemptToReconnect called. Connecting..."),setTimeout(async()=>{await this.restartTransport().catch(e=>this.logger.error(e));},cjs$4.toMiliseconds(ut)));}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}async toEstablishConnection(){if(await this.confirmOnlineStateOrThrow(),!this.connected){if(this.connectionAttemptInProgress)return await new Promise(e=>{const t=setInterval(()=>{this.connected&&(clearInterval(t),e());},this.connectionStatusPollingInterval);});await this.restartTransport();}}}var Rr=Object.defineProperty,zt=Object.getOwnPropertySymbols,_r=Object.prototype.hasOwnProperty,Tr=Object.prototype.propertyIsEnumerable,Nt=(r,e,t)=>e in r?Rr(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t,Lt=(r,e)=>{for(var t in e||(e={}))_r.call(e,t)&&Nt(r,t,e[t]);if(zt)for(var t of zt(e))Tr.call(e,t)&&Nt(r,t,e[t]);return r};class Ut extends p$1{constructor(e,t,i,s=x,n=void 0){super(e,t,i,s),this.core=e,this.logger=t,this.name=i,this.map=new Map,this.version=gt,this.cached=[],this.initialized=!1,this.storagePrefix=x,this.init=async()=>{this.initialized||(this.logger.trace("Initialized"),await this.restore(),this.cached.forEach(a=>{this.getKey&&a!==null&&!w$1(a)?this.map.set(this.getKey(a),a):Dt$1(a)?this.map.set(a.id,a):kt$1(a)&&this.map.set(a.topic,a);}),this.cached=[],this.initialized=!0);},this.set=async(a,o)=>{this.isInitialized(),this.map.has(a)?await this.update(a,o):(this.logger.debug("Setting value"),this.logger.trace({type:"method",method:"set",key:a,value:o}),this.map.set(a,o),await this.persist());},this.get=a=>(this.isInitialized(),this.logger.debug("Getting value"),this.logger.trace({type:"method",method:"get",key:a}),this.getData(a)),this.getAll=a=>(this.isInitialized(),a?this.values.filter(o=>Object.keys(a).every(h=>Mi(o[h],a[h]))):this.values),this.update=async(a,o)=>{this.isInitialized(),this.logger.debug("Updating value"),this.logger.trace({type:"method",method:"update",key:a,update:o});const h=Lt(Lt({},this.getData(a)),o);this.map.set(a,h),await this.persist();},this.delete=async(a,o)=>{this.isInitialized(),this.map.has(a)&&(this.logger.debug("Deleting value"),this.logger.trace({type:"method",method:"delete",key:a,reason:o}),this.map.delete(a),await this.persist());},this.logger=cjs$3.generateChildLogger(t,this.name),this.storagePrefix=s,this.getKey=n;}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}get length(){return this.map.size}get keys(){return Array.from(this.map.keys())}get values(){return Array.from(this.map.values())}async setDataStore(e){await this.core.storage.setItem(this.storageKey,e);}async getDataStore(){return await this.core.storage.getItem(this.storageKey)}getData(e){const t=this.map.get(e);if(!t){const{message:i}=N("NO_MATCHING_KEY",`${this.name}: ${e}`);throw this.logger.error(i),new Error(i)}return t}async persist(){await this.setDataStore(this.values);}async restore(){try{const e=await this.getDataStore();if(typeof e>"u"||!e.length)return;if(this.map.size){const{message:t}=N("RESTORE_WILL_OVERRIDE",this.name);throw this.logger.error(t),new Error(t)}this.cached=e,this.logger.debug(`Successfully Restored value for ${this.name}`),this.logger.trace({type:"method",method:"restore",value:this.values});}catch(e){this.logger.debug(`Failed to Restore value for ${this.name}`),this.logger.error(e);}}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class Ft{constructor(e,t){this.core=e,this.logger=t,this.name=mt,this.version=ft,this.events=new EventEmitter,this.initialized=!1,this.storagePrefix=x,this.ignoredPayloadTypes=[_],this.registeredMethods=[],this.init=async()=>{this.initialized||(await this.pairings.init(),await this.cleanup(),this.registerRelayerEvents(),this.registerExpirerEvents(),this.initialized=!0,this.logger.trace("Initialized"));},this.register=({methods:i})=>{this.isInitialized(),this.registeredMethods=[...new Set([...this.registeredMethods,...i])];},this.create=async()=>{this.isInitialized();const i=Dn(),s=await this.core.crypto.setSymKey(i),n=lt$1(cjs$4.FIVE_MINUTES),a={protocol:at},o={topic:s,expiry:n,relay:a,active:!1},h=Nt$1({protocol:this.core.protocol,version:this.core.version,topic:s,symKey:i,relay:a});return await this.pairings.set(s,o),await this.core.relayer.subscribe(s),this.core.expirer.set(s,n),{topic:s,uri:h}},this.pair=async i=>{this.isInitialized(),this.isValidPair(i);const{topic:s,symKey:n,relay:a}=bt$1(i.uri);if(this.pairings.keys.includes(s))throw new Error(`Pairing already exists: ${s}`);if(this.core.crypto.hasKeys(s))throw new Error(`Keychain already exists: ${s}`);const o=lt$1(cjs$4.FIVE_MINUTES),h={topic:s,relay:a,expiry:o,active:!1};return await this.pairings.set(s,h),await this.core.crypto.setSymKey(n,s),await this.core.relayer.subscribe(s,{relay:a}),this.core.expirer.set(s,o),i.activatePairing&&await this.activate({topic:s}),h},this.activate=async({topic:i})=>{this.isInitialized();const s=lt$1(cjs$4.THIRTY_DAYS);await this.pairings.update(i,{active:!0,expiry:s}),this.core.expirer.set(i,s);},this.ping=async i=>{this.isInitialized(),await this.isValidPing(i);const{topic:s}=i;if(this.pairings.keys.includes(s)){const n=await this.sendRequest(s,"wc_pairingPing",{}),{done:a,resolve:o,reject:h}=st$1();this.events.once(ft$1("pairing_ping",n),({error:l})=>{l?h(l):o();}),await a();}},this.updateExpiry=async({topic:i,expiry:s})=>{this.isInitialized(),await this.pairings.update(i,{expiry:s});},this.updateMetadata=async({topic:i,metadata:s})=>{this.isInitialized(),await this.pairings.update(i,{peerMetadata:s});},this.getPairings=()=>(this.isInitialized(),this.pairings.values),this.disconnect=async i=>{this.isInitialized(),await this.isValidDisconnect(i);const{topic:s}=i;this.pairings.keys.includes(s)&&(await this.sendRequest(s,"wc_pairingDelete",U$1("USER_DISCONNECTED")),await this.deletePairing(s));},this.sendRequest=async(i,s,n)=>{const a=formatJsonRpcRequest(s,n),o=await this.core.crypto.encode(i,a),h=F$1[s].req;return this.core.history.set(i,a),this.core.relayer.publish(i,o,h),a.id},this.sendResult=async(i,s,n)=>{const a=formatJsonRpcResult(i,n),o=await this.core.crypto.encode(s,a),h=await this.core.history.get(s,i),l=F$1[h.request.method].res;await this.core.relayer.publish(s,o,l),await this.core.history.resolve(a);},this.sendError=async(i,s,n)=>{const a=formatJsonRpcError(i,n),o=await this.core.crypto.encode(s,a),h=await this.core.history.get(s,i),l=F$1[h.request.method]?F$1[h.request.method].res:F$1.unregistered_method.res;await this.core.relayer.publish(s,o,l),await this.core.history.resolve(a);},this.deletePairing=async(i,s)=>{await this.core.relayer.unsubscribe(i),await Promise.all([this.pairings.delete(i,U$1("USER_DISCONNECTED")),this.core.crypto.deleteSymKey(i),s?Promise.resolve():this.core.expirer.del(i)]);},this.cleanup=async()=>{const i=this.pairings.getAll().filter(s=>dt$1(s.expiry));await Promise.all(i.map(s=>this.deletePairing(s.topic)));},this.onRelayEventRequest=i=>{const{topic:s,payload:n}=i;switch(n.method){case"wc_pairingPing":return this.onPairingPingRequest(s,n);case"wc_pairingDelete":return this.onPairingDeleteRequest(s,n);default:return this.onUnknownRpcMethodRequest(s,n)}},this.onRelayEventResponse=async i=>{const{topic:s,payload:n}=i,a=(await this.core.history.get(s,n.id)).request.method;switch(a){case"wc_pairingPing":return this.onPairingPingResponse(s,n);default:return this.onUnknownRpcMethodResponse(a)}},this.onPairingPingRequest=async(i,s)=>{const{id:n}=s;try{this.isValidPing({topic:i}),await this.sendResult(n,i,!0),this.events.emit("pairing_ping",{id:n,topic:i});}catch(a){await this.sendError(n,i,a),this.logger.error(a);}},this.onPairingPingResponse=(i,s)=>{const{id:n}=s;setTimeout(()=>{isJsonRpcResult(s)?this.events.emit(ft$1("pairing_ping",n),{}):isJsonRpcError(s)&&this.events.emit(ft$1("pairing_ping",n),{error:s.error});},500);},this.onPairingDeleteRequest=async(i,s)=>{const{id:n}=s;try{this.isValidDisconnect({topic:i}),await this.deletePairing(i),this.events.emit("pairing_delete",{id:n,topic:i});}catch(a){await this.sendError(n,i,a),this.logger.error(a);}},this.onUnknownRpcMethodRequest=async(i,s)=>{const{id:n,method:a}=s;try{if(this.registeredMethods.includes(a))return;const o=U$1("WC_METHOD_UNSUPPORTED",a);await this.sendError(n,i,o),this.logger.error(o);}catch(o){await this.sendError(n,i,o),this.logger.error(o);}},this.onUnknownRpcMethodResponse=i=>{this.registeredMethods.includes(i)||this.logger.error(U$1("WC_METHOD_UNSUPPORTED",i));},this.isValidPair=i=>{if(!xt$1(i)){const{message:s}=N("MISSING_OR_INVALID",`pair() params: ${i}`);throw new Error(s)}if(!jt(i.uri)){const{message:s}=N("MISSING_OR_INVALID",`pair() uri: ${i.uri}`);throw new Error(s)}},this.isValidPing=async i=>{if(!xt$1(i)){const{message:n}=N("MISSING_OR_INVALID",`ping() params: ${i}`);throw new Error(n)}const{topic:s}=i;await this.isValidPairingTopic(s);},this.isValidDisconnect=async i=>{if(!xt$1(i)){const{message:n}=N("MISSING_OR_INVALID",`disconnect() params: ${i}`);throw new Error(n)}const{topic:s}=i;await this.isValidPairingTopic(s);},this.isValidPairingTopic=async i=>{if(!h(i,!1)){const{message:s}=N("MISSING_OR_INVALID",`pairing topic should be a string: ${i}`);throw new Error(s)}if(!this.pairings.keys.includes(i)){const{message:s}=N("NO_MATCHING_KEY",`pairing topic doesn't exist: ${i}`);throw new Error(s)}if(dt$1(this.pairings.get(i).expiry)){await this.deletePairing(i);const{message:s}=N("EXPIRED",`pairing topic: ${i}`);throw new Error(s)}},this.core=e,this.logger=cjs$3.generateChildLogger(t,this.name),this.pairings=new Ut(this.core,this.logger,this.name,this.storagePrefix);}get context(){return cjs$3.getLoggerContext(this.logger)}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}registerRelayerEvents(){this.core.relayer.on(D.message,async e=>{const{topic:t,message:i}=e;if(!this.pairings.keys.includes(t)||this.ignoredPayloadTypes.includes(this.core.crypto.getPayloadType(i)))return;const s=await this.core.crypto.decode(t,i);try{isJsonRpcRequest(s)?(this.core.history.set(t,s),this.onRelayEventRequest({topic:t,payload:s})):isJsonRpcResponse(s)&&(await this.core.history.resolve(s),await this.onRelayEventResponse({topic:t,payload:s}),this.core.history.delete(t,s.id));}catch(n){this.logger.error(n);}});}registerExpirerEvents(){this.core.expirer.on(w.expired,async e=>{const{topic:t}=ut$1(e.target);t&&this.pairings.keys.includes(t)&&(await this.deletePairing(t,!0),this.events.emit("pairing_expire",{topic:t}));});}}class $t extends h$1{constructor(e,t){super(e,t),this.core=e,this.logger=t,this.records=new Map,this.events=new EventEmitter,this.name=Et,this.version=wt,this.cached=[],this.initialized=!1,this.storagePrefix=x,this.init=async()=>{this.initialized||(this.logger.trace("Initialized"),await this.restore(),this.cached.forEach(i=>this.records.set(i.id,i)),this.cached=[],this.registerEventListeners(),this.initialized=!0);},this.set=(i,s,n)=>{if(this.isInitialized(),this.logger.debug("Setting JSON-RPC request history record"),this.logger.trace({type:"method",method:"set",topic:i,request:s,chainId:n}),this.records.has(s.id))return;const a={id:s.id,topic:i,request:{method:s.method,params:s.params||null},chainId:n,expiry:lt$1(cjs$4.THIRTY_DAYS)};this.records.set(a.id,a),this.events.emit(R.created,a);},this.resolve=async i=>{if(this.isInitialized(),this.logger.debug("Updating JSON-RPC response history record"),this.logger.trace({type:"method",method:"update",response:i}),!this.records.has(i.id))return;const s=await this.getRecord(i.id);typeof s.response>"u"&&(s.response=isJsonRpcError(i)?{error:i.error}:{result:i.result},this.records.set(s.id,s),this.events.emit(R.updated,s));},this.get=async(i,s)=>(this.isInitialized(),this.logger.debug("Getting record"),this.logger.trace({type:"method",method:"get",topic:i,id:s}),await this.getRecord(s)),this.delete=(i,s)=>{this.isInitialized(),this.logger.debug("Deleting record"),this.logger.trace({type:"method",method:"delete",id:s}),this.values.forEach(n=>{if(n.topic===i){if(typeof s<"u"&&n.id!==s)return;this.records.delete(n.id),this.events.emit(R.deleted,n);}});},this.exists=async(i,s)=>(this.isInitialized(),this.records.has(s)?(await this.getRecord(s)).topic===i:!1),this.on=(i,s)=>{this.events.on(i,s);},this.once=(i,s)=>{this.events.once(i,s);},this.off=(i,s)=>{this.events.off(i,s);},this.removeListener=(i,s)=>{this.events.removeListener(i,s);},this.logger=cjs$3.generateChildLogger(t,this.name);}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}get size(){return this.records.size}get keys(){return Array.from(this.records.keys())}get values(){return Array.from(this.records.values())}get pending(){const e=[];return this.values.forEach(t=>{if(typeof t.response<"u")return;const i={topic:t.topic,request:formatJsonRpcRequest(t.request.method,t.request.params,t.id),chainId:t.chainId};return e.push(i)}),e}async setJsonRpcRecords(e){await this.core.storage.setItem(this.storageKey,e);}async getJsonRpcRecords(){return await this.core.storage.getItem(this.storageKey)}getRecord(e){this.isInitialized();const t=this.records.get(e);if(!t){const{message:i}=N("NO_MATCHING_KEY",`${this.name}: ${e}`);throw new Error(i)}return t}async persist(){await this.setJsonRpcRecords(this.values),this.events.emit(R.sync);}async restore(){try{const e=await this.getJsonRpcRecords();if(typeof e>"u"||!e.length)return;if(this.records.size){const{message:t}=N("RESTORE_WILL_OVERRIDE",this.name);throw this.logger.error(t),new Error(t)}this.cached=e,this.logger.debug(`Successfully Restored records for ${this.name}`),this.logger.trace({type:"method",method:"restore",records:this.values});}catch(e){this.logger.debug(`Failed to Restore records for ${this.name}`),this.logger.error(e);}}registerEventListeners(){this.events.on(R.created,e=>{const t=R.created;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,record:e}),this.persist();}),this.events.on(R.updated,e=>{const t=R.updated;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,record:e}),this.persist();}),this.events.on(R.deleted,e=>{const t=R.deleted;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,record:e}),this.persist();}),this.core.heartbeat.on(cjs$5.HEARTBEAT_EVENTS.pulse,()=>{this.cleanup();});}cleanup(){try{this.records.forEach(e=>{cjs$4.toMiliseconds(e.expiry||0)-Date.now()<=0&&(this.logger.info(`Deleting expired history log: ${e.id}`),this.delete(e.topic,e.id));});}catch(e){this.logger.warn(e);}}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class Mt extends E$1{constructor(e,t){super(e,t),this.core=e,this.logger=t,this.expirations=new Map,this.events=new EventEmitter,this.name=vt,this.version=It,this.cached=[],this.initialized=!1,this.storagePrefix=x,this.init=async()=>{this.initialized||(this.logger.trace("Initialized"),await this.restore(),this.cached.forEach(i=>this.expirations.set(i.target,i)),this.cached=[],this.registerEventListeners(),this.initialized=!0);},this.has=i=>{try{const s=this.formatTarget(i);return typeof this.getExpiration(s)<"u"}catch{return !1}},this.set=(i,s)=>{this.isInitialized();const n=this.formatTarget(i),a={target:n,expiry:s};this.expirations.set(n,a),this.checkExpiry(n,a),this.events.emit(w.created,{target:n,expiration:a});},this.get=i=>{this.isInitialized();const s=this.formatTarget(i);return this.getExpiration(s)},this.del=i=>{if(this.isInitialized(),this.has(i)){const s=this.formatTarget(i),n=this.getExpiration(s);this.expirations.delete(s),this.events.emit(w.deleted,{target:s,expiration:n});}},this.on=(i,s)=>{this.events.on(i,s);},this.once=(i,s)=>{this.events.once(i,s);},this.off=(i,s)=>{this.events.off(i,s);},this.removeListener=(i,s)=>{this.events.removeListener(i,s);},this.logger=cjs$3.generateChildLogger(t,this.name);}get context(){return cjs$3.getLoggerContext(this.logger)}get storageKey(){return this.storagePrefix+this.version+"//"+this.name}get length(){return this.expirations.size}get keys(){return Array.from(this.expirations.keys())}get values(){return Array.from(this.expirations.values())}formatTarget(e){if(typeof e=="string")return ct$1(e);if(typeof e=="number")return at$1(e);const{message:t}=N("UNKNOWN_TYPE",`Target type: ${typeof e}`);throw new Error(t)}async setExpirations(e){await this.core.storage.setItem(this.storageKey,e);}async getExpirations(){return await this.core.storage.getItem(this.storageKey)}async persist(){await this.setExpirations(this.values),this.events.emit(w.sync);}async restore(){try{const e=await this.getExpirations();if(typeof e>"u"||!e.length)return;if(this.expirations.size){const{message:t}=N("RESTORE_WILL_OVERRIDE",this.name);throw this.logger.error(t),new Error(t)}this.cached=e,this.logger.debug(`Successfully Restored expirations for ${this.name}`),this.logger.trace({type:"method",method:"restore",expirations:this.values});}catch(e){this.logger.debug(`Failed to Restore expirations for ${this.name}`),this.logger.error(e);}}getExpiration(e){const t=this.expirations.get(e);if(!t){const{message:i}=N("NO_MATCHING_KEY",`${this.name}: ${e}`);throw this.logger.error(i),new Error(i)}return t}checkExpiry(e,t){const{expiry:i}=t;cjs$4.toMiliseconds(i)-Date.now()<=0&&this.expire(e,t);}expire(e,t){this.expirations.delete(e),this.events.emit(w.expired,{target:e,expiration:t});}checkExpirations(){this.core.relayer.connected&&this.expirations.forEach((e,t)=>this.checkExpiry(t,e));}registerEventListeners(){this.core.heartbeat.on(cjs$5.HEARTBEAT_EVENTS.pulse,()=>this.checkExpirations()),this.events.on(w.created,e=>{const t=w.created;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,data:e}),this.persist();}),this.events.on(w.expired,e=>{const t=w.expired;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,data:e}),this.persist();}),this.events.on(w.deleted,e=>{const t=w.deleted;this.logger.info(`Emitting ${t}`),this.logger.debug({type:"event",event:t,data:e}),this.persist();});}isInitialized(){if(!this.initialized){const{message:e}=N("NOT_INITIALIZED",this.name);throw new Error(e)}}}class kt extends y{constructor(e,t){super(e,t),this.projectId=e,this.logger=t,this.name=X$1,this.initialized=!1,this.queue=[],this.verifyDisabled=!1,this.init=async i=>{if(this.verifyDisabled||H$1()||!q())return;const s=i?.verifyUrl||Q$1;this.verifyUrl!==s&&this.removeIframe(),this.verifyUrl=s;try{await this.createIframe();}catch(n){this.logger.warn(`Verify iframe failed to load: ${this.verifyUrl}`),this.logger.warn(n);}if(!this.initialized){this.removeIframe(),this.verifyUrl=ge;try{await this.createIframe();}catch(n){this.logger.error(`Verify iframe failed to load: ${this.verifyUrl}`),this.logger.error(n),this.verifyDisabled=!0;}}},this.register=async i=>{this.initialized?this.sendPost(i.attestationId):(this.addToQueue(i.attestationId),await this.init());},this.resolve=async i=>{if(this.isDevEnv)return "";const s=i?.verifyUrl||Q$1;let n="";try{n=await this.fetchAttestation(i.attestationId,s);}catch(a){this.logger.warn(`failed to resolve attestation: ${i.attestationId} from url: ${s}`),this.logger.warn(a),n=await this.fetchAttestation(i.attestationId,ge);}return n},this.fetchAttestation=async(i,s)=>{var n;this.logger.info(`resolving attestation: ${i} from url: ${s}`);const a=this.startAbortTimer(cjs$4.ONE_SECOND*2),o=await fetch(`${s}/attestation/${i}`,{signal:this.abortController.signal});return clearTimeout(a),o.status===200?(n=await o.json())==null?void 0:n.origin:""},this.addToQueue=i=>{this.queue.push(i);},this.processQueue=()=>{this.queue.length!==0&&(this.queue.forEach(i=>this.sendPost(i)),this.queue=[]);},this.sendPost=i=>{var s;try{if(!this.iframe)return;(s=this.iframe.contentWindow)==null||s.postMessage(i,"*"),this.logger.info(`postMessage sent: ${i} ${this.verifyUrl}`);}catch{}},this.createIframe=async()=>{let i;const s=n=>{n.data==="verify_ready"&&(this.initialized=!0,this.processQueue(),window.removeEventListener("message",s),i());};await Promise.race([new Promise(n=>{if(document.getElementById(X$1))return n();window.addEventListener("message",s);const a=document.createElement("iframe");a.id=X$1,a.src=`${this.verifyUrl}/${this.projectId}`,a.style.display="none",document.body.append(a),this.iframe=a,i=n;}),new Promise((n,a)=>setTimeout(()=>{window.removeEventListener("message",s),a("verify iframe load timeout");},cjs$4.toMiliseconds(cjs$4.FIVE_SECONDS)))]);},this.removeIframe=()=>{this.iframe&&(this.iframe.remove(),this.iframe=void 0,this.initialized=!1);},this.logger=cjs$3.generateChildLogger(t,this.name),this.verifyUrl=Q$1,this.abortController=new AbortController,this.isDevEnv=te()&&process.env.IS_VITEST;}get context(){return cjs$3.getLoggerContext(this.logger)}startAbortTimer(e){return this.abortController=new AbortController,setTimeout(()=>this.abortController.abort(),cjs$4.toMiliseconds(e))}}var Sr=Object.defineProperty,Kt=Object.getOwnPropertySymbols,Pr=Object.prototype.hasOwnProperty,Or=Object.prototype.propertyIsEnumerable,Bt=(r,e,t)=>e in r?Sr(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t,Vt=(r,e)=>{for(var t in e||(e={}))Pr.call(e,t)&&Bt(r,t,e[t]);if(Kt)for(var t of Kt(e))Or.call(e,t)&&Bt(r,t,e[t]);return r};class Z extends n{constructor(e){super(e),this.protocol=ce$1,this.version=Je,this.name=W,this.events=new EventEmitter,this.initialized=!1,this.on=(i,s)=>this.events.on(i,s),this.once=(i,s)=>this.events.once(i,s),this.off=(i,s)=>this.events.off(i,s),this.removeListener=(i,s)=>this.events.removeListener(i,s),this.projectId=e?.projectId,this.relayUrl=e?.relayUrl||le$1;const t=typeof e?.logger<"u"&&typeof e?.logger!="string"?e.logger:cjs$3.pino(cjs$3.getDefaultLoggerOptions({level:e?.logger||We.logger}));this.logger=cjs$3.generateChildLogger(t,this.name),this.heartbeat=new cjs$5.HeartBeat,this.crypto=new Rt(this,this.logger,e?.keychain),this.history=new $t(this,this.logger),this.expirer=new Mt(this,this.logger),this.storage=e!=null&&e.storage?e.storage:new _default(Vt(Vt({},Xe),e?.storageOptions)),this.relayer=new At({core:this,logger:this.logger,relayUrl:this.relayUrl,projectId:this.projectId}),this.pairing=new Ft(this,this.logger),this.verify=new kt(this.projectId||"",this.logger);}static async init(e){const t=new Z(e);await t.initialize();const i=await t.crypto.getClientId();return await t.storage.setItem(pt,i),t}get context(){return cjs$3.getLoggerContext(this.logger)}async start(){this.initialized||await this.initialize();}async initialize(){this.logger.trace("Initialized");try{await this.crypto.init(),await this.history.init(),await this.expirer.init(),await this.relayer.init(),await this.heartbeat.init(),await this.pairing.init(),this.initialized=!0,this.logger.info("Core Initialization Success");}catch(e){throw this.logger.warn(`Core Initialization Failure at epoch ${Date.now()}`,e),this.logger.error(e.message),e}}}const xr=Z;

const J="wc",X=2,F="client",G=`${J}@${X}:${F}:`,M={name:F,logger:"error",controller:!1,relayUrl:"wss://relay.walletconnect.com"},H="WALLETCONNECT_DEEPLINK_CHOICE",ne="proposal",oe="Proposal expired",ae="session",C=cjs$4.SEVEN_DAYS,ce="engine",V={wc_sessionPropose:{req:{ttl:cjs$4.FIVE_MINUTES,prompt:!0,tag:1100},res:{ttl:cjs$4.FIVE_MINUTES,prompt:!1,tag:1101}},wc_sessionSettle:{req:{ttl:cjs$4.FIVE_MINUTES,prompt:!1,tag:1102},res:{ttl:cjs$4.FIVE_MINUTES,prompt:!1,tag:1103}},wc_sessionUpdate:{req:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1104},res:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1105}},wc_sessionExtend:{req:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1106},res:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1107}},wc_sessionRequest:{req:{ttl:cjs$4.FIVE_MINUTES,prompt:!0,tag:1108},res:{ttl:cjs$4.FIVE_MINUTES,prompt:!1,tag:1109}},wc_sessionEvent:{req:{ttl:cjs$4.FIVE_MINUTES,prompt:!0,tag:1110},res:{ttl:cjs$4.FIVE_MINUTES,prompt:!1,tag:1111}},wc_sessionDelete:{req:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1112},res:{ttl:cjs$4.ONE_DAY,prompt:!1,tag:1113}},wc_sessionPing:{req:{ttl:cjs$4.THIRTY_SECONDS,prompt:!1,tag:1114},res:{ttl:cjs$4.THIRTY_SECONDS,prompt:!1,tag:1115}}},U={min:cjs$4.FIVE_MINUTES,max:cjs$4.SEVEN_DAYS},E={idle:"IDLE",active:"ACTIVE"},le="request",pe=["wc_sessionPropose","wc_sessionRequest","wc_authRequest"];var rs=Object.defineProperty,ns=Object.defineProperties,os=Object.getOwnPropertyDescriptors,he=Object.getOwnPropertySymbols,as=Object.prototype.hasOwnProperty,cs=Object.prototype.propertyIsEnumerable,de=(m,r,e)=>r in m?rs(m,r,{enumerable:!0,configurable:!0,writable:!0,value:e}):m[r]=e,g=(m,r)=>{for(var e in r||(r={}))as.call(r,e)&&de(m,e,r[e]);if(he)for(var e of he(r))cs.call(r,e)&&de(m,e,r[e]);return m},b=(m,r)=>ns(m,os(r));class ls extends S{constructor(r){super(r),this.name=ce,this.events=new EventEmitter,this.initialized=!1,this.ignoredPayloadTypes=[_],this.requestQueue={state:E.idle,queue:[]},this.sessionRequestQueue={state:E.idle,queue:[]},this.requestQueueDelay=cjs$4.ONE_SECOND,this.init=async()=>{this.initialized||(await this.cleanup(),this.registerRelayerEvents(),this.registerExpirerEvents(),this.client.core.pairing.register({methods:Object.keys(V)}),this.initialized=!0,setTimeout(()=>{this.sessionRequestQueue.queue=this.getPendingSessionRequests(),this.processSessionRequestQueue();},cjs$4.toMiliseconds(this.requestQueueDelay)));},this.connect=async e=>{await this.isInitialized();const s=b(g({},e),{requiredNamespaces:e.requiredNamespaces||{},optionalNamespaces:e.optionalNamespaces||{}});await this.isValidConnect(s);const{pairingTopic:t,requiredNamespaces:i,optionalNamespaces:n,sessionProperties:o,relays:a}=s;let l=t,p,d=!1;if(l&&(d=this.client.core.pairing.pairings.get(l).active),!l||!d){const{topic:v,uri:S}=await this.client.core.pairing.create();l=v,p=S;}const h=await this.client.core.crypto.generateKeyPair(),I=g({requiredNamespaces:i,optionalNamespaces:n,relays:a??[{protocol:at}],proposer:{publicKey:h,metadata:this.client.metadata}},o&&{sessionProperties:o}),{reject:w,resolve:T,done:K}=st$1(cjs$4.FIVE_MINUTES,oe);if(this.events.once(ft$1("session_connect"),async({error:v,session:S})=>{if(v)w(v);else if(S){S.self.publicKey=h;const W=b(g({},S),{requiredNamespaces:S.requiredNamespaces,optionalNamespaces:S.optionalNamespaces});await this.client.session.set(S.topic,W),await this.setExpiry(S.topic,S.expiry),l&&await this.client.core.pairing.updateMetadata({topic:l,metadata:S.peer.metadata}),T(W);}}),!l){const{message:v}=N("NO_MATCHING_KEY",`connect() pairing topic: ${l}`);throw new Error(v)}const L=await this.sendRequest({topic:l,method:"wc_sessionPropose",params:I}),ue=lt$1(cjs$4.FIVE_MINUTES);return await this.setProposal(L,g({id:L,expiry:ue},I)),{uri:p,approval:K}},this.pair=async e=>(await this.isInitialized(),await this.client.core.pairing.pair(e)),this.approve=async e=>{await this.isInitialized(),await this.isValidApprove(e);const{id:s,relayProtocol:t,namespaces:i,sessionProperties:n}=e,o=this.client.proposal.get(s);let{pairingTopic:a,proposer:l,requiredNamespaces:p,optionalNamespaces:d}=o;a=a||"",B$1(p)||(p=At$1(i,"approve()"));const h=await this.client.core.crypto.generateKeyPair(),I=l.publicKey,w=await this.client.core.crypto.generateSharedKey(h,I);a&&s&&(await this.client.core.pairing.updateMetadata({topic:a,metadata:l.metadata}),await this.sendResult({id:s,topic:a,result:{relay:{protocol:t??"irn"},responderPublicKey:h}}),await this.client.proposal.delete(s,U$1("USER_DISCONNECTED")),await this.client.core.pairing.activate({topic:a}));const T=g({relay:{protocol:t??"irn"},namespaces:i,requiredNamespaces:p,optionalNamespaces:d,pairingTopic:a,controller:{publicKey:h,metadata:this.client.metadata},expiry:lt$1(C)},n&&{sessionProperties:n});await this.client.core.relayer.subscribe(w),await this.sendRequest({topic:w,method:"wc_sessionSettle",params:T,throwOnFailedPublish:!0});const K=b(g({},T),{topic:w,pairingTopic:a,acknowledged:!1,self:T.controller,peer:{publicKey:l.publicKey,metadata:l.metadata},controller:h});return await this.client.session.set(w,K),await this.setExpiry(w,lt$1(C)),{topic:w,acknowledged:()=>new Promise(L=>setTimeout(()=>L(this.client.session.get(w)),500))}},this.reject=async e=>{await this.isInitialized(),await this.isValidReject(e);const{id:s,reason:t}=e,{pairingTopic:i}=this.client.proposal.get(s);i&&(await this.sendError(s,i,t),await this.client.proposal.delete(s,U$1("USER_DISCONNECTED")));},this.update=async e=>{await this.isInitialized(),await this.isValidUpdate(e);const{topic:s,namespaces:t}=e,i=await this.sendRequest({topic:s,method:"wc_sessionUpdate",params:{namespaces:t}}),{done:n,resolve:o,reject:a}=st$1();return this.events.once(ft$1("session_update",i),({error:l})=>{l?a(l):o();}),await this.client.session.update(s,{namespaces:t}),{acknowledged:n}},this.extend=async e=>{await this.isInitialized(),await this.isValidExtend(e);const{topic:s}=e,t=await this.sendRequest({topic:s,method:"wc_sessionExtend",params:{}}),{done:i,resolve:n,reject:o}=st$1();return this.events.once(ft$1("session_extend",t),({error:a})=>{a?o(a):n();}),await this.setExpiry(s,lt$1(C)),{acknowledged:i}},this.request=async e=>{await this.isInitialized(),await this.isValidRequest(e);const{chainId:s,request:t,topic:i,expiry:n}=e,o=payloadId(),{done:a,resolve:l,reject:p}=st$1(n);return this.events.once(ft$1("session_request",o),({error:d,result:h})=>{d?p(d):l(h);}),await Promise.all([new Promise(async d=>{await this.sendRequest({clientRpcId:o,topic:i,method:"wc_sessionRequest",params:{request:t,chainId:s},expiry:n,throwOnFailedPublish:!0}).catch(h=>p(h)),this.client.events.emit("session_request_sent",{topic:i,request:t,chainId:s,id:o}),d();}),new Promise(async d=>{const h=await this.client.core.storage.getItem(H);pt$1({id:o,topic:i,wcDeepLink:h}),d();}),a()]).then(d=>d[2])},this.respond=async e=>{await this.isInitialized(),await this.isValidRespond(e);const{topic:s,response:t}=e,{id:i}=t;isJsonRpcResult(t)?await this.sendResult({id:i,topic:s,result:t.result,throwOnFailedPublish:!0}):isJsonRpcError(t)&&await this.sendError(i,s,t.error),this.cleanupAfterResponse(e);},this.ping=async e=>{await this.isInitialized(),await this.isValidPing(e);const{topic:s}=e;if(this.client.session.keys.includes(s)){const t=await this.sendRequest({topic:s,method:"wc_sessionPing",params:{}}),{done:i,resolve:n,reject:o}=st$1();this.events.once(ft$1("session_ping",t),({error:a})=>{a?o(a):n();}),await i();}else this.client.core.pairing.pairings.keys.includes(s)&&await this.client.core.pairing.ping({topic:s});},this.emit=async e=>{await this.isInitialized(),await this.isValidEmit(e);const{topic:s,event:t,chainId:i}=e;await this.sendRequest({topic:s,method:"wc_sessionEvent",params:{event:t,chainId:i}});},this.disconnect=async e=>{await this.isInitialized(),await this.isValidDisconnect(e);const{topic:s}=e;this.client.session.keys.includes(s)?(await this.sendRequest({topic:s,method:"wc_sessionDelete",params:U$1("USER_DISCONNECTED"),throwOnFailedPublish:!0}),await this.deleteSession(s)):await this.client.core.pairing.disconnect({topic:s});},this.find=e=>(this.isInitialized(),this.client.session.getAll().filter(s=>$t$1(s,e))),this.getPendingSessionRequests=()=>(this.isInitialized(),this.client.pendingRequest.getAll()),this.cleanupDuplicatePairings=async e=>{if(e.pairingTopic)try{const s=this.client.core.pairing.pairings.get(e.pairingTopic),t=this.client.core.pairing.pairings.getAll().filter(i=>{var n,o;return ((n=i.peerMetadata)==null?void 0:n.url)&&((o=i.peerMetadata)==null?void 0:o.url)===e.peer.metadata.url&&i.topic&&i.topic!==s.topic});if(t.length===0)return;this.client.logger.info(`Cleaning up ${t.length} duplicate pairing(s)`),await Promise.all(t.map(i=>this.client.core.pairing.disconnect({topic:i.topic}))),this.client.logger.info("Duplicate pairings clean up finished");}catch(s){this.client.logger.error(s);}},this.deleteSession=async(e,s)=>{const{self:t}=this.client.session.get(e);await this.client.core.relayer.unsubscribe(e),this.client.session.delete(e,U$1("USER_DISCONNECTED")),this.client.core.crypto.keychain.has(t.publicKey)&&await this.client.core.crypto.deleteKeyPair(t.publicKey),this.client.core.crypto.keychain.has(e)&&await this.client.core.crypto.deleteSymKey(e),s||this.client.core.expirer.del(e),this.client.core.storage.removeItem(H).catch(i=>this.client.logger.warn(i));},this.deleteProposal=async(e,s)=>{await Promise.all([this.client.proposal.delete(e,U$1("USER_DISCONNECTED")),s?Promise.resolve():this.client.core.expirer.del(e)]);},this.deletePendingSessionRequest=async(e,s,t=!1)=>{await Promise.all([this.client.pendingRequest.delete(e,s),t?Promise.resolve():this.client.core.expirer.del(e)]),this.sessionRequestQueue.queue=this.sessionRequestQueue.queue.filter(i=>i.id!==e),t&&(this.sessionRequestQueue.state=E.idle);},this.setExpiry=async(e,s)=>{this.client.session.keys.includes(e)&&await this.client.session.update(e,{expiry:s}),this.client.core.expirer.set(e,s);},this.setProposal=async(e,s)=>{await this.client.proposal.set(e,s),this.client.core.expirer.set(e,s.expiry);},this.setPendingSessionRequest=async e=>{const s=V.wc_sessionRequest.req.ttl,{id:t,topic:i,params:n}=e;await this.client.pendingRequest.set(t,{id:t,topic:i,params:n}),s&&this.client.core.expirer.set(t,lt$1(s));},this.sendRequest=async e=>{const{topic:s,method:t,params:i,expiry:n,relayRpcId:o,clientRpcId:a,throwOnFailedPublish:l}=e,p=formatJsonRpcRequest(t,i,a);if(q()&&pe.includes(t)){const I=Mn(JSON.stringify(p));this.client.core.verify.register({attestationId:I});}const d=await this.client.core.crypto.encode(s,p),h=V[t].req;return n&&(h.ttl=n),o&&(h.id=o),this.client.core.history.set(s,p),l?(h.internal=b(g({},h.internal),{throwOnFailedPublish:!0}),await this.client.core.relayer.publish(s,d,h)):this.client.core.relayer.publish(s,d,h).catch(I=>this.client.logger.error(I)),p.id},this.sendResult=async e=>{const{id:s,topic:t,result:i,throwOnFailedPublish:n}=e,o=formatJsonRpcResult(s,i),a=await this.client.core.crypto.encode(t,o),l=await this.client.core.history.get(t,s),p=V[l.request.method].res;n?(p.internal=b(g({},p.internal),{throwOnFailedPublish:!0}),await this.client.core.relayer.publish(t,a,p)):this.client.core.relayer.publish(t,a,p).catch(d=>this.client.logger.error(d)),await this.client.core.history.resolve(o);},this.sendError=async(e,s,t)=>{const i=formatJsonRpcError(e,t),n=await this.client.core.crypto.encode(s,i),o=await this.client.core.history.get(s,e),a=V[o.request.method].res;this.client.core.relayer.publish(s,n,a),await this.client.core.history.resolve(i);},this.cleanup=async()=>{const e=[],s=[];this.client.session.getAll().forEach(t=>{dt$1(t.expiry)&&e.push(t.topic);}),this.client.proposal.getAll().forEach(t=>{dt$1(t.expiry)&&s.push(t.id);}),await Promise.all([...e.map(t=>this.deleteSession(t)),...s.map(t=>this.deleteProposal(t))]);},this.onRelayEventRequest=async e=>{this.requestQueue.queue.push(e),await this.processRequestsQueue();},this.processRequestsQueue=async()=>{if(this.requestQueue.state===E.active){this.client.logger.info("Request queue already active, skipping...");return}for(this.client.logger.info(`Request queue starting with ${this.requestQueue.queue.length} requests`);this.requestQueue.queue.length>0;){this.requestQueue.state=E.active;const e=this.requestQueue.queue.shift();if(e)try{this.processRequest(e),await new Promise(s=>setTimeout(s,300));}catch(s){this.client.logger.warn(s);}}this.requestQueue.state=E.idle;},this.processRequest=e=>{const{topic:s,payload:t}=e,i=t.method;switch(i){case"wc_sessionPropose":return this.onSessionProposeRequest(s,t);case"wc_sessionSettle":return this.onSessionSettleRequest(s,t);case"wc_sessionUpdate":return this.onSessionUpdateRequest(s,t);case"wc_sessionExtend":return this.onSessionExtendRequest(s,t);case"wc_sessionPing":return this.onSessionPingRequest(s,t);case"wc_sessionDelete":return this.onSessionDeleteRequest(s,t);case"wc_sessionRequest":return this.onSessionRequest(s,t);case"wc_sessionEvent":return this.onSessionEventRequest(s,t);default:return this.client.logger.info(`Unsupported request method ${i}`)}},this.onRelayEventResponse=async e=>{const{topic:s,payload:t}=e,i=(await this.client.core.history.get(s,t.id)).request.method;switch(i){case"wc_sessionPropose":return this.onSessionProposeResponse(s,t);case"wc_sessionSettle":return this.onSessionSettleResponse(s,t);case"wc_sessionUpdate":return this.onSessionUpdateResponse(s,t);case"wc_sessionExtend":return this.onSessionExtendResponse(s,t);case"wc_sessionPing":return this.onSessionPingResponse(s,t);case"wc_sessionRequest":return this.onSessionRequestResponse(s,t);default:return this.client.logger.info(`Unsupported response method ${i}`)}},this.onRelayEventUnknownPayload=e=>{const{topic:s}=e,{message:t}=N("MISSING_OR_INVALID",`Decoded payload on topic ${s} is not identifiable as a JSON-RPC request or a response.`);throw new Error(t)},this.onSessionProposeRequest=async(e,s)=>{const{params:t,id:i}=s;try{this.isValidConnect(g({},s.params));const n=lt$1(cjs$4.FIVE_MINUTES),o=g({id:i,pairingTopic:e,expiry:n},t);await this.setProposal(i,o);const a=Mn(JSON.stringify(s)),l=await this.getVerifyContext(a,o.proposer.metadata);this.client.events.emit("session_proposal",{id:i,params:o,verifyContext:l});}catch(n){await this.sendError(i,e,n),this.client.logger.error(n);}},this.onSessionProposeResponse=async(e,s)=>{const{id:t}=s;if(isJsonRpcResult(s)){const{result:i}=s;this.client.logger.trace({type:"method",method:"onSessionProposeResponse",result:i});const n=this.client.proposal.get(t);this.client.logger.trace({type:"method",method:"onSessionProposeResponse",proposal:n});const o=n.proposer.publicKey;this.client.logger.trace({type:"method",method:"onSessionProposeResponse",selfPublicKey:o});const a=i.responderPublicKey;this.client.logger.trace({type:"method",method:"onSessionProposeResponse",peerPublicKey:a});const l=await this.client.core.crypto.generateSharedKey(o,a);this.client.logger.trace({type:"method",method:"onSessionProposeResponse",sessionTopic:l});const p=await this.client.core.relayer.subscribe(l);this.client.logger.trace({type:"method",method:"onSessionProposeResponse",subscriptionId:p}),await this.client.core.pairing.activate({topic:e});}else isJsonRpcError(s)&&(await this.client.proposal.delete(t,U$1("USER_DISCONNECTED")),this.events.emit(ft$1("session_connect"),{error:s.error}));},this.onSessionSettleRequest=async(e,s)=>{const{id:t,params:i}=s;try{this.isValidSessionSettleRequest(i);const{relay:n,controller:o,expiry:a,namespaces:l,requiredNamespaces:p,optionalNamespaces:d,sessionProperties:h,pairingTopic:I}=s.params,w=g({topic:e,relay:n,expiry:a,namespaces:l,acknowledged:!0,pairingTopic:I,requiredNamespaces:p,optionalNamespaces:d,controller:o.publicKey,self:{publicKey:"",metadata:this.client.metadata},peer:{publicKey:o.publicKey,metadata:o.metadata}},h&&{sessionProperties:h});await this.sendResult({id:s.id,topic:e,result:!0}),this.events.emit(ft$1("session_connect"),{session:w}),this.cleanupDuplicatePairings(w);}catch(n){await this.sendError(t,e,n),this.client.logger.error(n);}},this.onSessionSettleResponse=async(e,s)=>{const{id:t}=s;isJsonRpcResult(s)?(await this.client.session.update(e,{acknowledged:!0}),this.events.emit(ft$1("session_approve",t),{})):isJsonRpcError(s)&&(await this.client.session.delete(e,U$1("USER_DISCONNECTED")),this.events.emit(ft$1("session_approve",t),{error:s.error}));},this.onSessionUpdateRequest=async(e,s)=>{const{params:t,id:i}=s;try{const n=`${e}_session_update`,o=er$1.get(n);if(o&&this.isRequestOutOfSync(o,i)){this.client.logger.info(`Discarding out of sync request - ${i}`);return}this.isValidUpdate(g({topic:e},t)),await this.client.session.update(e,{namespaces:t.namespaces}),await this.sendResult({id:i,topic:e,result:!0}),this.client.events.emit("session_update",{id:i,topic:e,params:t}),er$1.set(n,i);}catch(n){await this.sendError(i,e,n),this.client.logger.error(n);}},this.isRequestOutOfSync=(e,s)=>parseInt(s.toString().slice(0,-3))<=parseInt(e.toString().slice(0,-3)),this.onSessionUpdateResponse=(e,s)=>{const{id:t}=s;isJsonRpcResult(s)?this.events.emit(ft$1("session_update",t),{}):isJsonRpcError(s)&&this.events.emit(ft$1("session_update",t),{error:s.error});},this.onSessionExtendRequest=async(e,s)=>{const{id:t}=s;try{this.isValidExtend({topic:e}),await this.setExpiry(e,lt$1(C)),await this.sendResult({id:t,topic:e,result:!0}),this.client.events.emit("session_extend",{id:t,topic:e});}catch(i){await this.sendError(t,e,i),this.client.logger.error(i);}},this.onSessionExtendResponse=(e,s)=>{const{id:t}=s;isJsonRpcResult(s)?this.events.emit(ft$1("session_extend",t),{}):isJsonRpcError(s)&&this.events.emit(ft$1("session_extend",t),{error:s.error});},this.onSessionPingRequest=async(e,s)=>{const{id:t}=s;try{this.isValidPing({topic:e}),await this.sendResult({id:t,topic:e,result:!0}),this.client.events.emit("session_ping",{id:t,topic:e});}catch(i){await this.sendError(t,e,i),this.client.logger.error(i);}},this.onSessionPingResponse=(e,s)=>{const{id:t}=s;setTimeout(()=>{isJsonRpcResult(s)?this.events.emit(ft$1("session_ping",t),{}):isJsonRpcError(s)&&this.events.emit(ft$1("session_ping",t),{error:s.error});},500);},this.onSessionDeleteRequest=async(e,s)=>{const{id:t}=s;try{this.isValidDisconnect({topic:e,reason:s.params}),await Promise.all([new Promise(i=>{this.client.core.relayer.once(D.publish,async()=>{i(await this.deleteSession(e));});}),this.sendResult({id:t,topic:e,result:!0})]),this.client.events.emit("session_delete",{id:t,topic:e});}catch(i){this.client.logger.error(i);}},this.onSessionRequest=async(e,s)=>{const{id:t,params:i}=s;try{this.isValidRequest(g({topic:e},i)),await this.setPendingSessionRequest({id:t,topic:e,params:i}),this.addSessionRequestToSessionRequestQueue({id:t,topic:e,params:i}),await this.processSessionRequestQueue();}catch(n){await this.sendError(t,e,n),this.client.logger.error(n);}},this.onSessionRequestResponse=(e,s)=>{const{id:t}=s;isJsonRpcResult(s)?this.events.emit(ft$1("session_request",t),{result:s.result}):isJsonRpcError(s)&&this.events.emit(ft$1("session_request",t),{error:s.error});},this.onSessionEventRequest=async(e,s)=>{const{id:t,params:i}=s;try{const n=`${e}_session_event_${i.event.name}`,o=er$1.get(n);if(o&&this.isRequestOutOfSync(o,t)){this.client.logger.info(`Discarding out of sync request - ${t}`);return}this.isValidEmit(g({topic:e},i)),this.client.events.emit("session_event",{id:t,topic:e,params:i}),er$1.set(n,t);}catch(n){await this.sendError(t,e,n),this.client.logger.error(n);}},this.addSessionRequestToSessionRequestQueue=e=>{this.sessionRequestQueue.queue.push(e);},this.cleanupAfterResponse=e=>{this.deletePendingSessionRequest(e.response.id,{message:"fulfilled",code:0}),setTimeout(()=>{this.sessionRequestQueue.state=E.idle,this.processSessionRequestQueue();},cjs$4.toMiliseconds(this.requestQueueDelay));},this.processSessionRequestQueue=async()=>{if(this.sessionRequestQueue.state===E.active){this.client.logger.info("session request queue is already active.");return}const e=this.sessionRequestQueue.queue[0];if(!e){this.client.logger.info("session request queue is empty.");return}try{const{id:s,topic:t,params:i}=e,n=Mn(JSON.stringify(formatJsonRpcRequest("wc_sessionRequest",i,s))),o=this.client.session.get(t),a=await this.getVerifyContext(n,o.peer.metadata);this.sessionRequestQueue.state=E.active,this.client.events.emit("session_request",{id:s,topic:t,params:i,verifyContext:a});}catch(s){this.client.logger.error(s);}},this.isValidConnect=async e=>{if(!xt$1(e)){const{message:a}=N("MISSING_OR_INVALID",`connect() params: ${JSON.stringify(e)}`);throw new Error(a)}const{pairingTopic:s,requiredNamespaces:t,optionalNamespaces:i,sessionProperties:n,relays:o}=e;if(w$1(s)||await this.isValidPairingTopic(s),!Kt$1(o,!0)){const{message:a}=N("MISSING_OR_INVALID",`connect() relays: ${o}`);throw new Error(a)}!w$1(t)&&B$1(t)!==0&&this.validateNamespaces(t,"requiredNamespaces"),!w$1(i)&&B$1(i)!==0&&this.validateNamespaces(i,"optionalNamespaces"),w$1(n)||this.validateSessionProps(n,"sessionProperties");},this.validateNamespaces=(e,s)=>{const t=Mt$1(e,"connect()",s);if(t)throw new Error(t.message)},this.isValidApprove=async e=>{if(!xt$1(e))throw new Error(N("MISSING_OR_INVALID",`approve() params: ${e}`).message);const{id:s,namespaces:t,relayProtocol:i,sessionProperties:n}=e;await this.isValidProposalId(s);const o=this.client.proposal.get(s),a=cn(t,"approve()");if(a)throw new Error(a.message);const l=un(o.requiredNamespaces,t,"approve()");if(l)throw new Error(l.message);if(!h(i,!0)){const{message:p}=N("MISSING_OR_INVALID",`approve() relayProtocol: ${i}`);throw new Error(p)}w$1(n)||this.validateSessionProps(n,"sessionProperties");},this.isValidReject=async e=>{if(!xt$1(e)){const{message:i}=N("MISSING_OR_INVALID",`reject() params: ${e}`);throw new Error(i)}const{id:s,reason:t}=e;if(await this.isValidProposalId(s),!Ft$1(t)){const{message:i}=N("MISSING_OR_INVALID",`reject() reason: ${JSON.stringify(t)}`);throw new Error(i)}},this.isValidSessionSettleRequest=e=>{if(!xt$1(e)){const{message:l}=N("MISSING_OR_INVALID",`onSessionSettleRequest() params: ${e}`);throw new Error(l)}const{relay:s,controller:t,namespaces:i,expiry:n}=e;if(!an(s)){const{message:l}=N("MISSING_OR_INVALID","onSessionSettleRequest() relay protocol should be a string");throw new Error(l)}const o=Vt$1(t,"onSessionSettleRequest()");if(o)throw new Error(o.message);const a=cn(i,"onSessionSettleRequest()");if(a)throw new Error(a.message);if(dt$1(n)){const{message:l}=N("EXPIRED","onSessionSettleRequest()");throw new Error(l)}},this.isValidUpdate=async e=>{if(!xt$1(e)){const{message:a}=N("MISSING_OR_INVALID",`update() params: ${e}`);throw new Error(a)}const{topic:s,namespaces:t}=e;await this.isValidSessionTopic(s);const i=this.client.session.get(s),n=cn(t,"update()");if(n)throw new Error(n.message);const o=un(i.requiredNamespaces,t,"update()");if(o)throw new Error(o.message)},this.isValidExtend=async e=>{if(!xt$1(e)){const{message:t}=N("MISSING_OR_INVALID",`extend() params: ${e}`);throw new Error(t)}const{topic:s}=e;await this.isValidSessionTopic(s);},this.isValidRequest=async e=>{if(!xt$1(e)){const{message:a}=N("MISSING_OR_INVALID",`request() params: ${e}`);throw new Error(a)}const{topic:s,request:t,chainId:i,expiry:n}=e;await this.isValidSessionTopic(s);const{namespaces:o}=this.client.session.get(s);if(!Gt(o,i)){const{message:a}=N("MISSING_OR_INVALID",`request() chainId: ${i}`);throw new Error(a)}if(!Ht(t)){const{message:a}=N("MISSING_OR_INVALID",`request() ${JSON.stringify(t)}`);throw new Error(a)}if(!Wt(o,i,t.method)){const{message:a}=N("MISSING_OR_INVALID",`request() method: ${t.method}`);throw new Error(a)}if(n&&!Qt(n,U)){const{message:a}=N("MISSING_OR_INVALID",`request() expiry: ${n}. Expiry must be a number (in seconds) between ${U.min} and ${U.max}`);throw new Error(a)}},this.isValidRespond=async e=>{if(!xt$1(e)){const{message:i}=N("MISSING_OR_INVALID",`respond() params: ${e}`);throw new Error(i)}const{topic:s,response:t}=e;if(await this.isValidSessionTopic(s),!qt(t)){const{message:i}=N("MISSING_OR_INVALID",`respond() response: ${JSON.stringify(t)}`);throw new Error(i)}},this.isValidPing=async e=>{if(!xt$1(e)){const{message:t}=N("MISSING_OR_INVALID",`ping() params: ${e}`);throw new Error(t)}const{topic:s}=e;await this.isValidSessionOrPairingTopic(s);},this.isValidEmit=async e=>{if(!xt$1(e)){const{message:o}=N("MISSING_OR_INVALID",`emit() params: ${e}`);throw new Error(o)}const{topic:s,event:t,chainId:i}=e;await this.isValidSessionTopic(s);const{namespaces:n}=this.client.session.get(s);if(!Gt(n,i)){const{message:o}=N("MISSING_OR_INVALID",`emit() chainId: ${i}`);throw new Error(o)}if(!Bt$1(t)){const{message:o}=N("MISSING_OR_INVALID",`emit() event: ${JSON.stringify(t)}`);throw new Error(o)}if(!zt$1(n,i,t.name)){const{message:o}=N("MISSING_OR_INVALID",`emit() event: ${JSON.stringify(t)}`);throw new Error(o)}},this.isValidDisconnect=async e=>{if(!xt$1(e)){const{message:t}=N("MISSING_OR_INVALID",`disconnect() params: ${e}`);throw new Error(t)}const{topic:s}=e;await this.isValidSessionOrPairingTopic(s);},this.getVerifyContext=async(e,s)=>{const t={verified:{verifyUrl:s.verifyUrl||Q$1,validation:"UNKNOWN",origin:s.url||""}};try{const i=await this.client.core.verify.resolve({attestationId:e,verifyUrl:s.verifyUrl});i&&(t.verified.origin=i,t.verified.validation=i===new URL(s.url).origin?"VALID":"INVALID");}catch(i){this.client.logger.error(i);}return this.client.logger.info(`Verify context: ${JSON.stringify(t)}`),t},this.validateSessionProps=(e,s)=>{Object.values(e).forEach(t=>{if(!h(t,!1)){const{message:i}=N("MISSING_OR_INVALID",`${s} must be in Record<string, string> format. Received: ${JSON.stringify(t)}`);throw new Error(i)}});};}async isInitialized(){if(!this.initialized){const{message:r}=N("NOT_INITIALIZED",this.name);throw new Error(r)}await this.client.core.relayer.confirmOnlineStateOrThrow();}registerRelayerEvents(){this.client.core.relayer.on(D.message,async r=>{const{topic:e,message:s}=r;if(this.ignoredPayloadTypes.includes(this.client.core.crypto.getPayloadType(s)))return;const t=await this.client.core.crypto.decode(e,s);try{isJsonRpcRequest(t)?(this.client.core.history.set(e,t),this.onRelayEventRequest({topic:e,payload:t})):isJsonRpcResponse(t)?(await this.client.core.history.resolve(t),await this.onRelayEventResponse({topic:e,payload:t}),this.client.core.history.delete(e,t.id)):this.onRelayEventUnknownPayload({topic:e,payload:t});}catch(i){this.client.logger.error(i);}});}registerExpirerEvents(){this.client.core.expirer.on(w.expired,async r=>{const{topic:e,id:s}=ut$1(r.target);if(s&&this.client.pendingRequest.keys.includes(s))return await this.deletePendingSessionRequest(s,N("EXPIRED"),!0);e?this.client.session.keys.includes(e)&&(await this.deleteSession(e,!0),this.client.events.emit("session_expire",{topic:e})):s&&(await this.deleteProposal(s,!0),this.client.events.emit("proposal_expire",{id:s}));});}isValidPairingTopic(r){if(!h(r,!1)){const{message:e}=N("MISSING_OR_INVALID",`pairing topic should be a string: ${r}`);throw new Error(e)}if(!this.client.core.pairing.pairings.keys.includes(r)){const{message:e}=N("NO_MATCHING_KEY",`pairing topic doesn't exist: ${r}`);throw new Error(e)}if(dt$1(this.client.core.pairing.pairings.get(r).expiry)){const{message:e}=N("EXPIRED",`pairing topic: ${r}`);throw new Error(e)}}async isValidSessionTopic(r){if(!h(r,!1)){const{message:e}=N("MISSING_OR_INVALID",`session topic should be a string: ${r}`);throw new Error(e)}if(!this.client.session.keys.includes(r)){const{message:e}=N("NO_MATCHING_KEY",`session topic doesn't exist: ${r}`);throw new Error(e)}if(dt$1(this.client.session.get(r).expiry)){await this.deleteSession(r);const{message:e}=N("EXPIRED",`session topic: ${r}`);throw new Error(e)}}async isValidSessionOrPairingTopic(r){if(this.client.session.keys.includes(r))await this.isValidSessionTopic(r);else if(this.client.core.pairing.pairings.keys.includes(r))this.isValidPairingTopic(r);else if(h(r,!1)){const{message:e}=N("NO_MATCHING_KEY",`session or pairing topic doesn't exist: ${r}`);throw new Error(e)}else {const{message:e}=N("MISSING_OR_INVALID",`session or pairing topic should be a string: ${r}`);throw new Error(e)}}async isValidProposalId(r){if(!Lt$1(r)){const{message:e}=N("MISSING_OR_INVALID",`proposal id should be a number: ${r}`);throw new Error(e)}if(!this.client.proposal.keys.includes(r)){const{message:e}=N("NO_MATCHING_KEY",`proposal id doesn't exist: ${r}`);throw new Error(e)}if(dt$1(this.client.proposal.get(r).expiry)){await this.deleteProposal(r);const{message:e}=N("EXPIRED",`proposal id: ${r}`);throw new Error(e)}}}class ps extends Ut{constructor(r,e){super(r,e,ne,G),this.core=r,this.logger=e;}}class hs extends Ut{constructor(r,e){super(r,e,ae,G),this.core=r,this.logger=e;}}class ds extends Ut{constructor(r,e){super(r,e,le,G,s=>s.id),this.core=r,this.logger=e;}}class Q extends b$1{constructor(r){super(r),this.protocol=J,this.version=X,this.name=M.name,this.events=new EventEmitter,this.on=(s,t)=>this.events.on(s,t),this.once=(s,t)=>this.events.once(s,t),this.off=(s,t)=>this.events.off(s,t),this.removeListener=(s,t)=>this.events.removeListener(s,t),this.removeAllListeners=s=>this.events.removeAllListeners(s),this.connect=async s=>{try{return await this.engine.connect(s)}catch(t){throw this.logger.error(t.message),t}},this.pair=async s=>{try{return await this.engine.pair(s)}catch(t){throw this.logger.error(t.message),t}},this.approve=async s=>{try{return await this.engine.approve(s)}catch(t){throw this.logger.error(t.message),t}},this.reject=async s=>{try{return await this.engine.reject(s)}catch(t){throw this.logger.error(t.message),t}},this.update=async s=>{try{return await this.engine.update(s)}catch(t){throw this.logger.error(t.message),t}},this.extend=async s=>{try{return await this.engine.extend(s)}catch(t){throw this.logger.error(t.message),t}},this.request=async s=>{try{return await this.engine.request(s)}catch(t){throw this.logger.error(t.message),t}},this.respond=async s=>{try{return await this.engine.respond(s)}catch(t){throw this.logger.error(t.message),t}},this.ping=async s=>{try{return await this.engine.ping(s)}catch(t){throw this.logger.error(t.message),t}},this.emit=async s=>{try{return await this.engine.emit(s)}catch(t){throw this.logger.error(t.message),t}},this.disconnect=async s=>{try{return await this.engine.disconnect(s)}catch(t){throw this.logger.error(t.message),t}},this.find=s=>{try{return this.engine.find(s)}catch(t){throw this.logger.error(t.message),t}},this.getPendingSessionRequests=()=>{try{return this.engine.getPendingSessionRequests()}catch(s){throw this.logger.error(s.message),s}},this.name=r?.name||M.name,this.metadata=r?.metadata||zn();const e=typeof r?.logger<"u"&&typeof r?.logger!="string"?r.logger:cjs$3.pino(cjs$3.getDefaultLoggerOptions({level:r?.logger||M.logger}));this.core=r?.core||new xr(r),this.logger=cjs$3.generateChildLogger(e,this.name),this.session=new hs(this.core,this.logger),this.proposal=new ps(this.core,this.logger),this.pendingRequest=new ds(this.core,this.logger),this.engine=new ls(this);}static async init(r){const e=new Q(r);return await e.initialize(),e}get context(){return cjs$3.getLoggerContext(this.logger)}get pairing(){return this.core.pairing.pairings}async initialize(){this.logger.trace("Initialized");try{await this.core.start(),await this.session.init(),await this.proposal.init(),await this.pendingRequest.init(),await this.engine.init(),this.core.verify.init({verifyUrl:this.metadata.verifyUrl}),this.logger.info("SignClient Initialization Success");}catch(r){throw this.logger.info("SignClient Initialization Failure"),this.logger.error(r.message),r}}}

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};
var _options, _modal, _initSignClientPromise, _signClient, _initModal, initModal_fn, _initSignClient, initSignClient_fn, _createSignClient, createSignClient_fn;
class WalletConnectModalSign {
  constructor(options) {
    // -- private -----------------------------------------------------------
    __privateAdd(this, _initModal);
    __privateAdd(this, _initSignClient);
    __privateAdd(this, _createSignClient);
    __privateAdd(this, _options, void 0);
    __privateAdd(this, _modal, void 0);
    __privateAdd(this, _initSignClientPromise, void 0);
    __privateAdd(this, _signClient, void 0);
    __privateSet(this, _options, options);
    __privateSet(this, _modal, __privateMethod(this, _initModal, initModal_fn).call(this));
    __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
  }
  // -- public ------------------------------------------------------------
  async connect(args) {
    const { requiredNamespaces, optionalNamespaces } = args;
    return new Promise(async (resolve, reject) => {
      await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
      const unsubscribeModal = __privateGet(this, _modal).subscribeModal((state) => {
        if (!state.open) {
          unsubscribeModal();
          reject(new Error("Modal closed"));
        }
      });
      const { uri, approval } = await __privateGet(this, _signClient).connect(args);
      if (uri) {
        const namespaceChains = /* @__PURE__ */ new Set();
        if (requiredNamespaces) {
          Object.values(requiredNamespaces).forEach(({ chains }) => {
            if (chains) {
              chains.forEach((chain) => namespaceChains.add(chain));
            }
          });
        }
        if (optionalNamespaces) {
          Object.values(optionalNamespaces).forEach(({ chains }) => {
            if (chains) {
              chains.forEach((chain) => namespaceChains.add(chain));
            }
          });
        }
        await __privateGet(this, _modal).openModal({ uri, chains: Array.from(namespaceChains) });
      }
      try {
        const session = await approval();
        resolve(session);
      } catch (err) {
        reject(err);
      } finally {
        unsubscribeModal();
        __privateGet(this, _modal).closeModal();
      }
    });
  }
  async disconnect(args) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    await __privateGet(this, _signClient).disconnect(args);
  }
  async request(args) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    const result = await __privateGet(this, _signClient).request(args);
    return result;
  }
  async getSessions() {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    return __privateGet(this, _signClient).session.getAll();
  }
  async getSession() {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    return __privateGet(this, _signClient).session.getAll().at(-1);
  }
  async onSessionEvent(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).on("session_event", callback);
  }
  async offSessionEvent(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).off("session_event", callback);
  }
  async onSessionUpdate(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).on("session_update", callback);
  }
  async offSessionUpdate(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).off("session_update", callback);
  }
  async onSessionDelete(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).on("session_delete", callback);
  }
  async offSessionDelete(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).off("session_delete", callback);
  }
  async onSessionExpire(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).on("session_expire", callback);
  }
  async offSessionExpire(callback) {
    await __privateMethod(this, _initSignClient, initSignClient_fn).call(this);
    __privateGet(this, _signClient).off("session_expire", callback);
  }
}
_options = new WeakMap();
_modal = new WeakMap();
_initSignClientPromise = new WeakMap();
_signClient = new WeakMap();
_initModal = new WeakSet();
initModal_fn = function() {
  const { modalOptions, projectId } = __privateGet(this, _options);
  return new WalletConnectModal(__spreadProps(__spreadValues({}, modalOptions), {
    projectId
  }));
};
_initSignClient = new WeakSet();
initSignClient_fn = async function() {
  if (__privateGet(this, _signClient)) {
    return true;
  }
  if (!__privateGet(this, _initSignClientPromise) && typeof window !== "undefined") {
    __privateSet(this, _initSignClientPromise, __privateMethod(this, _createSignClient, createSignClient_fn).call(this));
  }
  return __privateGet(this, _initSignClientPromise);
};
_createSignClient = new WeakSet();
createSignClient_fn = async function() {
  __privateSet(this, _signClient, await Q.init({
    metadata: __privateGet(this, _options).metadata,
    projectId: __privateGet(this, _options).projectId,
    relayUrl: __privateGet(this, _options).relayUrl
  }));
  const clientId = await __privateGet(this, _signClient).core.crypto.getClientId();
  try {
    localStorage.setItem("WCM_WALLETCONNECT_CLIENT_ID", clientId);
  } catch (e) {
    console.info("Unable to set client id");
  }
};

export { CoreUtil as C, EventsCtrl as E, ModalCtrl as M, OptionsCtrl as O, RouterCtrl as R, ThemeCtrl as T, WalletConnectModalSign as W, ToastCtrl as a, ExplorerCtrl as b, ConfigCtrl as c };
//# sourceMappingURL=bundle-57e0ab24.js.map
