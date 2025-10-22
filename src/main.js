import { ethers } from "ethers";
import { WalletConnectModalSign } from "@walletconnect/modal-sign-html";

/* ---------- 全局状态 ---------- */
let provider = null;
let signer = null;
let walletAddress = null;
let gasType = "XPL";
let walletConnectModal = null; // 全局 modal（保持单例）
let walletConnectSession = null;
      
const projectId = "310356f4b71b2f49dee3048bcf68240d";
const metadata = {
  name: "Xuseless Gas Airdrop",
  description: "XLayer Gas 空投申请",
  url: "https://xuseless.netlify.app",
  icons: ["https://xuseless.netlify.app/icon.png"]
};

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* ---------- 初始化 WalletConnect Modal 单例 ---------- */
function initWalletConnect() {
  if (!walletConnectModal) {
    walletConnectModal = new WalletConnectModalSign({
      projectId,
      metadata,
      themeMode: "light"
    });
  }
}

/* ---------- connect / disconnect 逻辑 ---------- */
async function connectWallet() {
  try {
    // ✅ 桌面端优先使用插件钱包
    if (!isMobile() && window.ethereum) {
      console.log("🖥️ 检测到浏览器插件钱包，使用 EIP-1193 provider");
      provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      walletAddress = await signer.getAddress();
      showToast("✅ 插件钱包连接成功：" + walletAddress);
      updateConnectBtn(walletAddress, false);
      // 🔹 桌面端监听账户变化
      if (!window.__wc_accounts_listener_added) {
        window.__wc_accounts_listener_added = true;
        window.ethereum.on("accountsChanged", (accounts) => {
          if (!accounts || accounts.length === 0) {
            walletAddress = null;
            updateConnectBtn(null, false);
            showToast("⚠️ 钱包已断开");
          } else {
            walletAddress = accounts[0];
            updateConnectBtn(walletAddress, false);
            showToast("🔄 账户已切换：" + walletAddress);
          }
        });
      }
      return;
    }

    // 移动端：WalletConnect
    initWalletConnect();

    // 如果你**不想复用 session**（空投场景），直接 connect()
    walletConnectSession = await walletConnectModal.connect({
      requiredNamespaces: {
        eip155: {
          methods: ["eth_sendTransaction", "personal_sign"],
          chains: ["eip155:196"],
          events: ["accountsChanged", "chainChanged"]
        }
      }
    });

        // 保存地址并更新 UI（移动端显示断开按钮）
    walletAddress = walletConnectSession.namespaces.eip155.accounts[0].split(":")[2];
    updateConnectBtn(walletAddress, true);
    showToast("✅ WalletConnect 连接成功：" + walletAddress);
    
    updateConnectBtn(walletAddress, true); // 第二个参数表示显示“断开按钮”
    
    } catch (err) {
      console.error("❌ 连接失败:", err);
      showToast("❌ 连接失败：" + err.message);
    }
  }

// 移动端手动断开
async function disconnectWallet() {
  try {
    if (walletConnectModal) {
      await walletConnectModal.disconnect();
    }
  } catch (e) {
    console.warn("WalletConnect 断开时出错（可忽略）:", e);
  } finally {
    walletAddress = null;
    updateConnectBtn(null, false);
    showToast("⚡ 已断开连接");
  }
}

// 修改 updateConnectBtn 支持桌面/移动端不同显示
function updateConnectBtn(address, showDisconnect = false) {
  const btn = document.getElementById("connect-btn");
  if (address) {
    btn.textContent = `已连接: ${address.slice(0,6)}...${address.slice(-4)}`;
    btn.disabled = !showDisconnect; // 桌面端禁用按钮，移动端可点击断开
    if (showDisconnect) {
      btn.textContent += " (点击断开)";
      btn.onclick = disconnectWallet;
    }
  } else {
    btn.textContent = "🔗 连接钱包";
    btn.disabled = false;
    btn.onclick = connectWallet;
  }
}

// 发放空投的钱包地址（你自己的）
const AIRDROP_WALLETS = {
  ETH: "0x592f51828160981dcece6b491c0fc68825d92249",
  BASE_ETH: "0x592f51828160981dcece6b491c0fc68825d92249",
  BNB: "0x592f51828160981dcece6b491c0fc68825d92249",
  XPL: "0x592f51828160981dcece6b491c0fc68825d92249"
};

// 对应的 RPC 节点
const RPC_ENDPOINTS = {
  ETH: "https://ethereum.publicnode.com",
  BASE_ETH: "https://mainnet.base.org",
  BNB: "https://bsc-dataseed.binance.org/",
  XPL: "https://rpc.plasma.to",
  OKB: "https://xlayerrpc.okx.com"
};

