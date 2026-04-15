import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { monadTestnet } from "./contracts";

export const config = getDefaultConfig({
  appName: "EquiMarket",
  // Get a free project ID at https://cloud.walletconnect.com
  projectId: "02c57aa23e3821db44ee99097870d94d",
  chains: [monadTestnet],
  ssr: true,
});
