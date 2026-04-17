"use client";

import { useParams } from "next/navigation";
import Header from "@/components/Header";
import RaceCard from "@/components/RaceCard";

export default function RacePage() {
  const params = useParams();
  const address = params.address as string;

  if (!address || !address.startsWith("0x")) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center pt-20">
          <div className="font-mono text-text-dim text-sm">Invalid market address</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header />
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-20">
        <RaceCard marketAddress={address as `0x${string}`} />
      </div>
    </main>
  );
}
