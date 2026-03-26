"use client";

import { NextUIProvider } from "@nextui-org/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    // We initialize the QueryClient inside state so it doesn't get recreated on every render
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000, // Data stays fresh for 1 minute before background refetch
                        refetchOnWindowFocus: false, // Prevents annoying refetches when clicking around tabs
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <NextUIProvider navigate={router.push}>
                {children}
            </NextUIProvider>
        </QueryClientProvider>
    );
}