"use client";

import { Button } from "@nextui-org/react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function PageHeader({ title, queryKey }: { title: string; queryKey: string[] }) {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // This tells TanStack Query to instantly refetch the data tied to this specific page
        await queryClient.invalidateQueries({ queryKey });
        setTimeout(() => setIsRefreshing(false), 500); // Tiny delay so the UI feels responsive
    };

    return (
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-divider">
            <h2 className="text-2xl font-bold">{title}</h2>
            <Button
                variant="flat"
                startContent={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />}
                onClick={handleRefresh}
                isLoading={isRefreshing}
            >
                Refresh Data
            </Button>
        </div>
    );
}