"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Pagination,
    Spinner,
    Tabs,
    Tab,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    Button,
    Chip,
} from "@nextui-org/react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";

const ROWS_PER_PAGE = 10;

// 1. Fetch function: Gets requests and applies the "Pending" filter if active
const fetchExchanges = async (page: number, filter: "All" | "Pending") => {
    const from = (page - 1) * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    let query = supabase
        .from("orders")
        .select("id, order_number, email, exchange_request_status, updated_at", { count: "exact" })
        .not("exchange_request_status", "is", null)
        .order("updated_at", { ascending: false })
        .range(from, to);

    if (filter === "Pending") {
        query = query.eq("exchange_request_status", "Pending");
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data, count: count ?? 0 };
};

// 2. Status Color Helper
const statusColorMap: Record<string, "warning" | "success" | "danger" | "default"> = {
    Pending: "warning",
    Approved: "success",
    Rejected: "danger",
    Completed: "default",
};

export default function ExchangesPage() {
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<"All" | "Pending">("Pending");
    const queryClient = useQueryClient();

    // 3. Query: Fetches data, auto-refetches when page or filter changes
    const { data, isLoading } = useQuery({
        queryKey: ["exchanges", page, filter],
        queryFn: () => fetchExchanges(page, filter),
    });

    // 4. Mutation: Updates the database and triggers a table refresh
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const { error } = await supabase
                .from("orders")
                .update({
                    exchange_request_status: status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            // Invalidate the cache to instantly reflect the new status in the UI
            queryClient.invalidateQueries({ queryKey: ["exchanges"] });
        },
    });

    const pages = data?.count ? Math.ceil(data.count / ROWS_PER_PAGE) : 0;

    return (
        <div className="flex flex-col h-full">
            <PageHeader title="Exchange Requests" queryKey={["exchanges"]} />

            {/* Smart Filter Toggle */}
            <div className="mb-6">
                <Tabs
                    aria-label="Exchange Filters"
                    selectedKey={filter}
                    onSelectionChange={(key) => {
                        setFilter(key as "All" | "Pending");
                        setPage(1); // Reset to page 1 when changing filters
                    }}
                    color="primary"
                    variant="light"
                >
                    <Tab key="Pending" title="Pending Action" />
                    <Tab key="All" title="All Requests" />
                </Tabs>
            </div>

            <div className="flex-1 bg-content1 p-4 rounded-xl border border-divider">
                <Table
                    aria-label="Exchange requests table"
                    bottomContent={
                        pages > 0 ? (
                            <div className="flex w-full justify-center">
                                <Pagination
                                    isCompact
                                    showControls
                                    showShadow
                                    color="primary"
                                    page={page}
                                    total={pages}
                                    onChange={(page) => setPage(page)}
                                />
                            </div>
                        ) : null
                    }
                >
                    <TableHeader>
                        <TableColumn>ORDER NUMBER</TableColumn>
                        <TableColumn>CUSTOMER EMAIL</TableColumn>
                        <TableColumn>LAST UPDATED</TableColumn>
                        <TableColumn>STATUS & ACTION</TableColumn>
                    </TableHeader>
                    <TableBody
                        items={data?.data ?? []}
                        isLoading={isLoading}
                        loadingContent={<Spinner label="Loading requests..." />}
                        emptyContent={!isLoading && "No exchange requests found."}
                    >
                        {(request) => (
                            <TableRow key={request.id}>
                                <TableCell className="font-medium">{request.order_number}</TableCell>
                                <TableCell className="text-default-500">{request.email}</TableCell>
                                <TableCell>
                                    {format(new Date(request.updated_at), "MMM d, yyyy • h:mm a")}
                                </TableCell>
                                <TableCell>
                                    {/* Database Remote Control Dropdown */}
                                    <Dropdown>
                                        <DropdownTrigger>
                                            <Button
                                                variant="flat"
                                                color={statusColorMap[request.exchange_request_status] || "default"}
                                                size="sm"
                                                endContent={<ChevronDown size={14} />}
                                                className="capitalize min-w-[110px] justify-between"
                                                isLoading={updateStatusMutation.isPending && updateStatusMutation.variables?.id === request.id}
                                            >
                                                {request.exchange_request_status}
                                            </Button>
                                        </DropdownTrigger>
                                        <DropdownMenu
                                            aria-label="Change Status"
                                            onAction={(key) => updateStatusMutation.mutate({ id: request.id, status: key as string })}
                                        >
                                            <DropdownItem key="Pending" className="text-warning">Pending</DropdownItem>
                                            <DropdownItem key="Approved" className="text-success">Approved</DropdownItem>
                                            <DropdownItem key="Rejected" className="text-danger">Rejected</DropdownItem>
                                            <DropdownItem key="Completed" className="text-default-500">Completed</DropdownItem>
                                        </DropdownMenu>
                                    </Dropdown>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}