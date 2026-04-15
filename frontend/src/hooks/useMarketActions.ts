"use client";

import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { MARKET_ABI, USDC_ABI, CONTRACTS } from "@/lib/contracts";

// ── Approve USDC spending ──

export function useApproveUSDC() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (spender: `0x${string}`, amount: bigint) => {
    writeContract({
      address: CONTRACTS.usdc,
      abi: parseAbi(USDC_ABI),
      functionName: "approve",
      args: [spender, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

// ── Check USDC allowance ──

export function useUSDCAllowance(owner: `0x${string}` | undefined, spender: `0x${string}` | undefined) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.usdc,
    abi: parseAbi(USDC_ABI),
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!owner && !!spender },
  });

  return { allowance: (data as bigint) ?? BigInt(0), refetch };
}

// ── Buy Shares ──

export function useBuyShares(marketAddress: `0x${string}` | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buy = (outcome: number, shares: bigint) => {
    if (!marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: parseAbi(MARKET_ABI),
      functionName: "buyShares",
      args: [BigInt(outcome), shares],
    });
  };

  return { buy, isPending, isConfirming, isSuccess, error, hash };
}

// ── Sell Shares ──

export function useSellShares(marketAddress: `0x${string}` | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const sell = (outcome: number, shares: bigint) => {
    if (!marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: parseAbi(MARKET_ABI),
      functionName: "sellShares",
      args: [BigInt(outcome), shares],
    });
  };

  return { sell, isPending, isConfirming, isSuccess, error, hash };
}

// ── Claim Winnings ──

export function useClaim(marketAddress: `0x${string}` | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claim = () => {
    if (!marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: parseAbi(MARKET_ABI),
      functionName: "claim",
    });
  };

  return { claim, isPending, isConfirming, isSuccess, error, hash };
}

// ── Claim Scratch Refund ──

export function useClaimScratchRefund(marketAddress: `0x${string}` | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimRefund = (outcome: number) => {
    if (!marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: parseAbi(MARKET_ABI),
      functionName: "claimScratchRefund",
      args: [BigInt(outcome)],
    });
  };

  return { claimRefund, isPending, isConfirming, isSuccess, error, hash };
}

// ── Claim Cancel Refund ──

export function useClaimCancelRefund(marketAddress: `0x${string}` | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimRefund = () => {
    if (!marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: parseAbi(MARKET_ABI),
      functionName: "claimCancelRefund",
    });
  };

  return { claimRefund, isPending, isConfirming, isSuccess, error, hash };
}