// 更新发放钱包余额
async function updateAirdropBalance() {
  const targetAddress = AIRDROP_WALLETS[gasType];
  const rpcUrl = RPC_ENDPOINTS[gasType];

  if (!targetAddress || !rpcUrl) {
    document.getElementById("wallet-balance").textContent = "未知网络";
    return;
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(targetAddress);

    const formatted = Number(ethers.utils.formatEther(balance)).toFixed(4);
    document.getElementById("wallet-balance").textContent = formatted;

    // 假设每人空投固定 0.000025 单位 Gas，估算可发放次数
    const estimate = Math.floor(Number(formatted) / 0.000025);
    document.getElementById("estimated-dispense").textContent = estimate;

  } catch (err) {
    console.error("查询发放钱包余额失败:", err);
    document.getElementById("wallet-balance").textContent = "错误";
  }
}

// 自动更新空投钱包余额
async function selectGasType(value) {
  gasType = value;
  document.querySelectorAll(".gas-option").forEach(el => el.classList.remove("selected"));
  const current = document.getElementById("opt-" + value);
  if (current) current.classList.add("selected");
  await updateAirdropBalance();
}

//主流程，提交参数
async function submitTx() {
  const txHash = document.getElementById("txHash").value.trim();
  if (!txHash || !walletAddress) {
    alert("请连接钱包并输入交易哈希");
    return;
  }

  const overlay = document.getElementById("overlay");
  const controls = document.querySelectorAll("button, input, .gas-option");

  overlay.classList.add("active");
  controls.forEach(el => el.disabled = true);

  try {
    const response = await fetch("https://xuseless.netlify.app/.netlify/functions/verifyAndSubmit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress, txHash, gasType }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(`提交失败 ❌: ${result.error || "未知错误"}`);
    } else {
      alert(`提交成功 ✅: ${result.message}`);
      document.getElementById("txHash").value = "";
    }
  } catch (err) {
    console.error(err);
    alert("网络请求失败，请稍后再试");
  } finally {
    overlay.classList.remove("active");
    controls.forEach(el => el.disabled = false);
  }
}

//粘贴到交易哈希
async function pasteHash() {
  const input = document.getElementById('txHash');
  if (!navigator.clipboard) {
    alert('当前环境不支持自动粘贴，请使用 Ctrl+V 手动粘贴');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast('剪贴板中没有内容');
      return;
    }
    input.value = text;
  } catch (err) {
    console.error(err);
    alert('读取剪贴板失败，请检查浏览器权限（需HTTPS或localhost）');
  }
}



// ✅ Toast 提示函数
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  document.body.appendChild(toast);

  // 动画显示
  setTimeout(() => toast.classList.add("show"), 50);
  // 3秒后自动消失
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// 🔹 绑定“点击购买”链接逻辑
document.getElementById("buyLink").addEventListener("click",async function (e) {
  e.preventDefault();

  // XUSELESS 合约在 XLayer 的 OKX 交易链接
  const tokenAddress = "0x6375d4ed218f7c0ec7e8245ba368206eef5d5b02";
  const okxWebUrl = "https://web3.okx.com/zh-hans/token/x-layer/0x6375d4ed218f7c0ec7e8245ba368206eef5d5b02";
  const okxAppUrl = "https://web3.okx.com/dex-swap?chain=xlayer&token=0x6375d4ed218f7c0ec7e8245ba368206eef5d5b02";
  
    // ✅ 尝试复制到剪贴板
  try {
    await navigator.clipboard.writeText(tokenAddress);
  } catch (err) {
    console.error("复制失败:", err);
  }

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod/.test(ua);

  if (isMobile) {
    // ✅ 手机端 → 直接尝试打开 OKX App
    window.location.href = okxAppUrl;
    // ⏳ 如果用户没装 App，可以在几秒后自动回退到网页端
    setTimeout(() => {
      window.location.href = okxWebUrl;
    }, 2000);
  } else {
    // ✅ 桌面端 → 打开 Web3 网页版交易界面
    window.open(okxWebUrl, "_blank");
  }
});

// ✅ 手动复制合约地址
document.getElementById("manualCopy").addEventListener("click", async function (e) {
  e.preventDefault();
  const tokenAddress = "0x6375d4ed218f7c0ec7e8245ba368206eef5d5b02";
  try {
    await navigator.clipboard.writeText(tokenAddress);
    showToast("✅ 合约地址已复制");
  } catch (err) {
    console.error("复制失败:", err);
    showToast("⚠️ 复制失败，请手动复制", "error");
  }
});

// 🔹 挂载到全局，HTML onclick 调用
window.addEventListener("load", async () => {
  if (walletConnectModal) {
    const session = await walletConnectModal.reconnectSession();
    if (session) {
      walletAddress = session.namespaces.eip155.accounts[0].split(":")[2];
      updateConnectBtn(walletAddress, true); // 显示断开按钮
    }
  }

  await selectGasType(gasType);
});

window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.selectGasType = selectGasType;
window.submitTx = submitTx;
window.pasteHash = pasteHash;

